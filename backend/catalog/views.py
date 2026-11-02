from __future__ import annotations

import mimetypes
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import ExtractHour, TruncDate
from django.http import FileResponse, Http404, HttpResponseRedirect, StreamingHttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.serializers import UserSerializer

from . import deezer, lyrics
from .curation import SPOTLIGHT_ARTISTS, SPOTLIGHT_SUBTITLE, SPOTLIGHT_TITLE
from .models import (
    FollowedArtist,
    LikedTrack,
    PlayHistory,
    Playlist,
    PlaylistTrack,
    RecentSearch,
    Track,
)
from .serializers import (
    FollowedArtistSerializer,
    HistorySerializer,
    LikeSerializer,
    PlaylistSerializer,
    attach_local_audio,
    serialize_track,
    track_from_payload,
)


def ok(data, status_code=status.HTTP_200_OK):
    return Response(data, status=status_code)


def catalog_error(exc: deezer.DeezerError):
    return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


def resolve_track(track_id: str | int) -> Track:
    """Return a cached Track, refreshing metadata from Deezer when needed."""
    try:
        numeric_id = int(track_id)
    except (TypeError, ValueError):
        raise deezer.DeezerError("Invalid track id.")
    existing = Track.objects.filter(deezer_id=numeric_id).first()
    if existing and (existing.preview_url or existing.audio_file):
        return existing
    payload = deezer.get_track(numeric_id)
    return track_from_payload(payload)


def unique_history(user, limit=10):
    seen, items = set(), []
    for row in PlayHistory.objects.filter(user=user).select_related("track")[:80]:
        if row.track_id in seen:
            continue
        seen.add(row.track_id)
        items.append(row)
        if len(items) >= limit:
            break
    return items


def spotlight_section():
    """Editorial artist row: Rex Orange County, MCR, Radiohead and Oasis."""

    def fetch(entry):
        try:
            return deezer.get_artist_summary(entry["id"])
        except deezer.DeezerError:
            return None

    with ThreadPoolExecutor(max_workers=len(SPOTLIGHT_ARTISTS)) as pool:
        artists = [artist for artist in pool.map(fetch, SPOTLIGHT_ARTISTS) if artist]
    if len(artists) < 2:
        return None
    return {
        "id": "spotlight",
        "title": SPOTLIGHT_TITLE,
        "subtitle": SPOTLIGHT_SUBTITLE,
        "kind": "artists",
        "items": artists,
    }


class HomeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user if request.user.is_authenticated else None
        sections = []

        if user:
            history = unique_history(user, 8)
            if history:
                sections.append({
                    "id": "jump-back-in",
                    "title": "Jump back in",
                    "kind": "tracks",
                    "items": [serialize_track(row.track, user) for row in history],
                })
            liked = LikedTrack.objects.filter(user=user).select_related("track")[:8]
            if liked:
                sections.append({
                    "id": "liked",
                    "title": "Liked songs",
                    "kind": "tracks",
                    "items": [serialize_track(row.track, user) for row in liked],
                })

        try:
            chart = deezer.charts()
        except deezer.DeezerError as exc:
            if sections:
                return ok({"sections": sections, "degraded": str(exc)})
            return catalog_error(exc)

        sections.append({
            "id": "top-tracks",
            "title": "Today's top hits",
            "subtitle": "The most played tracks right now",
            "kind": "tracks",
            "items": attach_local_audio(chart["tracks"][:10], user),
        })
        spotlight = spotlight_section()
        if spotlight:
            sections.append(spotlight)
        sections.append({
            "id": "top-albums",
            "title": "New releases",
            "subtitle": "Fresh albums worth a listen",
            "kind": "albums",
            "items": chart["albums"][:10],
        })
        sections.append({
            "id": "top-artists",
            "title": "Popular artists",
            "kind": "artists",
            "items": chart["artists"][:8],
        })
        sections.append({
            "id": "editorial",
            "title": "Made for you",
            "subtitle": "Handpicked mixes from the Musicly editors",
            "kind": "playlists",
            "items": chart["playlists"][:10],
        })

        try:
            sections.append({
                "id": "genres",
                "title": "Browse by mood",
                "kind": "genres",
                "items": deezer.genres()[:12],
            })
        except deezer.DeezerError:
            pass

        if user:
            follows = list(FollowedArtist.objects.filter(user=user)[:10])
            if follows:
                sections.append({
                    "id": "following",
                    "title": "Artists you follow",
                    "kind": "artists",
                    "items": [
                        {"id": str(f.artist_id), "name": f.name, "picture": f.picture_url, "source": "follow"}
                        for f in follows
                    ],
                })

        return ok({"sections": sections, "greeting": _greeting()})


