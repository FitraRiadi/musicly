"""Thin, cached client for the public Deezer API.

Deezer exposes a documented, key-less JSON API that returns 30 second MP3
previews, artwork and rich metadata. Musicly proxies it server side so the
browser never deals with CORS, rate limits or expiring preview tokens.
"""

from __future__ import annotations

import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Musicly/1.0 (+https://musicly.local)"})
_retry = Retry(
    total=4,
    connect=4,
    read=4,
    backoff_factor=0.6,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset({"GET"}),
)
SESSION.mount("https://", HTTPAdapter(max_retries=_retry, pool_maxsize=16))
SESSION.mount("http://", HTTPAdapter(max_retries=_retry, pool_maxsize=16))
TIMEOUT = 12


class DeezerError(Exception):
    """Raised when the upstream catalog cannot satisfy a request."""


def _cache_key(path: str, params: dict | None) -> str:
    raw = f"{path}|{sorted((params or {}).items())}"
    return "dz:" + hashlib.md5(raw.encode()).hexdigest()


def get_json(path: str, params: dict | None = None, ttl: int = 900) -> dict[str, Any]:
    key = _cache_key(path, params)
    cached = cache.get(key)
    if cached is not None:
        return cached
    url = f"{settings.DEEZER_API}/{path.lstrip('/')}"
    try:
        response = SESSION.get(url, params=params, timeout=TIMEOUT)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Deezer request failed (%s): %s", url, exc)
        raise DeezerError("The music catalog is temporarily unavailable.") from exc

    if isinstance(payload, dict) and payload.get("error"):
        message = payload["error"].get("message", "Unknown catalog error")
        raise DeezerError(message)

    cache.set(key, payload, ttl)
    return payload


# ---------------------------------------------------------------------------
# Normalizers
# ---------------------------------------------------------------------------


def _image(obj: dict | None, *keys: str) -> str:
    if not obj:
        return ""
    for key in keys:
        value = obj.get(key)
        if value:
            return value
    return ""


def normalize_track(raw: dict, *, include_album: bool = True) -> dict:
    album_raw = raw.get("album") or {}
    artist_raw = raw.get("artist") or {}
    album = None
    if include_album:
        album = {
            "id": str(album_raw.get("id", "")),
            "title": album_raw.get("title", ""),
            "cover": _image(album_raw, "cover_xl", "cover_big", "cover_medium", "cover"),
            "cover_small": _image(album_raw, "cover_small", "cover_medium", "cover"),
        }
    return {
        "id": str(raw.get("id", "")),
        "deezer_id": raw.get("id"),
        "source": "deezer",
        "title": raw.get("title") or raw.get("title_short") or "Unknown track",
        "title_short": raw.get("title_short") or raw.get("title") or "",
        "duration": raw.get("duration") or 30,
        "preview": raw.get("preview") or "",
        "explicit": bool(raw.get("explicit_lyrics") or raw.get("explicit_content_lyrics")),
        "rank": raw.get("rank") or 0,
        "release_date": album_raw.get("release_date") or raw.get("release_date") or "",
        "artist": {
            "id": str(artist_raw.get("id", "")),
            "name": artist_raw.get("name") or "Unknown artist",
            "picture": _image(artist_raw, "picture_xl", "picture_big", "picture_medium", "picture"),
        },
        "album": album,
    }


def normalize_album(raw: dict, fallback_artist: dict | None = None) -> dict:
    # Deezer's /artist/<id>/albums payload omits the nested artist, so callers
    # that already know the parent artist can pass it in to avoid "Unknown artist".
    artist_raw = raw.get("artist") or fallback_artist or {}
    return {
        "id": str(raw.get("id", "")),
        "source": "deezer",
        "title": raw.get("title") or "Unknown album",
        "cover": _image(raw, "cover_xl", "cover_big", "cover_medium", "cover"),
        "cover_small": _image(raw, "cover_small", "cover_medium", "cover"),
        "release_date": raw.get("release_date") or "",
        "nb_tracks": raw.get("nb_tracks") or 0,
        "duration": raw.get("duration") or 0,
        "record_type": raw.get("record_type") or "album",
        "artist": {
            "id": str(artist_raw.get("id", "")),
            "name": artist_raw.get("name") or "Unknown artist",
            "picture": _image(artist_raw, "picture_xl", "picture_big", "picture_medium", "picture"),
        },
    }


def normalize_artist(raw: dict) -> dict:
    return {
        "id": str(raw.get("id", "")),
        "source": "deezer",
        "name": raw.get("name") or "Unknown artist",
        "picture": _image(raw, "picture_xl", "picture_big", "picture_medium", "picture"),
        "picture_small": _image(raw, "picture_small", "picture_medium", "picture"),
        "fans": raw.get("nb_fan") or 0,
        "albums": raw.get("nb_album") or 0,
        "radio": bool(raw.get("radio")),
    }


def normalize_playlist(raw: dict) -> dict:
    owner = raw.get("creator") or raw.get("user") or {}
    title = raw.get("title") or "Playlist"
    return {
        "id": str(raw.get("id", "")),
        "source": "deezer",
        "title": title,
        # The frontend playlist contract uses `name` and an owner object,
        # matching locally-created playlists. Keep `title` as an alias for the
        # Deezer-shaped search payload.
        "name": title,
        "description": raw.get("description") or "",
        "cover": _image(raw, "picture_xl", "picture_big", "picture_medium", "picture"),
        "cover_small": _image(raw, "picture_small", "picture_medium", "picture"),
        "nb_tracks": raw.get("nb_tracks") or raw.get("nb_songs") or 0,
        "duration": raw.get("duration") or 0,
        "owner": {
            "id": owner.get("id"),
            "name": owner.get("name") or "Deezer",
            "avatar": _image(owner, "picture_xl", "picture_big", "picture_medium", "picture"),
        },
        "is_editorial": True,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


SEARCH_NORMALIZERS = {
    "track": normalize_track,
    "album": normalize_album,
    "artist": normalize_artist,
    "playlist": normalize_playlist,
}


def search(query: str, kind: str = "all", limit: int = 20, index: int = 0) -> dict:
    limit = max(1, min(limit, 50))

    if kind == "all":
        # The unified /search endpoint currently returns tracks only, so fan out
        # to the typed endpoints to build a Spotify-style "top results" page.
        per_kind = max(6, min(limit, 12))
        results: dict[str, list] = {}

        def fetch(search_kind: str):
            payload = get_json(
                f"search/{search_kind}", {"q": query, "limit": per_kind, "index": index}, ttl=600
            )
            return [SEARCH_NORMALIZERS[search_kind](item) for item in payload.get("data", [])]

        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {search_kind: pool.submit(fetch, search_kind) for search_kind in SEARCH_NORMALIZERS}
            for search_kind, future in futures.items():
                try:
                    results[search_kind] = future.result()
                except DeezerError:
                    results[search_kind] = []

        return {
            "query": query,
            "kind": "all",
            "tracks": results.get("track", []),
            "albums": results.get("album", []),
            "artists": results.get("artist", []),
            "playlists": results.get("playlist", []),
            "total": sum(len(v) for v in results.values()),
            "next": None,
        }

    payload = get_json(
        f"search/{kind}", {"q": query, "limit": limit, "index": index}, ttl=600
    )
    return {
        "query": query,
        "kind": kind,
        "items": [SEARCH_NORMALIZERS[kind](item) for item in payload.get("data", [])],
        "total": payload.get("total", 0),
        "next": payload.get("next"),
    }


def get_track(track_id: int | str, *, refresh: bool = False) -> dict:
    path = f"track/{track_id}"
    if refresh:
        # Signed Deezer preview URLs expire; bypass the cached API payload so
        # callers can obtain a fresh Preview URL when playback is requested.
        cache.delete(_cache_key(path, None))
    return normalize_track(get_json(path, ttl=3600))


def get_album(album_id: int | str) -> dict:
    raw = get_json(f"album/{album_id}", ttl=3600)
    album = normalize_album(raw)
    tracks = [normalize_track(t, include_album=False) for t in raw.get("tracks", {}).get("data", [])]
    for track in tracks:
        track["album"] = {"id": album["id"], "title": album["title"], "cover": album["cover"], "cover_small": album["cover_small"]}
    album["tracks"] = tracks
    return album


def get_artist(artist_id: int | str) -> dict:
    raw = get_json(f"artist/{artist_id}", ttl=3600)
    artist = normalize_artist(raw)
    top = get_json(f"artist/{artist_id}/top", {"limit": 15}, ttl=1800)
    albums = get_json(f"artist/{artist_id}/albums", {"limit": 40}, ttl=1800)
    related = get_json(f"artist/{artist_id}/related", {"limit": 12}, ttl=3600)
    artist["top_tracks"] = [normalize_track(t) for t in top.get("data", [])]
    seen = set()
    artist_albums = []
    artist_ref = {"id": artist["id"], "name": artist["name"], "picture": artist["picture"]}
    for item in albums.get("data", []):
        normalized = normalize_album(item, fallback_artist=artist_ref)
        if normalized["id"] in seen:
            continue
        seen.add(normalized["id"])
        artist_albums.append(normalized)
    artist["album_list"] = artist_albums
    artist["related"] = [normalize_artist(a) for a in related.get("data", [])]
    return artist


def get_artist_summary(artist_id: int | str) -> dict:
    """Lightweight artist payload for cards and editorial rows."""
    return normalize_artist(get_json(f"artist/{artist_id}", ttl=86400))


def get_playlist(playlist_id: int | str) -> dict:
    raw = get_json(f"playlist/{playlist_id}", ttl=1800)
    playlist = normalize_playlist(raw)
    tracks = []
    for position, item in enumerate(raw.get("tracks", {}).get("data", [])):
        track = normalize_track(item)
        if track["preview"]:
            tracks.append({"position": position, "track": track})
    playlist["tracks"] = tracks
    playlist["nb_tracks"] = len(tracks) or playlist["nb_tracks"]
    return playlist


def charts() -> dict:
    payload = get_json("chart/0", ttl=900)
    return {
        "tracks": [normalize_track(t) for t in payload.get("tracks", {}).get("data", [])],
        "albums": [normalize_album(a) for a in payload.get("albums", {}).get("data", [])],
        "artists": [normalize_artist(a) for a in payload.get("artists", {}).get("data", [])],
        "playlists": [normalize_playlist(p) for p in payload.get("playlists", {}).get("data", [])],
    }


def genres() -> list[dict]:
    payload = get_json("genre", ttl=86400)
    return [
        {
            "id": str(item.get("id", "")),
            "name": item.get("name", ""),
            "picture": _image(item, "picture_xl", "picture_big", "picture_medium", "picture"),
        }
        for item in payload.get("data", [])
    ]


def genre_artists(genre_id: int | str, limit: int = 24) -> dict:
    payload = get_json(f"genre/{genre_id}/artists", {"limit": limit}, ttl=3600)
    return {
        "artists": [normalize_artist(a) for a in payload.get("data", [])],
        "total": payload.get("total", 0),
    }


def editorials() -> list[dict]:
    """Deezer exposes curated playlists through the editorial charts endpoint."""
    payload = get_json("editorial/0/charts", ttl=3600)
    return [normalize_playlist(p) for p in payload.get("data", [])]
