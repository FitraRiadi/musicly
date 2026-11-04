from django.conf import settings
from django.db import models
from django.utils import timezone


class SongHubRoom(models.Model):
    """A synchronized listening room.

    The host owns playback. Members can only request tracks, chat, react and
    use their microphone. ``created_by`` is kept separately from ``host`` so
    founder badges survive a later host transfer.
    """

    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    code = models.CharField(max_length=8, unique=True)
    name = models.CharField(max_length=120)
    visibility = models.CharField(
        max_length=8, choices=Visibility.choices, default=Visibility.PUBLIC
    )
    password_hash = models.CharField(max_length=128, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_songhub_rooms",
    )
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hosted_songhub_rooms",
    )
    current_track = models.ForeignKey(
        "catalog.Track",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    is_playing = models.BooleanField(default=False)
    position_seconds = models.FloatField(default=0)
    position_updated_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    max_members = models.PositiveSmallIntegerField(default=10)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["is_active", "-created_at"])]

    @property
    def is_private(self) -> bool:
        return self.visibility == self.Visibility.PRIVATE

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"


class SongHubMembership(models.Model):
    """One visit to a room.

    Rows are never reused after leaving so ``songhub_visits`` badges can count
    every time a listener joins a room.
    """

    class Role(models.TextChoices):
        HOST = "host", "Host"
        MEMBER = "member", "Member"

    room = models.ForeignKey(
        SongHubRoom, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="songhub_memberships",
    )
    role = models.CharField(max_length=8, choices=Role.choices, default=Role.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(default=timezone.now)
    left_at = models.DateTimeField(null=True, blank=True)
    mic_on = models.BooleanField(default=False)

    class Meta:
        ordering = ["joined_at", "id"]
        indexes = [models.Index(fields=["room", "left_at"])]

    def __str__(self) -> str:
        return f"{self.user} in {self.room.code} ({self.role})"


class SongRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"

    room = models.ForeignKey(
        SongHubRoom, on_delete=models.CASCADE, related_name="requests"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="songhub_requests",
    )
    track = models.ForeignKey(
        "catalog.Track", on_delete=models.CASCADE, related_name="songhub_requests"
    )
    note = models.CharField(max_length=240, blank=True)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} requested {self.track}"


class ChatMessage(models.Model):
    class Kind(models.TextChoices):
        TEXT = "text", "Text"
        STICKER = "sticker", "Sticker"
        SYSTEM = "system", "System"

    room = models.ForeignKey(
        SongHubRoom, on_delete=models.CASCADE, related_name="messages"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="songhub_messages",
    )
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.TEXT)
    body = models.TextField(max_length=500, blank=True)
    sticker = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["room", "created_at"])]


class Reaction(models.Model):
    ALLOWED = ("love", "fire", "laugh", "party", "drum")

    room = models.ForeignKey(
        SongHubRoom, on_delete=models.CASCADE, related_name="reactions"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="songhub_reactions",
    )
    emoji = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["room", "created_at"])]


class SongHubInvite(models.Model):
    """A friend invitation that also unlocks a private room."""

    room = models.ForeignKey(
        SongHubRoom, on_delete=models.CASCADE, related_name="invites"
    )
    inviter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_songhub_invites",
    )
    invitee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="songhub_invites",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["room", "invitee"], name="unique_songhub_room_invite"
            )
        ]

    def __str__(self) -> str:
        return f"{self.inviter} invited {self.invitee} to {self.room.code}"


class VoiceSignal(models.Model):
    """WebRTC offer/answer/ICE traffic relayed through the REST API."""

    room = models.ForeignKey(
        SongHubRoom, on_delete=models.CASCADE, related_name="voice_signals"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_songhub_signals",
    )
    target = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_songhub_signals",
    )
    kind = models.CharField(max_length=16)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["room", "target", "id"])]
