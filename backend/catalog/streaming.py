"""On-demand full-track streaming through the local ytmp3 scraper.

Musicly keeps 30-second Deezer previews as a fallback, but the scraper can
resolve a track to a YouTube video and proxy the audio without ever writing a
file to disk. This module bridges the two services:

    browser <audio> -> Musicly /tracks/<id>/stream/ -> scraper /api/stream/<video>

Only the video id mapping is cached; audio bytes are streamed through, so no
media is stored on the Musicly side.
"""

from __future__ import annotations

import logging
import re
import time
from difflib import SequenceMatcher

import requests
from django.conf import settings
from django.core.cache import cache
from django.http import StreamingHttpResponse

logger = logging.getLogger(__name__)

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Musicly/1.0 (+https://musicly.local)",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
    }
)

SEARCH_BUDGET = 60
STREAM_TIMEOUT = (5, 90)
CHUNK = 64 * 1024
RESOLVE_TTL = 60 * 60 * 24 * 30
RESOLVE_CACHE_VERSION = 4
NEGATIVE_TTL = 20
# Rank several candidates instead of trusting the first YouTube hit. The first
# result for "artist title audio" is regularly a cover, a live take, or an
# unrelated song with the same title.
SEARCH_CANDIDATES = 5
# Only a match this good is cached for a month. A weak match stays uncached so
# the next play searches again instead of replaying the wrong upload forever.
MIN_CONFIDENT_SCORE = 0.62

_TOKEN_RE = re.compile(r"[^a-z0-9]+")
_BRACKET_RE = re.compile(r"\([^)]*\)|\[[^\]]*\]")


class StreamUnavailable(Exception):
    """Raised when the scraper cannot provide audio for a track."""


def enabled() -> bool:
    return bool((getattr(settings, "YTMP3_API", "") or "").strip())


def _base() -> str:
    return (getattr(settings, "YTMP3_API", "") or "").strip().rstrip("/")


def _normalize(value: str) -> str:
    value = (value or "").lower().replace("&", " and ")
    value = _BRACKET_RE.sub(" ", value)
    return " ".join(_TOKEN_RE.sub(" ", value).split())


