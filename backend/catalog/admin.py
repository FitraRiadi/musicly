from django.contrib import admin

from .models import FollowedArtist, LikedTrack, PlayHistory, Playlist, PlaylistTrack, Track


@admin.register(Track)
class TrackAdmin(admin.ModelAdmin):
    list_display = ("title", "artist_name", "album_title", "duration", "has_full_audio", "lyrics_available")
    list_filter = ("lyrics_source", "lyrics_instrumental")
    search_fields = ("title", "artist_name", "album_title")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "deezer_id",
                    "title",
                    "artist_id",
                    "artist_name",
                    "album_id",
                    "album_title",
                    "cover_url",
                    "preview_url",
                    "duration",
                    "explicit",
                    "release_date",
                )
            },
        ),
        (
            "Full audio",
            {
                "fields": ("audio_file",),
                "description": (
                    "Upload an audio file you own or are licensed to host. "
                    "Leave blank to keep playing the Deezer 30-second preview."
                ),
            },
        ),
        (
            "Lyrics",
            {
                "fields": (
                    "lyrics_plain",
                    "lyrics_synced",
                    "lyrics_instrumental",
                    "lyrics_source",
                    "lyrics_checked_at",
                ),
                "description": (
                    "Paste plain lyrics or LRC timestamps. Clear 'lyrics checked at' "
                    "to let the app try LRCLIB again."
                ),
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(boolean=True, description="Full audio")
    def has_full_audio(self, obj):
        return bool(obj.audio_file)

    @admin.display(boolean=True, description="Lyrics")
    def lyrics_available(self, obj):
        return bool(obj.lyrics_plain or obj.lyrics_synced or obj.lyrics_instrumental)


class PlaylistTrackInline(admin.TabularInline):
    model = PlaylistTrack
    extra = 0


@admin.register(Playlist)
class PlaylistAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "nb_tracks", "is_public", "updated_at")
    search_fields = ("name", "owner__username")
    inlines = [PlaylistTrackInline]

    @admin.display(description="Tracks")
    def nb_tracks(self, obj):
        return obj.entries.count()


admin.site.register(LikedTrack)
admin.site.register(PlayHistory)
admin.site.register(FollowedArtist)
