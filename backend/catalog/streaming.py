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

SEARCH_TIMEOUT = (5, 120)
STREAM_TIMEOUT = (5, 90)
CHUNK = 64 * 1024
RESOLVE_TTL = 60 * 60 * 24 * 30
NEGATIVE_TTL = 60

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


def _candidate_score(track, result: dict) -> float:
    """Rank a YouTube search result against the Deezer track metadata."""
    title = _normalize(track.title)
    candidate_title = _normalize(result.get("title") or "")
    artist = _normalize(track.artist_name)
    channel = _normalize(result.get("channel") or "")

    title_score = _ratio(title, candidate_title)
    if title and title in candidate_title:
        title_score = max(title_score, 0.92)

    if artist and (artist in candidate_title or artist in channel):
        artist_score = 1.0
    else:
        artist_score = max(_ratio(artist, channel), _ratio(artist, candidate_title))

    duration = int(track.duration or 0)
    candidate_duration = int(result.get("duration") or 0)
    if duration > 0 and candidate_duration > 0:
        tolerance = max(45.0, duration * 0.25)
        delta = abs(duration - candidate_duration)
        duration_score = max(0.0, 1.0 - delta / tolerance)
    else:
        duration_score = 0.5

    bonus = 0.05 if "official audio" in candidate_title or "topic" in channel else 0.0
    return 0.5 * title_score + 0.3 * artist_score + 0.2 * duration_score + bonus


def _search_video_id(track) -> str:
    query = f"{track.artist_name} {track.title}".strip() or track.title
    try:
        response = SESSION.post(
            f"{_base()}/api/search",
            json={"query": query, "limit": 5},
            timeout=SEARCH_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise StreamUnavailable(f"Scraper search failed: {exc}") from exc

    results = [item for item in (payload.get("results") or []) if item.get("id")]
    if not results:
        raise StreamUnavailable("No YouTube match found for this track.")

    ranked = sorted(results, key=lambda item: _candidate_score(track, item), reverse=True)
    best = ranked[0]
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
    key = f"yt:resolve:{track.deezer_id}"
    miss_key = f"{key}:miss"
    if not force:
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
    headers = {"Accept-Encoding": "identity"}
    if range_header:
        headers["Range"] = range_header
    return SESSION.get(
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


def stream_response(track, request):
    """Proxy the scraper's audio stream, preserving HTTP Range semantics.

    Returns ``None`` when the scraper is disabled or cannot serve the track so
    the caller can fall back to the Deezer preview.
    """
    if not enabled():
        return None

    range_header = (request.headers.get("Range") or "").strip() or None

    try:
        video_id = resolve_video_id(track)
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
