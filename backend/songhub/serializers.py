from django.utils import timezone

from accounts.serializers import avatar_url
from catalog.serializers import serialize_track

from .models import ChatMessage, Reaction, SongHubInvite, SongHubMembership, SongHubRoom, SongRequest


def serialize_hub_user(user, request=None) -> dict:
    if user is None:
        return {"id": None, "username": "", "name": "Musicly", "avatar": None}
    return {
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "avatar": avatar_url(user, request),
    }


def serialize_member(membership: SongHubMembership, request=None) -> dict:
    return {
        "id": membership.id,
        "user": serialize_hub_user(membership.user, request),
        "role": membership.role,
        "mic_on": membership.mic_on,
        "joined_at": membership.joined_at,
        "last_seen": membership.last_seen,
    }


def serialize_message(message: ChatMessage, request=None) -> dict:
    return {
        "id": message.id,
        "kind": message.kind,
        "body": message.body,
        "sticker": message.sticker,
        "user": serialize_hub_user(message.user, request) if message.user else None,
        "created_at": message.created_at,
    }


def serialize_request(row: SongRequest, request=None) -> dict:
    return {
        "id": row.id,
        "user": serialize_hub_user(row.user, request),
        "track": serialize_track(row.track, request.user if request else None),
        "note": row.note,
        "status": row.status,
        "created_at": row.created_at,
        "resolved_at": row.resolved_at,
    }


def serialize_reaction(reaction: Reaction, request=None) -> dict:
    return {
        "id": reaction.id,
        "emoji": reaction.emoji,
        "user": serialize_hub_user(reaction.user, request),
        "created_at": reaction.created_at,
    }


def serialize_invite(invite: SongHubInvite, request=None) -> dict:
    return {
        "id": invite.id,
        "room": serialize_room_summary(invite.room, request),
        "inviter": serialize_hub_user(invite.inviter, request),
        "created_at": invite.created_at,
    }


def serialize_room_summary(room: SongHubRoom, request=None) -> dict:
    member_count = getattr(room, "member_count", None)
    if member_count is None:
        member_count = room.memberships.filter(left_at__isnull=True).count()
    return {
        "code": room.code,
        "name": room.name,
        "host": serialize_hub_user(room.host, request),
        "member_count": member_count,
        "max_members": room.max_members,
        "is_private": room.is_private,
        "has_password": room.has_password,
        "is_playing": room.is_playing,
        "current_track": serialize_track(room.current_track, request.user if request else None)
        if room.current_track
        else None,
        "created_at": room.created_at,
        "updated_at": room.updated_at,
    }


def serialize_room_state(room: SongHubRoom, request, membership: SongHubMembership | None = None) -> dict:
    members = list(
        room.memberships.filter(left_at__isnull=True)
        .select_related("user")
        .order_by("joined_at", "id")
    )
    messages = list(
        room.messages.select_related("user").order_by("-created_at", "-id")[:120]
    )
    messages.reverse()
    requests = list(
        room.requests.select_related("user", "track").order_by("-created_at")[:30]
    )
    reactions = list(
        room.reactions.select_related("user").order_by("-created_at", "-id")[:60]
    )
    reactions.reverse()
    me = membership or next(
        (member for member in members if member.user_id == request.user.id), None
    )
    return {
        "room": {
            **serialize_room_summary(room, request),
            "is_playing": room.is_playing,
            "position_seconds": room.position_seconds,
            "position_updated_at": room.position_updated_at,
        },
        "members": [serialize_member(member, request) for member in members],
        "me": {
            "membership_id": me.id,
            "role": me.role,
            "mic_on": me.mic_on,
            "is_host": me.role == SongHubMembership.Role.HOST,
        }
        if me
        else None,
        "requests": [serialize_request(row, request) for row in requests],
        "messages": [serialize_message(row, request) for row in messages],
        "reactions": [serialize_reaction(row, request) for row in reactions],
        "server_time": timezone.now(),
    }