def _ratio(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    return SequenceMatcher(None, left, right).ratio()


def _duration_tolerance(track) -> float:
    return max(45.0, int(track.duration or 0) * 0.25)


def _duration_mismatch(track, result: dict) -> bool:
    duration = int(track.duration or 0)
    candidate_duration = int(result.get("duration") or 0)
    if duration <= 0 or candidate_duration <= 0:
        return False
    return abs(duration - candidate_duration) > _duration_tolerance(track)


_OFFICIAL_MARKERS = (
    "official audio",
    "official video",
    "official music video",
    "official lyric video",
    "lyric video",
    "visualizer",
)
# Other versions of the same song. Matched per word so "discover" is not read
# as "cover".
_VARIANT_MARKERS = (
    "cover",
    "instrumental",
    "karaoke",
    "reaction",
    "live",
    "nightcore",
    "sped up",
    "slowed",
    "reverb",
    "8d audio",
    "tribute",
    "mashup",
    "remix",
    "acoustic",
)


def _has_marker(text: str, marker: str) -> bool:
    return re.search(rf"\b{re.escape(marker)}\b", text) is not None


def _candidate_score(track, result: dict) -> float:
    """Rank a YouTube search result against the Deezer track metadata."""
    title = _normalize(track.title)
    raw_title = (result.get("title") or "").lower()
    candidate_title = _normalize(raw_title)
    artist = _normalize(track.artist_name)
    channel = _normalize(result.get("channel") or "")

    title_score = _ratio(title, candidate_title)
    if title and title in candidate_title:
        title_score = max(title_score, 0.92)

    # The channel is the strongest signal that this is the real artist. Official
    # audio normally lives on the artist channel or on "<Artist> - Topic".
    if not artist:
        artist_score = 0.5
    elif channel == artist or channel == f"{artist} topic" or channel.startswith(f"{artist} "):
        artist_score = 1.0
    elif artist in channel:
        artist_score = 0.8
    elif artist in candidate_title:
        artist_score = 0.35
    else:
        artist_score = max(_ratio(artist, channel), _ratio(artist, candidate_title)) * 0.5

    duration = int(track.duration or 0)
    candidate_duration = int(result.get("duration") or 0)
    duration_penalty = 0.0
    if duration > 0 and candidate_duration > 0:
        tolerance = _duration_tolerance(track)
        delta = abs(duration - candidate_duration)
        duration_score = max(0.0, 1.0 - delta / tolerance)
        if delta > tolerance:
            # Music videos often include long intros/outros that are not part
            # of the song. Penalize a large mismatch so the official audio can
            # outrank the video even when the title and channel match.
            duration_penalty = min(0.5, ((delta - tolerance) / tolerance) * 0.5)
    else:
        duration_score = 0.5

    bonus = 0.0
    if any(marker in raw_title for marker in _OFFICIAL_MARKERS):
        bonus += 0.08
    if channel.endswith(" topic"):
        bonus += 0.10
    if result.get("channelVerified"):
        bonus += 0.04

    # Prefer the original studio recording. Clean/radio versions silently
    # remove profanity, and covers impersonate the real track outright.
    penalty = 0.0
    clean_markers = ("(clean)", "[clean]", "clean version", "clean edit", "clean audio", "- clean")
    if "clean" not in title and any(marker in raw_title for marker in clean_markers):
        penalty += 0.4
    if "censored" not in title and "censored" in raw_title:
        penalty += 0.4
    if "kidz bop" not in title and "kidz bop" in raw_title:
        penalty += 0.4
    for marker in _VARIANT_MARKERS:
        if marker not in title and _has_marker(raw_title, marker):
            penalty += 0.3

    return 0.5 * title_score + 0.3 * artist_score + 0.2 * duration_score + bonus - penalty - duration_penalty


def _search_results(track, limit: int, deadline: float) -> list[dict]:
    remaining = deadline - time.monotonic()
    if remaining <= 1:
        raise StreamUnavailable("Scraper search timed out.")
    query = f"{track.artist_name} {track.title}".strip() or track.title
    # Without this bias the first hit is often the long music video.
    if not re.search(r"\baudio\b", query, re.IGNORECASE):
        query = f"{query} audio"
    try:
        response = SESSION.post(
            f"{_base()}/api/search",
            json={"query": query, "limit": limit, "resolve": False},
            timeout=(min(5.0, remaining), remaining),
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise StreamUnavailable(f"Scraper search failed: {exc}") from exc

    results = [item for item in (payload.get("results") or []) if item.get("id")]
    if not results:
        raise StreamUnavailable("No YouTube match found for this track.")
    return results


def _warm_stream(video_id: str) -> None:
    """Resolve the chosen video once so the stream request has no cold start."""
    try:
        SESSION.post(
            f"{_base()}/api/search",
            json={"query": f"https://www.youtube.com/watch?v={video_id}", "resolve": True},
            timeout=(5, 30),
        ).raise_for_status()
    except requests.RequestException:
        # /api/stream resolves lazily, so a failed warm-up only costs latency.
        pass


def _search_video_id(track) -> tuple[str, bool]:
    """Pick the candidate that looks most like the official track.

    Returns the video id and whether the match is confident enough to cache.
    """
    deadline = time.monotonic() + SEARCH_BUDGET
    results = _search_results(track, SEARCH_CANDIDATES, deadline)
    best = max(results, key=lambda result: _candidate_score(track, result))
    score = _candidate_score(track, best)
    confident = score >= MIN_CONFIDENT_SCORE and not _duration_mismatch(track, best)

    if score < 0.35:
        logger.warning(
            "Low match confidence for %s - %s: %.2f (%s)",
            track.artist_name,
            track.title,
            score,
            best.get("title"),
        )
    elif not confident:
        logger.info(
            "Not caching uncertain match for %s - %s: %.2f (%s)",
            track.artist_name,
            track.title,
            score,
            best.get("title"),
        )
    return str(best["id"]), confident


def resolve_video_id(track, *, force: bool = False) -> str:
    """Return (and cache) the YouTube video id for a cached Track row."""
    key = f"yt:resolve:v{RESOLVE_CACHE_VERSION}:{track.deezer_id}"
    miss_key = f"{key}:miss"
    if force:
        # A forced retry exists because the old match stopped working. Do not
        # leave it in the cache if the fresh search also fails.
        cache.delete(key)
    else:
        cached = cache.get(key)
        if cached:
            return cached
        if cache.get(miss_key):
            raise StreamUnavailable("No YouTube match is cached for this track.")

    try:
        video_id, confident = _search_video_id(track)
    except StreamUnavailable:
        cache.set(miss_key, True, NEGATIVE_TTL)
        raise

    if confident:
        cache.set(key, video_id, RESOLVE_TTL)
    else:
        # Never pin an uncertain match; the next play must search again.
        cache.delete(key)
    cache.delete(miss_key)
    _warm_stream(video_id)
    return video_id


def _open_upstream(video_id: str, range_header: str | None):
    headers = {
        "User-Agent": "Musicly/1.0 (+https://musicly.local)",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
    }
    if range_header:
        headers["Range"] = range_header
    # Audio streams live for minutes, and several can be open at once when a
    # client switches tracks or preloads the next one. A module-level
    # requests.Session is not safe to share across those concurrent streaming
    # responses, so each upstream stream gets its own short-lived session.
    return requests.get(
        f"{_base()}/api/stream/{video_id}",
        headers=headers,
        stream=True,
        timeout=STREAM_TIMEOUT,
    )


def _iter_upstream(upstream):
    try:
        for chunk in upstream.iter_content(CHUNK):
            if chunk:
                yield chunk
    finally:
        upstream.close()


def stream_response(track, request, *, ignore_range: bool = False, force: bool = False):
    """Proxy the scraper's audio stream, preserving HTTP Range semantics.

    Returns ``None`` when the scraper is disabled or cannot serve the track so
    the caller can fall back to the Deezer preview. ``ignore_range`` is used by
    the download endpoint so a download manager's partial request cannot turn
    the saved file into a fragment. ``force`` bypasses a cached YouTube match,
    which lets the player retry after a stream URL goes stale.
    """
    if not enabled():
        return None

    range_header = None
    if not ignore_range:
        range_header = (request.headers.get("Range") or "").strip() or None

    try:
        video_id = resolve_video_id(track, force=force)
        upstream = _open_upstream(video_id, range_header)
        if upstream.status_code in (401, 403, 404):
            upstream.close()
            video_id = resolve_video_id(track, force=True)
            upstream = _open_upstream(video_id, range_header)
    except (requests.RequestException, StreamUnavailable) as exc:
        logger.warning("Full stream unavailable for %s: %s", track.deezer_id, exc)
        return None

    if upstream.status_code not in (200, 206):
        upstream.close()
        logger.warning(
            "Scraper stream returned HTTP %s for %s", upstream.status_code, track.deezer_id
        )
        return None

    response = StreamingHttpResponse(
        _iter_upstream(upstream),
        status=upstream.status_code,
        content_type=upstream.headers.get("Content-Type", "audio/mp4"),
    )
    for header in ("Content-Length", "Content-Range"):
        value = upstream.headers.get(header)
        if value:
            response[header] = value
    response["Accept-Ranges"] = upstream.headers.get("Accept-Ranges", "bytes")
    response["Cache-Control"] = "no-store"
    return response
