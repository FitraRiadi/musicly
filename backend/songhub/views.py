from __future__ import annotations

import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.http import Http404
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Track
from catalog.serializers import track_from_payload

from .models import (
    ChatMessage,
    Reaction,
    SongHubInvite,
    SongHubMembership,
    SongHubRoom,
    SongRequest,
    VoiceSignal,
)
from .serializers import (
    serialize_hub_user,
    serialize_invite,
    serialize_member,
    serialize_message,
    serialize_reaction,
    serialize_request,
    serialize_room_state,
    serialize_room_summary,
)

ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
STALE_AFTER = timedelta(seconds=75)
SIGNAL_TTL = timedelta(minutes=3)
MAX_MESSAGE_LENGTH = 500


def _new_code() -> str:
    for _ in range(30):
        code = "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(6))
        if not SongHubRoom.objects.filter(code=code).exists():
            return code
    raise RuntimeError("Could not allocate a room code.")


def _system(room: SongHubRoom, body: str) -> ChatMessage:
    return ChatMessage.objects.create(
        room=room, kind=ChatMessage.Kind.SYSTEM, body=body[:MAX_MESSAGE_LENGTH]
    )


def _active_memberships(room: SongHubRoom):
    return (
        room.memberships.filter(left_at__isnull=True)
        .select_related("user")
        .order_by("joined_at", "id")
    )


def _promote_next_host(room: SongHubRoom, leaving: SongHubMembership | None = None):
    candidates = _active_memberships(room)
    if leaving is not None:
        candidates = candidates.exclude(pk=leaving.pk)
    next_member = candidates.first()
    if not next_member:
        room.is_active = False
        room.is_playing = False
        room.position_seconds = 0
        room.position_updated_at = timezone.now()
        room.save(
            update_fields=[
                "is_active",
                "is_playing",
                "position_seconds",
                "position_updated_at",
                "updated_at",
            ]
        )
        return None
    room.memberships.filter(left_at__isnull=True, role=SongHubMembership.Role.HOST).update(
        role=SongHubMembership.Role.MEMBER
    )
    next_member.role = SongHubMembership.Role.HOST
    next_member.save(update_fields=["role"])
    room.host = next_member.user
    room.save(update_fields=["host", "updated_at"])
    _system(room, f"{next_member.user.name} is now the host.")
    return next_member


def _leave_membership(membership: SongHubMembership, announce: bool = True):
    if membership.left_at is not None:
        return None
    room = membership.room
    was_host = membership.role == SongHubMembership.Role.HOST
    membership.left_at = timezone.now()
    membership.mic_on = False
    membership.save(update_fields=["left_at", "mic_on"])
    if was_host:
        return _promote_next_host(room, membership)
    if announce:
        _system(room, f"{membership.user.name} left the room.")
    return None


def _cleanup_room(room: SongHubRoom) -> None:
    stale = (
        room.memberships.filter(
            left_at__isnull=True, last_seen__lt=timezone.now() - STALE_AFTER
        )
        .select_related("user")
        .order_by("joined_at", "id")
    )
    for membership in list(stale):
        _leave_membership(membership, announce=False)
    room.refresh_from_db(fields=["is_active", "host", "is_playing"])
    if room.is_active and not _active_memberships(room).exists():
        room.is_active = False
        room.is_playing = False
        room.position_seconds = 0
        room.position_updated_at = timezone.now()
        room.save(
            update_fields=[
                "is_active",
                "is_playing",
                "position_seconds",
                "position_updated_at",
                "updated_at",
            ]
        )


def _get_room(code: str) -> SongHubRoom:
    room = get_object_or_404(
        SongHubRoom.objects.select_related("host", "current_track"),
        code__iexact=code,
        is_active=True,
    )
    _cleanup_room(room)
    if not room.is_active:
        raise Http404
    return room


def _membership_for(room: SongHubRoom, user) -> SongHubMembership | None:
    return (
        room.memberships.filter(user=user, left_at__isnull=True)
        .select_related("user")
        .first()
    )


def _require_member(room: SongHubRoom, user) -> SongHubMembership | None:
    return _membership_for(room, user)


def _state(room: SongHubRoom, request, membership=None, status_code=status.HTTP_200_OK):
    membership = membership or _membership_for(room, request.user)
    return Response(
        serialize_room_state(room, request, membership), status=status_code
    )


