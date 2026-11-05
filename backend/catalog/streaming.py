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
RESOLVE_CACHE_VERSION = 2
NEGATIVE_TTL = 20

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

    if artist and artist in channel:
        artist_score = 1.0
    elif artist and artist in candidate_title:
        artist_score = 0.85
    else:
        artist_score = max(_ratio(artist, channel), _ratio(artist, candidate_title))

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

    bonus = 0.05 if "official audio" in raw_title or "official video" in raw_title else 0.0
    if channel == artist or channel.endswith(" topic"):
        bonus += 0.03

    # Prefer the original studio recording. Clean/radio versions are common on
    # YouTube and silently remove profanity, which makes the song feel chopped.
    penalty = 0.0
    clean_markers = ("(clean)", "[clean]", "clean version", "clean edit", "clean audio", "- clean")
    if "clean" not in title and any(marker in raw_title for marker in clean_markers):
        penalty += 0.4
    if "censored" not in title and "censored" in raw_title:
        penalty += 0.4
    if "kidz bop" not in title and "kidz bop" in raw_title:
        penalty += 0.4
    for marker in ("live", "cover", "instrumental", "karaoke", "reaction", "sped up", "nightcore", "slowed"):
        if re.search(rf"\b{re.escape(marker)}\b", raw_title) and marker not in title:
            penalty += 0.15

    return 0.5 * title_score + 0.3 * artist_score + 0.2 * duration_score + bonus - penalty - duration_penalty


def _search_results(track, limit: int, deadline: float) -> list[dict]:
    remaining = deadline - time.monotonic()
    if remaining <= 1:
        raise StreamUnavailable("Scraper search timed out.")
    query = f"{track.artist_name} {track.title}".strip() or track.title
    try:
        response = SESSION.post(
            f"{_base()}/api/search",
            json={"query": query, "limit": limit},
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


def _search_video_id(track) -> str:
    # ``ytsearch1`` is dramatically faster than asking the scraper for five
    # results, which is what most tracks need. Only fall back to a wider search
    # when the top hit looks suspicious (live/cover/etc.) or scores poorly.
    deadline = time.monotonic() + SEARCH_BUDGET
    results = _search_results(track, 1, deadline)
    best = results[0]
    score = _candidate_score(track, best)
    title = (track.title or "").lower()
    candidate = (best.get("title") or "").lower()
    suspicious = any(
        re.search(rf"\b{re.escape(marker)}\b", candidate)
        and not re.search(rf"\b{re.escape(marker)}\b", title)
        for marker in ("live", "cover", "instrumental", "karaoke", "reaction", "sped up", "nightcore", "slowed")
    )

    if score < 0.75 or suspicious or _duration_mismatch(track, best):
        results = _search_results(track, 5, deadline)
        results.sort(key=lambda item: _candidate_score(track, item), reverse=True)
        best = results[0]
        score = _candidate_score(track, best)

    if score < 0.35:
        logger.warning(
            "Low match confidence for %s - %s: %.2f (%s)",
            track.artist_name,
            track.title,
            score,
            best.get("title"),
        )
    return str(best["id"])


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
        video_id = _search_video_id(track)
    except StreamUnavailable:
        cache.set(miss_key, True, NEGATIVE_TTL)
        raise

    cache.set(key, video_id, RESOLVE_TTL)
    cache.delete(miss_key)
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