def _greeting() -> str:
    hour = timezone.localtime().hour
    if hour < 12:
        return "Good morning"
    if hour < 18:
        return "Good afternoon"
    return "Good evening"


class SearchView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        kind = request.query_params.get("type", "all")
        if kind not in {"all", "track", "album", "artist", "playlist"}:
            kind = "all"
        try:
            limit = min(int(request.query_params.get("limit", 20)), 50)
            index = max(int(request.query_params.get("index", 0)), 0)
        except ValueError:
            limit, index = 20, 0
        if not query:
            return ok({"query": "", "tracks": [], "albums": [], "artists": [], "playlists": []})
        try:
            result = deezer.search(query, kind=kind, limit=limit, index=index)
        except deezer.DeezerError as exc:
            return catalog_error(exc)
        if request.user.is_authenticated:
            RecentSearch.objects.filter(user=request.user, query__iexact=query).delete()
            RecentSearch.objects.create(user=request.user, query=query[:200])
            stale = RecentSearch.objects.filter(user=request.user)[10:]
            if stale:
                RecentSearch.objects.filter(id__in=[s.id for s in stale]).delete()
        attach_local_audio(
            result.get("tracks", []),
            request.user if request.user.is_authenticated else None,
        )
        if result.get("kind") == "track":
            attach_local_audio(
                result.get("items", []),
                request.user if request.user.is_authenticated else None,
            )
        return ok(result)


class RecentSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = RecentSearch.objects.filter(user=request.user)[:10]
        return ok({"items": [{"id": r.id, "query": r.query, "created_at": r.created_at} for r in rows]})

    def delete(self, request):
        RecentSearch.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TrackDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, track_id):
        try:
            track = resolve_track(track_id)
        except deezer.DeezerError as exc:
            return catalog_error(exc)
        user = request.user if request.user.is_authenticated else None
        return ok(serialize_track(track, user))


RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")
STREAM_CHUNK = 64 * 1024


def _range_not_satisfiable(size: int) -> Response:
    response = Response(status=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE)
    response["Content-Range"] = f"bytes */{size}"
    return response


