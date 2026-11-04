from django.conf import settings
from rest_framework import serializers

from .models import FollowedArtist, LikedTrack, PlayHistory, Playlist, PlaylistTrack, SavedPlaylist, Track


def _stream_enabled() -> bool:
    return bool((getattr(settings, "YTMP3_API", "") or "").strip())


def serialize_track(track: Track, user=None) -> dict:
    liked = False
    if user is not None and user.is_authenticated:
        liked = LikedTrack.objects.filter(user=user, track=track).exists()

    has_local = bool(track.audio_file)
    can_stream = has_local or _stream_enabled()
    if has_local:
        stream_url = f"/tracks/{track.pk}/stream/"
        audio_source = "local"
    elif can_stream:
        # The stream view resolves the Deezer id to a YouTube video on demand.
        stream_url = f"/tracks/dz-{track.deezer_id}/stream/"
        audio_source = "youtube"
    else:
        stream_url = ""
        audio_source = "preview"

    return {
        "id": str(track.deezer_id),
        "deezer_id": track.deezer_id,
        "source": "local",
        "title": track.title,
        "duration": track.duration,
        # Cached Deezer preview URLs are signed and expire, so playback goes
        # through a small endpoint that refreshes them on demand.
        "preview": f"/tracks/{track.pk}/preview/",
        "has_full_audio": can_stream,
        "stream_url": stream_url,
        "audio_source": audio_source,
        "explicit": track.explicit,
        "rank": 0,
        "release_date": track.release_date,
        "liked": liked,
        "artist": {
            "id": str(track.artist_id or ""),
            "name": track.artist_name,
            "picture": "",
        },
        "album": {
            "id": str(track.album_id or ""),
            "title": track.album_title,
            "cover": track.cover_url,
            "cover_small": track.cover_url,
        },
    }


def track_from_payload(payload: dict) -> Track:
    """Create/refresh the cached track row from a normalized Deezer track."""
    deezer_id = payload.get("deezer_id") or payload.get("id")
    if not deezer_id:
        raise ValueError("A track id is required.")
    album = payload.get("album") or {}
    artist = payload.get("artist") or {}
    track, _ = Track.objects.update_or_create(
        deezer_id=int(deezer_id),
        defaults={
            "title": (payload.get("title") or "Unknown track")[:300],
            "artist_id": int(artist["id"]) if str(artist.get("id", "")).isdigit() else None,
            "artist_name": (artist.get("name") or "")[:300],
            "album_id": int(album["id"]) if str(album.get("id", "")).isdigit() else None,
            "album_title": (album.get("title") or "")[:300],
            "cover_url": album.get("cover") or album.get("cover_small") or "",
            "preview_url": payload.get("preview") or "",
            "duration": payload.get("duration") or 30,
            "explicit": bool(payload.get("explicit")),
            "release_date": payload.get("release_date") or "",
        },
    )
    return track


def attach_local_audio(tracks: list[dict], user=None) -> list[dict]:
    """Attach playable stream and like state to normalized Deezer track payloads.

    Search, album, artist, chart and Deezer-playlist endpoints return upstream
    payloads rather than ORM rows. Without this pass, a track with an uploaded
    file or an available ytmp3 stream would still play its 30-second preview
    when opened from those screens.
    """
    if not tracks:
        return tracks

    ids: list[int] = []
    for track in tracks:
        raw = track.get("deezer_id") or track.get("id")
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            continue

    rows = {row.deezer_id: row for row in Track.objects.filter(deezer_id__in=ids)}
    liked_ids: set[int] = set()
    if user is not None and getattr(user, "is_authenticated", False):
        liked_ids = set(
            LikedTrack.objects.filter(user=user, track__deezer_id__in=ids).values_list(
                "track__deezer_id", flat=True
            )
        )

    for track in tracks:
        try:
            deezer_id = int(track.get("deezer_id") or track.get("id"))
        except (TypeError, ValueError):
            continue
        row = rows.get(deezer_id)
        has_audio = bool(row and row.audio_file)
        if has_audio:
            stream_url = f"/tracks/{row.pk}/stream/"
            audio_source = "local"
        elif _stream_enabled():
            # No uploaded file yet: resolve this Deezer id through the scraper.
            stream_url = f"/tracks/dz-{deezer_id}/stream/"
            audio_source = "youtube"
        else:
            stream_url = ""
            audio_source = "preview"
        track["has_full_audio"] = bool(stream_url)
        track["stream_url"] = stream_url
        track["audio_source"] = audio_source
        track["liked"] = deezer_id in liked_ids
    return tracks


