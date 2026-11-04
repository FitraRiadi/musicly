from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    display_name = models.CharField(max_length=80, blank=True)
    bio = models.CharField(max_length=240, blank=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def name(self) -> str:
        return self.display_name or self.username

    def __str__(self) -> str:
        return self.username


class Friendship(models.Model):
    """A single row represents a pending or accepted mutual friendship."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"

    requester = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sent_friendships"
    )
    addressee = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="received_friendships"
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["requester", "addressee"], name="unique_friendship_pair"
            ),
            models.CheckConstraint(
                condition=~models.Q(requester=models.F("addressee")),
                name="friendship_no_self",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.requester} -> {self.addressee} ({self.status})"


class Badge(models.Model):
    """A collectible achievement whose artwork is hosted on a CDN."""

    METRIC_CHOICES = (
        ("plays", "Tracks played"),
        ("likes", "Liked tracks"),
        ("friends", "Friends"),
        ("public_playlists", "Public playlists"),
        ("saved_playlists", "Saved playlists"),
        ("unique_tracks", "Unique tracks"),
        ("distinct_artists", "Artists discovered"),
        ("playlist_tracks", "Tracks in your playlists"),
        ("playlists_created", "Playlists created"),
        ("playlist_saves_received", "Playlist saves received"),
        ("followed_artists", "Followed artists"),
        ("listening_days", "Listening days"),
        ("listening_streak", "Longest listening streak"),
        ("night_plays", "Late-night plays"),
        ("songhub_rooms", "Song Hubs created"),
        ("songhub_visits", "Song Hub visits"),
        ("songhub_messages", "Song Hub messages"),
        ("songhub_reactions", "Song Hub reactions"),
        ("songhub_requests", "Song requests"),
    )

    slug = models.SlugField(max_length=60, unique=True)
    title = models.CharField(max_length=80)
    description = models.CharField(max_length=240)
    image_url = models.URLField(max_length=600)
    metric = models.CharField(max_length=40, choices=METRIC_CHOICES)
    threshold = models.PositiveIntegerField(default=1)
    rarity = models.CharField(
        max_length=12,
        choices=(("standard", "Standard"), ("rare", "Rare")),
        default="standard",
    )
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.title


class UserBadge(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="badges")
    badge = models.ForeignKey(Badge, on_delete=models.CASCADE, related_name="awards")
    earned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["badge__sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["user", "badge"], name="unique_user_badge"),
        ]

    def __str__(self) -> str:
        return f"{self.user} · {self.badge}"