def _resolve_track(data: dict) -> Track | None:
    payload = data.get("track")
    if isinstance(payload, dict):
        try:
            return track_from_payload(payload)
        except (TypeError, ValueError):
            return None
    track_id = data.get("track_id")
    if track_id in (None, ""):
        return None
    try:
        numeric = int(track_id)
    except (TypeError, ValueError):
        return None
    return (
        Track.objects.filter(deezer_id=numeric).first()
        or Track.objects.filter(pk=numeric).first()
    )


class RoomListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        active_rooms = list(SongHubRoom.objects.filter(is_active=True))
        for room in active_rooms:
            _cleanup_room(room)

        invited_ids = SongHubInvite.objects.filter(
            invitee=request.user, declined_at__isnull=True
        ).values_list("room_id", flat=True)
        my_membership = (
            SongHubMembership.objects.filter(
                user=request.user, left_at__isnull=True, room__is_active=True
            )
            .select_related("room", "room__host", "room__current_track")
            .first()
        )
        rooms = (
            SongHubRoom.objects.filter(is_active=True)
            .filter(
                Q(visibility=SongHubRoom.Visibility.PUBLIC)
                | Q(pk__in=invited_ids)
                | Q(memberships__user=request.user, memberships__left_at__isnull=True)
            )
            .distinct()
            .select_related("host", "current_track")
            .annotate(
                member_count=Count(
                    "memberships",
                    filter=Q(memberships__left_at__isnull=True),
                    distinct=True,
                )
            )
            .filter(member_count__gt=0)
            .order_by("-created_at")
        )
        return Response(
            {
                "rooms": [serialize_room_summary(room, request) for room in rooms],
                "my_room": serialize_room_summary(my_membership.room, request)
                if my_membership
                else None,
            }
        )

    def post(self, request):
        name = (request.data.get("name") or "").strip()[:120]
        if not name:
            return Response(
                {"detail": "Give your room a name."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        visibility = (request.data.get("visibility") or "public").lower()
        if visibility not in SongHubRoom.Visibility.values:
            return Response(
                {"detail": "Choose either a public or private room."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        password = str(request.data.get("password") or "")
        if visibility == SongHubRoom.Visibility.PRIVATE and len(password) < 4:
            return Response(
                {"detail": "Private rooms need a password of at least 4 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(password) > 64:
            return Response(
                {"detail": "Keep the room password under 64 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        existing = (
            SongHubMembership.objects.filter(
                user=request.user, left_at__isnull=True, room__is_active=True
            )
            .select_related("room")
            .first()
        )
        if existing:
            return Response(
                {
                    "detail": f"You're already in {existing.room.name}. Leave it before creating another room.",
                    "room_code": existing.room.code,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            room = SongHubRoom.objects.create(
                code=_new_code(),
                name=name,
                visibility=visibility,
                password_hash=make_password(password)
                if visibility == SongHubRoom.Visibility.PRIVATE
                else "",
                created_by=request.user,
                host=request.user,
            )
            membership = SongHubMembership.objects.create(
                room=room,
                user=request.user,
                role=SongHubMembership.Role.HOST,
            )
            _system(room, f"{request.user.name} opened {room.name}.")
        return _state(room, request, membership, status.HTTP_201_CREATED)


class RoomInviteListView(APIView):
    """Pending friend invitations for the current user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = (
            SongHubInvite.objects.filter(
                invitee=request.user,
                declined_at__isnull=True,
                accepted_at__isnull=True,
                room__is_active=True,
            )
            .select_related("room", "room__host", "room__current_track", "inviter")
            .order_by("-created_at")
        )
        return Response({"items": [serialize_invite(row, request) for row in rows]})


class RoomInviteDeclineView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        invite = get_object_or_404(
            SongHubInvite, pk=pk, invitee=request.user, declined_at__isnull=True
        )
        invite.declined_at = timezone.now()
        invite.save(update_fields=["declined_at"])
        return Response({"declined": True})


class RoomJoinView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        room = get_object_or_404(
            SongHubRoom.objects.select_related("host", "current_track"),
            code__iexact=code,
        )
        _cleanup_room(room)
        if not room.is_active:
            return Response(
                {"detail": "This room has closed."}, status=status.HTTP_404_NOT_FOUND
            )

        existing = _membership_for(room, request.user)
        if existing:
            return _state(room, request, existing)

        elsewhere = (
            SongHubMembership.objects.filter(
                user=request.user, left_at__isnull=True, room__is_active=True
            )
            .exclude(room=room)
            .select_related("room")
            .first()
        )
        if elsewhere:
            return Response(
                {
                    "detail": f"Leave {elsewhere.room.name} before joining another room.",
                    "room_code": elsewhere.room.code,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        invite = SongHubInvite.objects.filter(
            room=room, invitee=request.user, declined_at__isnull=True
        ).first()
        if room.is_private and not invite:
            password = str(request.data.get("password") or "")
            if not room.password_hash or not check_password(password, room.password_hash):
                return Response(
                    {"detail": "This room is private. Enter the correct password."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        active_count = room.memberships.filter(left_at__isnull=True).count()
        if active_count >= room.max_members:
            return Response(
                {"detail": "This room is full."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            membership = SongHubMembership.objects.create(
                room=room, user=request.user, role=SongHubMembership.Role.MEMBER
            )
            if invite:
                invite.accepted_at = timezone.now()
                invite.save(update_fields=["accepted_at"])
                _system(room, f"{request.user.name} joined from an invite.")
            else:
                _system(room, f"{request.user.name} joined the room.")
        return _state(room, request, membership, status.HTTP_201_CREATED)


class RoomStateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub to listen along."},
                status=status.HTTP_403_FORBIDDEN,
            )
        membership.last_seen = timezone.now()
        membership.save(update_fields=["last_seen"])
        return _state(room, request, membership)


class RoomLeaveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        room = get_object_or_404(SongHubRoom, code__iexact=code)
        membership = _membership_for(room, request.user)
        if not membership:
            return Response({"left": False})
        promoted = _leave_membership(membership)
        room.refresh_from_db(fields=["is_active"])
        return Response(
            {
                "left": True,
                "room_closed": not room.is_active,
                "promoted": serialize_hub_user(promoted.user, request)
                if promoted
                else None,
            }
        )


class RoomTransferHostView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        room = _get_room(code)
        host = _require_member(room, request.user)
        if not host or host.role != SongHubMembership.Role.HOST:
            return Response(
                {"detail": "Only the host can transfer ownership."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user_id = request.data.get("user_id")
        target = room.memberships.filter(
            user_id=user_id, left_at__isnull=True
        ).select_related("user").first()
        if not target:
            return Response(
                {"detail": "That listener is no longer in the room."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target.id == host.id:
            return _state(room, request, host)
        with transaction.atomic():
            host.role = SongHubMembership.Role.MEMBER
            host.save(update_fields=["role"])
            target.role = SongHubMembership.Role.HOST
            target.save(update_fields=["role"])
            room.host = target.user
            room.save(update_fields=["host", "updated_at"])
            _system(
                room,
                f"{host.user.name} handed the host role to {target.user.name}.",
            )
        return _state(room, request, host)


class RoomSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, code):
        room = _get_room(code)
        host = _require_member(room, request.user)
        if not host or host.role != SongHubMembership.Role.HOST:
            return Response(
                {"detail": "Only the host can change room settings."},
                status=status.HTTP_403_FORBIDDEN,
            )
        changed = []
        name = request.data.get("name")
        if name is not None:
            cleaned = str(name).strip()[:120]
            if not cleaned:
                return Response(
                    {"detail": "The room name cannot be empty."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            room.name = cleaned
            changed.append("name")

        visibility = request.data.get("visibility")
        password = str(request.data.get("password") or "")
        if visibility is not None:
            visibility = str(visibility).lower()
            if visibility not in SongHubRoom.Visibility.values:
                return Response(
                    {"detail": "Choose either a public or private room."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            room.visibility = visibility
            changed.append("visibility")
            if visibility == SongHubRoom.Visibility.PUBLIC:
                room.password_hash = ""
                changed.append("password_hash")
            elif password:
                if len(password) < 4 or len(password) > 64:
                    return Response(
                        {"detail": "Private room passwords need 4-64 characters."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                room.password_hash = make_password(password)
                changed.append("password_hash")
            elif not room.password_hash:
                return Response(
                    {"detail": "Set a password for the private room."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif password:
            if len(password) < 4 or len(password) > 64:
                return Response(
                    {"detail": "Private room passwords need 4-64 characters."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            room.password_hash = make_password(password)
            room.visibility = SongHubRoom.Visibility.PRIVATE
            changed.extend(["password_hash", "visibility"])

        if changed:
            room.save(update_fields=[*sorted(set(changed)), "updated_at"])
            _system(room, "Room settings were updated.")
        return _state(room, request, host)


class RoomPlaybackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership or membership.role != SongHubMembership.Role.HOST:
            return Response(
                {"detail": "Only the host controls playback."},
                status=status.HTTP_403_FORBIDDEN,
            )

        track = _resolve_track(request.data)
        track_changed = bool(track and track.id != room.current_track_id)
        if track is not None:
            room.current_track = track
            if track_changed:
                room.position_seconds = 0
                if "is_playing" not in request.data:
                    room.is_playing = True
        if "is_playing" in request.data:
            room.is_playing = bool(request.data.get("is_playing"))
        if "position_seconds" in request.data:
            try:
                position = float(request.data.get("position_seconds") or 0)
            except (TypeError, ValueError):
                position = 0
            limit = float(room.current_track.duration or 0) if room.current_track else 0
            room.position_seconds = max(0, min(position, limit)) if limit else max(0, position)
        if track is None and "is_playing" not in request.data and "position_seconds" not in request.data:
            return Response(
                {"detail": "Send a track or playback state."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        room.position_updated_at = timezone.now()
        room.save(
            update_fields=[
                "current_track",
                "is_playing",
                "position_seconds",
                "position_updated_at",
                "updated_at",
            ]
        )
        return _state(room, request, membership)


class RoomRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        rows = (
            room.requests.select_related("user", "track").order_by("-created_at")[:40]
        )
        return Response({"items": [serialize_request(row, request) for row in rows]})

    def post(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if membership.role == SongHubMembership.Role.HOST:
            return Response(
                {"detail": "Hosts can play songs directly from any song list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        track = _resolve_track(request.data)
        if not track:
            return Response(
                {"detail": "Choose a valid song to request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        existing = room.requests.filter(
            user=request.user, track=track, status=SongRequest.Status.PENDING
        ).first()
        if existing:
            return Response(serialize_request(existing, request))
        row = SongRequest.objects.create(
            room=room,
            user=request.user,
            track=track,
            note=str(request.data.get("note") or "")[:240],
        )
        _system(room, f"{request.user.name} requested {track.title}.")
        return Response(serialize_request(row, request), status=status.HTTP_201_CREATED)


class RoomRequestResolveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code, pk):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership or membership.role != SongHubMembership.Role.HOST:
            return Response(
                {"detail": "Only the host can answer song requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        row = get_object_or_404(room.requests.select_related("track", "user"), pk=pk)
        if row.status != SongRequest.Status.PENDING:
            return Response(serialize_request(row, request))
        action = (request.data.get("action") or "").lower()
        if action not in {"accept", "decline"}:
            return Response(
                {"detail": "Choose accept or decline."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row.resolved_at = timezone.now()
        if action == "accept":
            row.status = SongRequest.Status.ACCEPTED
            row.save(update_fields=["status", "resolved_at"])
            room.current_track = row.track
            room.is_playing = True
            room.position_seconds = 0
            room.position_updated_at = timezone.now()
            room.save(
                update_fields=[
                    "current_track",
                    "is_playing",
                    "position_seconds",
                    "position_updated_at",
                    "updated_at",
                ]
            )
            _system(
                room,
                f"Request accepted: {row.track.title} by {row.track.artist_name}.",
            )
        else:
            row.status = SongRequest.Status.DECLINED
            row.save(update_fields=["status", "resolved_at"])
            _system(room, f"Request declined: {row.track.title}.")
        return _state(room, request, membership)


class RoomMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        room = _get_room(code)
        membership = _membership_for(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        rows = list(room.messages.select_related("user").order_by("-created_at")[:100])
        rows.reverse()
        return Response({"items": [serialize_message(row, request) for row in rows]})

    def post(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        kind = (request.data.get("kind") or "text").lower()
        if kind not in {ChatMessage.Kind.TEXT, ChatMessage.Kind.STICKER}:
            return Response(
                {"detail": "Choose text or sticker."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        body = str(request.data.get("body") or "").strip()
        sticker = str(request.data.get("sticker") or "").strip()[:40]
        if kind == ChatMessage.Kind.TEXT and not body:
            return Response(
                {"detail": "Write a message first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if kind == ChatMessage.Kind.STICKER and not sticker:
            return Response(
                {"detail": "Choose a sticker."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row = ChatMessage.objects.create(
            room=room,
            user=request.user,
            kind=kind,
            body=body[:MAX_MESSAGE_LENGTH],
            sticker=sticker,
        )
        membership.last_seen = timezone.now()
        membership.save(update_fields=["last_seen"])
        return Response(serialize_message(row, request), status=status.HTTP_201_CREATED)


class RoomReactionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        emoji = (request.data.get("emoji") or "").lower()
        if emoji not in Reaction.ALLOWED:
            return Response(
                {"detail": "Choose one of the five room reactions."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row = Reaction.objects.create(room=room, user=request.user, emoji=emoji)
        membership.last_seen = timezone.now()
        membership.save(update_fields=["last_seen"])
        return Response(serialize_reaction(row, request), status=status.HTTP_201_CREATED)


class RoomMicView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        membership.mic_on = bool(request.data.get("mic_on"))
        membership.last_seen = timezone.now()
        membership.save(update_fields=["mic_on", "last_seen"])
        return Response(serialize_member(membership, request))


class RoomInviteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user_id = request.data.get("user_id")
        username = (request.data.get("username") or "").strip()
        from accounts.models import User

        target = None
        if user_id:
            target = User.objects.filter(pk=user_id).first()
        elif username:
            target = User.objects.filter(username__iexact=username).first()
        if not target:
            return Response(
                {"detail": "That listener could not be found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target.id == request.user.id:
            return Response(
                {"detail": "You're already in this room."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if room.memberships.filter(user=target, left_at__isnull=True).exists():
            return Response(
                {"detail": "They're already listening in this room."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invite, _ = SongHubInvite.objects.update_or_create(
            room=room,
            invitee=target,
            defaults={
                "inviter": request.user,
                "accepted_at": None,
                "declined_at": None,
            },
        )
        _system(room, f"{request.user.name} invited {target.name}.")
        return Response(serialize_invite(invite, request), status=status.HTTP_201_CREATED)


class RoomSignalView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        cutoff = timezone.now() - SIGNAL_TTL
        VoiceSignal.objects.filter(room=room, created_at__lt=cutoff).delete()
        try:
            after = int(request.query_params.get("after") or 0)
        except ValueError:
            after = 0
        rows = list(
            VoiceSignal.objects.filter(
                room=room, target=request.user, id__gt=after
            ).select_related("sender")[:100]
        )
        data = [
            {
                "id": row.id,
                "kind": row.kind,
                "from": serialize_hub_user(row.sender, request),
                "payload": row.payload,
                "created_at": row.created_at,
            }
            for row in rows
        ]
        # Signals stay available until SIGNAL_TTL expires. The client polls with
        # an `after` cursor, so keeping them makes delivery resilient to a lost
        # or retried HTTP response instead of silently dropping an SDP offer.
        return Response({"items": data, "last_id": rows[-1].id if rows else after})

    def post(self, request, code):
        room = _get_room(code)
        membership = _require_member(room, request.user)
        if not membership:
            return Response(
                {"detail": "Join this Song Hub first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        kind = (request.data.get("kind") or "").lower()
        if kind not in {"offer", "answer", "candidate"}:
            return Response(
                {"detail": "Unknown voice signal."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target_id = request.data.get("target_user_id")
        target = room.memberships.filter(
            user_id=target_id, left_at__isnull=True
        ).first()
        if not target:
            return Response(
                {"detail": "That listener left the room."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target.user_id == request.user.id:
            return Response(
                {"detail": "You cannot signal yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = request.data.get("payload")
        if not isinstance(payload, dict):
            return Response(
                {"detail": "Signal payload must be an object."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        VoiceSignal.objects.filter(
            room=room, created_at__lt=timezone.now() - SIGNAL_TTL
        ).delete()
        row = VoiceSignal.objects.create(
            room=room,
            sender=request.user,
            target_id=target.user_id,
            kind=kind,
            payload=payload,
        )
        return Response({"id": row.id}, status=status.HTTP_201_CREATED)