class TrackStreamView(APIView):
    """Serve a locally stored full track with HTTP Range support.

    Preview-only tracks never hit this view; the player falls back to the
    Deezer preview URL. Authentication is intentionally not required because
    the browser's <audio> element cannot attach the JWT header and tracks in
    this app are a public listening catalog.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, track_id):
        track = None
        if str(track_id).isdigit():
            track = Track.objects.filter(pk=track_id).first()
        if track is None:
            track = Track.objects.filter(deezer_id=track_id).first()
        if track is None or not track.audio_file:
            raise Http404("No local audio is available for this track.")

        field = track.audio_file
        try:
            size = field.size
        except (FileNotFoundError, OSError, ValueError) as exc:
            raise Http404("The local audio file is missing.") from exc

        content_type = mimetypes.guess_type(field.name)[0] or "audio/mpeg"
        range_header = (request.headers.get("Range") or "").strip()

        if not range_header:
            response = FileResponse(field.open("rb"), content_type=content_type)
            response["Accept-Ranges"] = "bytes"
            response["Content-Length"] = str(size)
            response["Cache-Control"] = "private, max-age=3600"
            return response

        match = RANGE_RE.fullmatch(range_header)
        if not match:
            return _range_not_satisfiable(size)
        start_text, end_text = match.groups()
        if not start_text and not end_text:
            return _range_not_satisfiable(size)

        if not start_text:
            # Suffix range: bytes=-500 means the final 500 bytes.
            suffix = int(end_text)
            start = max(0, size - suffix)
            end = size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1

        if start >= size or start > end:
            return _range_not_satisfiable(size)
        end = min(end, size - 1)
        length = end - start + 1

        def chunks():
            with field.open("rb") as handle:
                handle.seek(start)
                remaining = length
                while remaining > 0:
                    data = handle.read(min(STREAM_CHUNK, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        response = StreamingHttpResponse(
            chunks(), status=status.HTTP_206_PARTIAL_CONTENT, content_type=content_type
        )
        response["Accept-Ranges"] = "bytes"
        response["Content-Length"] = str(length)
        response["Content-Range"] = f"bytes {start}-{end}/{size}"
        response["Cache-Control"] = "private, max-age=3600"
        return response


PREVIEW_EXP_RE = re.compile(r"exp=(\d+)")


def _preview_expired(url: str) -> bool:
    match = PREVIEW_EXP_RE.search(url or "")
    if not match:
        return False
    return int(match.group(1)) <= int(time.time())


class TrackPreviewView(APIView):
    """Redirect to a fresh Deezer preview for a cached track.

    Likes, playlists and history store Track rows with the preview URL that
    existed when the song was saved. Deezer signs those URLs with an expiry, so
    replaying a saved row can fail hours later. This endpoint refreshes the URL
    on demand instead of proxying the audio bytes themselves.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, track_id):
        track = None
        if str(track_id).isdigit():
            track = Track.objects.filter(pk=track_id).first()
            if track is None:
                track = Track.objects.filter(deezer_id=track_id).first()
        if track is None:
            raise Http404("Track not found.")

        preview = track.preview_url
        if not preview or _preview_expired(preview):
            try:
                payload = deezer.get_track(track.deezer_id, refresh=True)
            except deezer.DeezerError:
                raise Http404("Preview is not available for this track.")
            track = track_from_payload(payload)
            preview = track.preview_url

        if not preview:
            raise Http404("Preview is not available for this track.")

        response = HttpResponseRedirect(preview)
        response["Cache-Control"] = "no-store"
        return response


class TrackLyricsView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "lyrics"

    def get(self, request, track_id):
        track = Track.objects.filter(deezer_id=track_id).first()
        if track is None and str(track_id).isdigit():
            track = Track.objects.filter(pk=track_id).first()
        if track is None:
            try:
                track = resolve_track(track_id)
            except deezer.DeezerError as exc:
                return catalog_error(exc)
        track = lyrics.ensure_lyrics(track)
        return ok(lyrics.serialize_lyrics(track))


class AlbumDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, album_id):
        try:
            album = deezer.get_album(album_id)
        except deezer.DeezerError as exc:
            return catalog_error(exc)
        user = request.user if request.user.is_authenticated else None
        attach_local_audio(album["tracks"], user)
        return ok(album)


class ArtistDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, artist_id):
        try:
            artist = deezer.get_artist(artist_id)
        except deezer.DeezerError as exc:
            return catalog_error(exc)
        if request.user.is_authenticated:
            artist["following"] = FollowedArtist.objects.filter(
                user=request.user, artist_id=int(artist_id)
            ).exists()
        else:
            artist["following"] = False
        attach_local_audio(
            artist.get("top_tracks", []),
            request.user if request.user.is_authenticated else None,
        )
        return ok(artist)


class GenreListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            return ok({"items": deezer.genres()})
        except deezer.DeezerError as exc:
            return catalog_error(exc)


class GenreDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, genre_id):
        try:
            data = deezer.genre_artists(genre_id)
            data["id"] = str(genre_id)
            data["name"] = next((g["name"] for g in deezer.genres() if g["id"] == str(genre_id)), "Genre")
        except deezer.DeezerError as exc:
            return catalog_error(exc)
        return ok(data)


class DeezerPlaylistView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, playlist_id):
        try:
            playlist = deezer.get_playlist(playlist_id)
        except deezer.DeezerError as exc:
            return catalog_error(exc)
        user = request.user if request.user.is_authenticated else None
        attach_local_audio(playlist["tracks"], user)
        return ok(playlist)


class PlaylistListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        playlists = (
            Playlist.objects.filter(owner=request.user)
            .annotate(nb_tracks=Count("entries"))
            .prefetch_related("entries__track")
        )
        return ok({"items": PlaylistSerializer(playlists, many=True, context={"request": request}).data})

    def post(self, request):
        name = (request.data.get("name") or "").strip() or "My playlist"
        playlist = Playlist.objects.create(
            owner=request.user,
            name=name[:140],
            description=(request.data.get("description") or "")[:400],
            is_public=bool(request.data.get("is_public", True)),
            is_collaborative=bool(request.data.get("is_collaborative", False)),
        )
        cover = request.FILES.get("cover")
        if cover:
            playlist.cover = cover
            playlist.save(update_fields=["cover"])
        track_ids = request.data.get("track_ids") or []
        if isinstance(track_ids, list):
            for index, track_id in enumerate(track_ids):
                try:
                    track = resolve_track(track_id)
                except deezer.DeezerError:
                    continue
                PlaylistTrack.objects.get_or_create(
                    playlist=playlist, track=track, defaults={"position": index, "added_by": request.user}
                )
        return ok(
            PlaylistSerializer(playlist, context={"request": request, "include_tracks": True}).data,
            status.HTTP_201_CREATED,
        )


class PlaylistDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_playlist(self, request, playlist_id):
        playlist = Playlist.objects.filter(pk=playlist_id).first()
        if not playlist:
            return None, Response({"detail": "Playlist not found."}, status=status.HTTP_404_NOT_FOUND)
        if not playlist.is_public and playlist.owner_id != request.user.id:
            return None, Response({"detail": "This playlist is private."}, status=status.HTTP_403_FORBIDDEN)
        return playlist, None

    def get(self, request, playlist_id):
        playlist, error = self.get_playlist(request, playlist_id)
        if error:
            return error
        return ok(PlaylistSerializer(playlist, context={"request": request, "include_tracks": True}).data)

    def patch(self, request, playlist_id):
        playlist, error = self.get_playlist(request, playlist_id)
        if error:
            return error
        if playlist.owner_id != request.user.id:
            return Response({"detail": "Only the owner can edit this playlist."}, status=status.HTTP_403_FORBIDDEN)
        for field in ("name", "description", "is_public", "is_collaborative"):
            if field in request.data:
                value = request.data[field]
                if field == "name":
                    value = (value or "").strip()[:140] or playlist.name
                if field == "description":
                    value = (value or "")[:400]
                setattr(playlist, field, value)
        if "cover" in request.FILES:
            playlist.cover = request.FILES["cover"]
        playlist.save()
        return ok(PlaylistSerializer(playlist, context={"request": request, "include_tracks": True}).data)

    def delete(self, request, playlist_id):
        playlist, error = self.get_playlist(request, playlist_id)
        if error:
            return error
        if playlist.owner_id != request.user.id:
            return Response({"detail": "Only the owner can delete this playlist."}, status=status.HTTP_403_FORBIDDEN)
        playlist.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlaylistTracksView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, playlist_id):
        playlist = Playlist.objects.filter(pk=playlist_id).first()
        if not playlist:
            return Response({"detail": "Playlist not found."}, status=status.HTTP_404_NOT_FOUND)
        if playlist.owner_id != request.user.id and not playlist.is_collaborative:
            return Response({"detail": "You cannot edit this playlist."}, status=status.HTTP_403_FORBIDDEN)
        track_ids = request.data.get("track_ids")
        if track_ids is None:
            track_ids = [request.data.get("track_id")]
        if not isinstance(track_ids, list) or not track_ids:
            return Response({"detail": "track_id or track_ids is required."}, status=status.HTTP_400_BAD_REQUEST)
        created = []
        with transaction.atomic():
            position = playlist.entries.count()
            for track_id in track_ids:
                try:
                    track = resolve_track(track_id)
                except deezer.DeezerError as exc:
                    return catalog_error(exc)
                entry, was_created = PlaylistTrack.objects.get_or_create(
                    playlist=playlist, track=track, defaults={"position": position, "added_by": request.user}
                )
                if was_created:
                    position += 1
                    created.append(entry)
            playlist.save(update_fields=["updated_at"])
        return ok(
            {
                "added": len(created),
                "playlist": PlaylistSerializer(
                    playlist, context={"request": request, "include_tracks": True}
                ).data,
            },
            status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def put(self, request, playlist_id):
        playlist = Playlist.objects.filter(pk=playlist_id).first()
        if not playlist:
            return Response({"detail": "Playlist not found."}, status=status.HTTP_404_NOT_FOUND)
        if playlist.owner_id != request.user.id:
            return Response({"detail": "Only the owner can reorder this playlist."}, status=status.HTTP_403_FORBIDDEN)
        entry_ids = request.data.get("entry_ids") or []
        if not isinstance(entry_ids, list):
            return Response({"detail": "entry_ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        entries = {entry.id: entry for entry in playlist.entries.all()}
        with transaction.atomic():
            for index, entry_id in enumerate(entry_ids):
                entry = entries.get(int(entry_id))
                if entry:
                    entry.position = index
                    entry.save(update_fields=["position"])
        return ok(PlaylistSerializer(playlist, context={"request": request, "include_tracks": True}).data)


class PlaylistTrackDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, playlist_id, track_id):
        playlist = Playlist.objects.filter(pk=playlist_id).first()
        if not playlist:
            return Response({"detail": "Playlist not found."}, status=status.HTTP_404_NOT_FOUND)
        if playlist.owner_id != request.user.id and not playlist.is_collaborative:
            return Response({"detail": "You cannot edit this playlist."}, status=status.HTTP_403_FORBIDDEN)
        PlaylistTrack.objects.filter(playlist=playlist, track__deezer_id=track_id).delete()
        playlist.save(update_fields=["updated_at"])
        return ok(PlaylistSerializer(playlist, context={"request": request, "include_tracks": True}).data)


class LikeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = LikedTrack.objects.filter(user=request.user).select_related("track")
        return ok({"items": LikeSerializer(rows, many=True, context={"request": request}).data})

    def post(self, request):
        track_id = request.data.get("track_id") or request.data.get("id")
        if not track_id:
            return Response({"detail": "track_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            track = resolve_track(track_id)
        except deezer.DeezerError as exc:
            return catalog_error(exc)
        like, created = LikedTrack.objects.get_or_create(user=request.user, track=track)
        return ok(
            {"liked": True, "created": created, "track": serialize_track(track, request.user)},
            status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class LikeDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, track_id):
        LikedTrack.objects.filter(user=request.user, track__deezer_id=track_id).delete()
        return ok({"liked": False})


class HistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            limit = min(int(request.query_params.get("limit", 30)), 100)
        except ValueError:
            limit = 30
        rows = PlayHistory.objects.filter(user=request.user).select_related("track")[:limit]
        return ok({"items": HistorySerializer(rows, many=True, context={"request": request}).data})

    def post(self, request):
        track_id = request.data.get("track_id") or request.data.get("id")
        if not track_id:
            return Response({"detail": "track_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            track = resolve_track(track_id)
        except deezer.DeezerError as exc:
            return catalog_error(exc)
        recent = PlayHistory.objects.filter(
            user=request.user, track=track, played_at__gte=timezone.now() - timedelta(minutes=2)
        ).first()
        if recent:
            recent.context = (request.data.get("context") or "")[:120]
            recent.save(update_fields=["context"])
            entry = recent
        else:
            entry = PlayHistory.objects.create(
                user=request.user, track=track, context=(request.data.get("context") or "")[:120]
            )
        return ok({"id": entry.id, "track": serialize_track(track, request.user)}, status.HTTP_201_CREATED)

    def delete(self, request):
        PlayHistory.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FollowView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = FollowedArtist.objects.filter(user=request.user)
        return ok({"items": FollowedArtistSerializer(rows, many=True).data})

    def post(self, request):
        artist_id = request.data.get("artist_id") or request.data.get("id")
        if not artist_id:
            return Response({"detail": "artist_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        name = (request.data.get("name") or "Artist")[:300]
        picture = request.data.get("picture") or ""
        if not request.data.get("name"):
            try:
                artist = deezer.get_artist(artist_id)
                name, picture = artist["name"], artist["picture"]
            except deezer.DeezerError:
                pass
        follow, _ = FollowedArtist.objects.update_or_create(
            user=request.user, artist_id=int(artist_id), defaults={"name": name, "picture_url": picture}
        )
        return ok({"following": True, "artist": FollowedArtistSerializer(follow).data}, status.HTTP_201_CREATED)


class FollowDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, artist_id):
        FollowedArtist.objects.filter(user=request.user, artist_id=artist_id).delete()
        return ok({"following": False})


class LibraryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        playlists = (
            Playlist.objects.filter(owner=request.user)
            .annotate(nb_tracks=Count("entries"))
            .prefetch_related("entries__track")
        )
        likes = LikedTrack.objects.filter(user=request.user).select_related("track")
        follows = FollowedArtist.objects.filter(user=request.user)
        return ok(
            {
                "playlists": PlaylistSerializer(playlists, many=True, context={"request": request}).data,
                "liked": {
                    "count": likes.count(),
                    "items": LikeSerializer(likes[:20], many=True, context={"request": request}).data,
                },
                "artists": FollowedArtistSerializer(follows, many=True).data,
            }
        )


class ProfileStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return ok(
            {
                "user": UserSerializer(user, context={"request": request}).data,
                "stats": {
                    "playlists": Playlist.objects.filter(owner=user).count(),
                    "liked": LikedTrack.objects.filter(user=user).count(),
                    "following": FollowedArtist.objects.filter(user=user).count(),
                    "played": PlayHistory.objects.filter(user=user).count(),
                },
            }
        )


class InsightsView(APIView):
    """Aggregates the listener's activity for the Tremor-powered dashboard."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        history = PlayHistory.objects.filter(user=user).select_related("track")
        total_plays = history.count()
        total_minutes = round(sum(row.track.duration for row in history) / 60, 1)
        unique_tracks = history.values("track_id").distinct().count()

        top_artists = list(
            history.values("track__artist_name")
            .annotate(plays=Count("id"), minutes=Sum("track__duration"))
            .order_by("-plays")[:8]
        )
        artists_payload = [
            {
                "name": row["track__artist_name"] or "Unknown artist",
                "plays": row["plays"],
                "minutes": round((row["minutes"] or 0) / 60, 1),
            }
            for row in top_artists
        ]

        top_tracks_raw = (
            history.values(
                "track__title",
                "track__artist_name",
                "track__cover_url",
                "track__deezer_id",
                "track__album_id",
            )
            .annotate(plays=Count("id"))
            .order_by("-plays")[:9]
        )
        top_tracks = [
            {
                "title": row["track__title"],
                "artist": row["track__artist_name"],
                "cover": row["track__cover_url"],
                "plays": row["plays"],
                "id": str(row["track__deezer_id"]),
                "album_id": str(row["track__album_id"]) if row["track__album_id"] else "",
            }
            for row in top_tracks_raw
        ]

        today = timezone.localdate()
        day_rows = {
            row["day"]: row["plays"]
            for row in history.filter(played_at__date__gte=today - timedelta(days=13))
            .annotate(day=TruncDate("played_at"))
            .values("day")
            .annotate(plays=Count("id"))
        }
        by_day = []
        for offset in range(13, -1, -1):
            day = today - timedelta(days=offset)
            by_day.append({"date": day.strftime("%b %d"), "plays": day_rows.get(day, 0)})

        hour_rows = {
            row["hour"]: row["plays"]
            for row in history.annotate(hour=ExtractHour("played_at"))
            .values("hour")
            .annotate(plays=Count("id"))
        }
        by_hour = [{"hour": f"{hour:02d}:00", "plays": hour_rows.get(hour, 0)} for hour in range(24)]

        likes = LikedTrack.objects.filter(user=user)
        return ok(
            {
                "totals": {
                    "plays": total_plays,
                    "minutes": total_minutes,
                    "unique_tracks": unique_tracks,
                    "likes": likes.count(),
                    "playlists": Playlist.objects.filter(owner=user).count(),
                    "following": FollowedArtist.objects.filter(user=user).count(),
                },
                "top_artists": artists_payload,
                "top_tracks": top_tracks,
                "by_day": by_day,
                "by_hour": by_hour,
            }
        )


# ---------------------------------------------------------------------------
# Staff dashboard API
# ---------------------------------------------------------------------------

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".flac", ".opus"}


def admin_track_payload(track: Track) -> dict:
    has_audio = bool(track.audio_file)
    has_lyrics = bool(track.lyrics_plain or track.lyrics_synced or track.lyrics_instrumental)
    return {
        "id": track.pk,
        "deezer_id": track.deezer_id,
        "title": track.title,
        "artist_id": track.artist_id,
        "artist_name": track.artist_name,
        "album_id": track.album_id,
        "album_title": track.album_title,
        "cover_url": track.cover_url,
        "duration": track.duration,
        "explicit": track.explicit,
        "release_date": track.release_date,
        "has_audio": has_audio,
        "audio_url": f"/tracks/{track.pk}/stream/" if has_audio else "",
        "has_lyrics": has_lyrics,
        "has_plain_lyrics": bool(track.lyrics_plain),
        "has_synced_lyrics": bool(track.lyrics_synced),
        "lyrics_instrumental": track.lyrics_instrumental,
        "lyrics_plain": track.lyrics_plain,
        "lyrics_synced": track.lyrics_synced,
        "lyrics_source": track.lyrics_source,
        "lyrics_checked_at": track.lyrics_checked_at,
        "created_at": track.created_at,
        "updated_at": track.updated_at,
    }


def admin_user_payload(user: User) -> dict:
    return {
        "id": user.pk,
        "username": user.username,
        "email": user.email,
        "name": user.name,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "date_joined": user.date_joined,
        "last_login": user.last_login,
        "playlists_count": getattr(user, "playlists_count", 0),
        "likes_count": getattr(user, "likes_count", 0),
        "plays_count": getattr(user, "plays_count", 0),
    }


def _bool_value(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"1", "true", "yes", "on"}


class AdminOverviewView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        tracks = Track.objects.all()
        with_audio = tracks.filter(audio_file__isnull=False).exclude(audio_file="")
        with_lyrics = tracks.filter(
            Q(lyrics_plain__gt="") | Q(lyrics_synced__gt="") | Q(lyrics_instrumental=True)
        )
        top_tracks = list(
            PlayHistory.objects.values(
                "track_id", "track__title", "track__artist_name", "track__cover_url"
            )
            .annotate(plays=Count("id"))
            .order_by("-plays")[:5]
        )
        recent_uploads = list(with_audio.order_by("-updated_at")[:5])
        recent_users = list(
            User.objects.annotate(
                playlists_count=Count("playlists", distinct=True),
                likes_count=Count("likes", distinct=True),
                plays_count=Count("history", distinct=True),
            ).order_by("-date_joined")[:5]
        )
        total_tracks = tracks.count()
        return ok(
            {
                "stats": {
                    "tracks": total_tracks,
                    "with_audio": with_audio.count(),
                    "with_lyrics": with_lyrics.count(),
                    "users": User.objects.count(),
                    "playlists": Playlist.objects.count(),
                    "plays": PlayHistory.objects.count(),
                    "likes": LikedTrack.objects.count(),
                    "audio_coverage": round((with_audio.count() / total_tracks) * 100, 1)
                    if total_tracks
                    else 0,
                },
                "top_tracks": [
                    {
                        "id": row["track_id"],
                        "deezer_id": row["track_id"],
                        "title": row["track__title"],
                        "artist_name": row["track__artist_name"],
                        "cover_url": row["track__cover_url"],
                        "plays": row["plays"],
                    }
                    for row in top_tracks
                ],
                "recent_uploads": [admin_track_payload(track) for track in recent_uploads],
                "recent_users": [admin_user_payload(user) for user in recent_users],
            }
        )


class AdminTrackListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        queryset = Track.objects.all()
        query = (request.query_params.get("q") or "").strip()
        if query:
            filters = (
                Q(title__icontains=query)
                | Q(artist_name__icontains=query)
                | Q(album_title__icontains=query)
            )
            if query.isdigit():
                filters |= Q(deezer_id=int(query))
            queryset = queryset.filter(filters)

        audio = request.query_params.get("audio", "all")
        if audio == "yes":
            queryset = queryset.filter(audio_file__isnull=False).exclude(audio_file="")
        elif audio == "no":
            queryset = queryset.filter(Q(audio_file__isnull=True) | Q(audio_file=""))

        lyrics = request.query_params.get("lyrics", "all")
        if lyrics == "yes":
            queryset = queryset.filter(
                Q(lyrics_plain__gt="") | Q(lyrics_synced__gt="") | Q(lyrics_instrumental=True)
            )
        elif lyrics == "no":
            queryset = queryset.filter(
                lyrics_plain="", lyrics_synced="", lyrics_instrumental=False
            )

        ordering = request.query_params.get("ordering", "recent")
        order_map = {
            "recent": "-updated_at",
            "title": "title",
            "artist": "artist_name",
            "duration": "-duration",
        }
        queryset = queryset.order_by(order_map.get(ordering, "-updated_at"), "pk")

        try:
            limit = max(1, min(int(request.query_params.get("limit", 25)), 100))
            offset = max(int(request.query_params.get("offset", 0)), 0)
        except (TypeError, ValueError):
            limit, offset = 25, 0

        total = queryset.count()
        rows = queryset[offset : offset + limit]
        return ok(
            {
                "count": total,
                "limit": limit,
                "offset": offset,
                "items": [admin_track_payload(track) for track in rows],
            }
        )


class AdminTrackDetailView(APIView):
    permission_classes = [IsAdminUser]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def _track(self, pk):
        track = Track.objects.filter(pk=pk).first()
        if track is None:
            raise Http404("Track not found.")
        return track

    def get(self, request, pk):
        return ok(admin_track_payload(self._track(pk)))

    def patch(self, request, pk):
        track = self._track(pk)
        text_fields = ("title", "artist_name", "album_title", "release_date")

        for field in text_fields:
            if field in request.data:
                limit = 20 if field == "release_date" else 300
                setattr(track, field, str(request.data.get(field) or "").strip()[:limit])

        if "explicit" in request.data:
            track.explicit = _bool_value(request.data.get("explicit"))

        lyrics_changed = False
        for field in ("lyrics_plain", "lyrics_synced"):
            if field in request.data:
                setattr(track, field, str(request.data.get(field) or ""))
                lyrics_changed = True
        if "lyrics_instrumental" in request.data:
            track.lyrics_instrumental = _bool_value(request.data.get("lyrics_instrumental"))
            lyrics_changed = True
        if lyrics_changed:
            track.lyrics_source = "admin"
            track.lyrics_checked_at = timezone.now()

        old_audio_name = None
        if _bool_value(request.data.get("remove_audio", False)):
            if track.audio_file:
                old_audio_name = track.audio_file.name
            track.audio_file = None

        upload = request.FILES.get("audio_file")
        if upload is not None:
            suffix = Path(upload.name or "").suffix.lower()
            if suffix not in AUDIO_EXTENSIONS:
                return Response(
                    {"detail": f"Unsupported audio format. Use one of: {', '.join(sorted(AUDIO_EXTENSIONS))}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if track.audio_file:
                old_audio_name = track.audio_file.name
            track.audio_file = upload

        track.save()
        if old_audio_name and old_audio_name != (track.audio_file.name if track.audio_file else ""):
            default_storage.delete(old_audio_name)
        return ok(admin_track_payload(track))


class AdminTrackAudioView(APIView):
    permission_classes = [IsAdminUser]

    def delete(self, request, pk):
        track = Track.objects.filter(pk=pk).first()
        if track is None:
            raise Http404("Track not found.")
        if track.audio_file:
            name = track.audio_file.name
            track.audio_file = None
            track.save(update_fields=["audio_file", "updated_at"])
            default_storage.delete(name)
        return ok(admin_track_payload(track))


class AdminUserListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        queryset = User.objects.annotate(
            playlists_count=Count("playlists", distinct=True),
            likes_count=Count("likes", distinct=True),
            plays_count=Count("history", distinct=True),
        )
        query = (request.query_params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(
                Q(username__icontains=query)
                | Q(email__icontains=query)
                | Q(display_name__icontains=query)
            )
        queryset = queryset.order_by("-date_joined")
        try:
            limit = max(1, min(int(request.query_params.get("limit", 25)), 100))
            offset = max(int(request.query_params.get("offset", 0)), 0)
        except (TypeError, ValueError):
            limit, offset = 25, 0
        return ok(
            {
                "count": queryset.count(),
                "limit": limit,
                "offset": offset,
                "items": [
                    admin_user_payload(user) for user in queryset[offset : offset + limit]
                ],
            }
        )
