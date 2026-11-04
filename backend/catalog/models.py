from django.conf import settings
from django.db import models


class Track(models.Model):
    """A locally cached snapshot of a Deezer track.

    Metadata is cached so playlists, likes and history survive restarts and the
    UI renders instantly. Preview audio is streamed from Deezer; the optional
    ``audio_file`` holds a full, locally stored track that the owner has the
    rights to host. Lyrics are cached here too, whether added by an admin or
    imported on demand.
    """

    deezer_id = models.BigIntegerField(unique=True, db_index=True)
    title = models.CharField(max_length=300)
    artist_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    artist_name = models.CharField(max_length=300, blank=True)
    album_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    album_title = models.CharField(max_length=300, blank=True)
    cover_url = models.URLField(max_length=600, blank=True)
    preview_url = models.URLField(max_length=1200, blank=True)
    audio_file = models.FileField(upload_to="tracks/", blank=True, null=True)
    duration = models.PositiveIntegerField(default=30)
    explicit = models.BooleanField(default=False)
    release_date = models.CharField(max_length=20, blank=True)
    lyrics_plain = models.TextField(blank=True)
    lyrics_synced = models.TextField(blank=True)
    lyrics_instrumental = models.BooleanField(default=False)
    lyrics_source = models.CharField(max_length=40, blank=True)
    lyrics_checked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]

    def __str__(self) -> str:
        return f"{self.title} — {self.artist_name}"

    @property
    def has_full_audio(self) -> bool:
        return bool(self.audio_file)


class Playlist(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="playlists")
    name = models.CharField(max_length=140)
    description = models.CharField(max_length=400, blank=True)
    cover = models.ImageField(upload_to="playlists/", blank=True, null=True)
    cover_url = models.URLField(max_length=1200, blank=True)
    is_public = models.BooleanField(default=True)
    is_collaborative = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    tracks = models.ManyToManyField(Track, through="PlaylistTrack", related_name="playlists", blank=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return self.name


class PlaylistTrack(models.Model):
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE, related_name="entries")
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="playlist_entries")
    position = models.PositiveIntegerField(default=0)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["playlist", "track"], name="unique_track_per_playlist"),
        ]


class SavedPlaylist(models.Model):
    """A public playlist saved by another listener."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_playlists"
    )
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE, related_name="saves")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "playlist"], name="unique_saved_playlist"),
        ]

    def __str__(self) -> str:
        return f"{self.user} saved {self.playlist}"


class LikedTrack(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="likes")
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["user", "track"], name="unique_like")]


class PlayHistory(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="history")
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="history")
    context = models.CharField(max_length=120, blank=True)
    played_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-played_at"]
        indexes = [models.Index(fields=["user", "-played_at"])]


class FollowedArtist(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="follows")
    artist_id = models.BigIntegerField()
    name = models.CharField(max_length=300)
    picture_url = models.URLField(max_length=600, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["user", "artist_id"], name="unique_follow")]


class RecentSearch(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recent_searches")
    query = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