class PlaylistTrackSerializer(serializers.ModelSerializer):
    track = serializers.SerializerMethodField()

    class Meta:
        model = PlaylistTrack
        fields = ["id", "position", "added_at", "track"]

    def get_track(self, obj):
        return serialize_track(obj.track, self.context.get("request").user if self.context.get("request") else None)


class PlaylistSerializer(serializers.ModelSerializer):
    owner = serializers.SerializerMethodField()
    nb_tracks = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()
    tracks = serializers.SerializerMethodField()
    duration = serializers.SerializerMethodField()
    saves_count = serializers.SerializerMethodField()
    saved = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = Playlist
        fields = [
            "id", "name", "description", "cover", "is_public", "is_collaborative",
            "owner", "nb_tracks", "duration", "tracks", "created_at", "updated_at", "source",
            "saves_count", "saved", "is_owner",
        ]

    source = serializers.SerializerMethodField()

    def get_source(self, obj):
        return "local"

    def get_owner(self, obj):
        request = self.context.get("request")
        avatar = None
        if obj.owner.avatar:
            url = obj.owner.avatar.url
            avatar = request.build_absolute_uri(url) if request else url
        return {
            "id": obj.owner_id,
            "name": obj.owner.name,
            "username": obj.owner.username,
            "avatar": avatar,
        }

    def get_nb_tracks(self, obj):
        value = getattr(obj, "nb_tracks", None)
        return value if value is not None else obj.entries.count()

    def get_duration(self, obj):
        return sum(entry.track.duration for entry in obj.entries.select_related("track"))

    def get_cover(self, obj):
        request = self.context.get("request")
        if obj.cover:
            url = obj.cover.url
            return request.build_absolute_uri(url) if request else url
        if obj.cover_url:
            return obj.cover_url
        first = obj.entries.select_related("track").first()
        return first.track.cover_url if first else ""

    def get_tracks(self, obj):
        include = self.context.get("include_tracks", False)
        entries = obj.entries.select_related("track").all()
        if not include:
            entries = entries[:5]
        request = self.context.get("request")
        user = request.user if request else None
        return [
            {
                "entry_id": entry.id,
                "position": entry.position,
                "added_at": entry.added_at,
                "track": serialize_track(entry.track, user),
            }
            for entry in entries
        ]

    def get_saves_count(self, obj):
        value = getattr(obj, "saves_count", None)
        return value if value is not None else obj.saves.count()

    def get_saved(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return SavedPlaylist.objects.filter(user=request.user, playlist=obj).exists()

    def get_is_owner(self, obj):
        request = self.context.get("request")
        return bool(
            request
            and request.user.is_authenticated
            and obj.owner_id == request.user.id
        )


class LikeSerializer(serializers.ModelSerializer):
    track = serializers.SerializerMethodField()

    class Meta:
        model = LikedTrack
        fields = ["id", "created_at", "track"]

    def get_track(self, obj):
        request = self.context.get("request")
        return serialize_track(obj.track, request.user if request else None)


class HistorySerializer(serializers.ModelSerializer):
    track = serializers.SerializerMethodField()

    class Meta:
        model = PlayHistory
        fields = ["id", "played_at", "context", "track"]

    def get_track(self, obj):
        request = self.context.get("request")
        return serialize_track(obj.track, request.user if request else None)


class FollowedArtistSerializer(serializers.ModelSerializer):
    class Meta:
        model = FollowedArtist
        fields = ["id", "artist_id", "name", "picture_url", "created_at"]


class SimpleTrackSerializer(serializers.Serializer):
    id = serializers.CharField()
