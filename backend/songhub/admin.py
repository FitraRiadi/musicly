from django.contrib import admin

from .models import (
    ChatMessage,
    Reaction,
    SongHubMembership,
    SongHubRoom,
    SongRequest,
    VoiceSignal,
)


@admin.register(SongHubRoom)
class SongHubRoomAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "host", "is_active", "is_playing", "created_at"]
    search_fields = ["name", "code", "host__username"]
    list_filter = ["is_active", "is_playing"]


@admin.register(SongHubMembership)
class SongHubMembershipAdmin(admin.ModelAdmin):
    list_display = ["room", "user", "role", "joined_at", "left_at", "mic_on"]
    list_filter = ["role", "mic_on"]
    search_fields = ["room__code", "user__username"]


@admin.register(SongRequest)
class SongRequestAdmin(admin.ModelAdmin):
    list_display = ["room", "user", "track", "status", "created_at"]
    list_filter = ["status"]


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ["room", "user", "kind", "body", "created_at"]
    list_filter = ["kind"]


@admin.register(Reaction)
class ReactionAdmin(admin.ModelAdmin):
    list_display = ["room", "user", "emoji", "created_at"]


@admin.register(VoiceSignal)
class VoiceSignalAdmin(admin.ModelAdmin):
    list_display = ["room", "sender", "target", "kind", "created_at"]
    list_filter = ["kind"]
