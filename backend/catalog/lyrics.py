"""Lyrics lookup and cache.

LRCLIB is a free, key-less lyrics database that exposes both plain and
timestamped (LRC) lyrics. Lookups happen on demand and are cached on the track
row so repeated player opens never hit the upstream service.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import requests
from django.conf import settings
from django.utils import timezone
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .models import Track

logger = logging.getLogger(__name__)

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Musicly/1.0 (+https://musicly.local)",
        "Accept": "application/json",
    }
)
_retry = Retry(
    total=1,
    connect=1,
    read=1,
    backoff_factor=0.4,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset({"GET"}),
)
SESSION.mount("https://", HTTPAdapter(max_retries=_retry, pool_maxsize=4))
TIMEOUT = 8
CACHE_HOURS = 24


def _normalize(value: str | None) -> str:
    return " ".join((value or "").casefold().split())


def _score(candidate: dict[str, Any], track: Track) -> float:
    score = 0.0
    if _normalize(candidate.get("trackName")) == _normalize(track.title):
        score += 50
    if _normalize(candidate.get("artistName")) == _normalize(track.artist_name):
        score += 35
    if candidate.get("syncedLyrics"):
        score += 20
    if candidate.get("plainLyrics"):
        score += 5
    duration = candidate.get("duration")
    if duration and track.duration:
        score -= min(abs(float(duration) - track.duration), 60)
    return score


def _from_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    plain = (payload.get("plainLyrics") or "").strip()
    synced = (payload.get("syncedLyrics") or "").strip()
    instrumental = bool(payload.get("instrumental"))
    if not plain and not synced and not instrumental:
        return None
    return {"plain": plain, "synced": synced, "instrumental": instrumental}


def _fetch(track: Track) -> dict[str, Any] | None:
    base = settings.LRCLIB_API.rstrip("/")
    params = {
        "artist_name": track.artist_name,
        "track_name": track.title,
        "album_name": track.album_title,
        "duration": track.duration,
    }
    try:
        response = SESSION.get(f"{base}/get", params=params, timeout=TIMEOUT)
        if response.status_code == 200:
            found = _from_payload(response.json())
            if found:
                return found
        if response.status_code not in {200, 404}:
            logger.info("LRCLIB get returned %s for %s", response.status_code, track.title)
    except (requests.RequestException, ValueError) as exc:
        # LRCLIB's exact-match endpoint is occasionally unavailable; the
        # search endpoint is usually healthier and returns the same data.
        logger.info("LRCLIB get failed for %s: %s", track.title, exc)

    try:
        response = SESSION.get(
            f"{base}/search",
            params={"track_name": track.title, "artist_name": track.artist_name},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        results = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.info("LRCLIB search failed for %s: %s", track.title, exc)
        return None

    if not isinstance(results, list) or not results:
        return None
    best = max(results, key=lambda item: _score(item, track))
    best_title = _normalize(best.get("trackName"))
    target_title = _normalize(track.title)
    if not best_title or not target_title:
        return None
    if target_title not in best_title and best_title not in target_title:
        return None
    if _score(best, track) < 35:
        return None
    return _from_payload(best)


def ensure_lyrics(track: Track, force: bool = False) -> Track:
    """Populate the track's cached lyrics, respecting the negative cache."""
    if track.lyrics_plain or track.lyrics_synced or track.lyrics_instrumental:
        return track

    now = timezone.now()
    if (
        not force
        and track.lyrics_checked_at
        and now - track.lyrics_checked_at < timedelta(hours=CACHE_HOURS)
    ):
        return track

    found = _fetch(track)
    track.lyrics_checked_at = now
    update_fields = ["lyrics_checked_at"]
    if found:
        track.lyrics_plain = found["plain"]
        track.lyrics_synced = found["synced"]
        track.lyrics_instrumental = found["instrumental"]
        track.lyrics_source = "lrclib"
        update_fields.extend(
            ["lyrics_plain", "lyrics_synced", "lyrics_instrumental", "lyrics_source"]
        )
    track.save(update_fields=update_fields)
    return track


def serialize_lyrics(track: Track) -> dict[str, Any]:
    available = bool(
        track.lyrics_plain or track.lyrics_synced or track.lyrics_instrumental
    )
    return {
        "track_id": str(track.deezer_id),
        "available": available,
        "instrumental": bool(track.lyrics_instrumental),
        "plain": track.lyrics_plain,
        "synced": track.lyrics_synced,
        "source": (track.lyrics_source or "manual") if available else "",
    }
