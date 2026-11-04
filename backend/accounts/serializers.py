from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.db.models import Q

from .models import Badge, Friendship, User, UserBadge


def avatar_url(user: User, request=None):
    if not user.avatar:
        return None
    url = user.avatar.url
    return request.build_absolute_uri(url) if request else url


def friends_count(user: User) -> int:
    return (
        Friendship.objects.filter(status=Friendship.Status.ACCEPTED)
        .filter(Q(requester=user) | Q(addressee=user))
        .count()
    )


def friendship_state(current_user, target: User) -> dict:
    if not current_user or not getattr(current_user, "is_authenticated", False):
        return {"status": "none", "request_id": None}
    if current_user.id == target.id:
        return {"status": "self", "request_id": None}
    row = (
        Friendship.objects.filter(
            Q(requester=current_user, addressee=target)
            | Q(requester=target, addressee=current_user)
        )
        .order_by("-created_at")
        .first()
    )
    if not row:
        return {"status": "none", "request_id": None}
    if row.status == Friendship.Status.ACCEPTED:
        return {"status": "friends", "request_id": row.id}
    if row.requester_id == current_user.id:
        return {"status": "pending_outgoing", "request_id": row.id}
    return {"status": "pending_incoming", "request_id": row.id}


def serialize_public_user(user: User, request=None, current_user=None) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "display_name": user.display_name,
        "bio": user.bio,
        "avatar": avatar_url(user, request),
        "created_at": user.created_at,
        "friends_count": friends_count(user),
        "friendship": friendship_state(current_user, user),
    }


def serialize_badge(badge: Badge, *, earned_at=None, value: int = 0) -> dict:
    progress = 100 if earned_at else min(100, round(value / max(1, badge.threshold) * 100))
    return {
        "slug": badge.slug,
        "title": badge.title,
        "description": badge.description,
        "image_url": badge.image_url,
        "metric": badge.metric,
        "threshold": badge.threshold,
        "rarity": badge.rarity,
        "value": value,
        "progress": progress,
        "earned": earned_at is not None,
        "earned_at": earned_at,
    }


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    avatar = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "name", "display_name", "bio", "avatar", "is_staff", "created_at"]
        read_only_fields = ["id", "username", "email", "is_staff", "created_at", "name"]


class PublicUserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    avatar = serializers.SerializerMethodField()
    friends_count = serializers.SerializerMethodField()
    friendship = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "display_name",
            "bio",
            "avatar",
            "created_at",
            "friends_count",
            "friendship",
        ]

    def get_avatar(self, obj: User):
        return avatar_url(obj, self.context.get("request"))

    def get_friends_count(self, obj: User):
        return friends_count(obj)

    def get_friendship(self, obj: User):
        return friendship_state(self.context.get("request").user if self.context.get("request") else None, obj)


class BadgeSerializer(serializers.ModelSerializer):
    earned = serializers.SerializerMethodField()
    earned_at = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    value = serializers.SerializerMethodField()

    class Meta:
        model = Badge
        fields = [
            "slug",
            "title",
            "description",
            "image_url",
            "metric",
            "threshold",
            "rarity",
            "value",
            "progress",
            "earned",
            "earned_at",
        ]

    def _earned(self, obj):
        return (self.context.get("earned") or {}).get(obj.slug)

    def _value(self, obj):
        return (self.context.get("metric_values") or {}).get(obj.metric, 0)

    def get_earned(self, obj):
        return self._earned(obj) is not None

    def get_earned_at(self, obj):
        earned = self._earned(obj)
        return earned.earned_at if earned else None

    def get_value(self, obj):
        return self._value(obj)

    def get_progress(self, obj):
        earned = self._earned(obj)
        if earned:
            return 100
        return min(100, round(self._value(obj) / max(1, obj.threshold) * 100))


class FriendRequestSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    direction = serializers.SerializerMethodField()

    class Meta:
        model = Friendship
        fields = ["id", "status", "direction", "created_at", "user"]

    def get_user(self, obj):
        request = self.context.get("request")
        target = obj.addressee if obj.requester_id == request.user.id else obj.requester
        return serialize_public_user(target, request, request.user)

    def get_direction(self, obj):
        request = self.context.get("request")
        return "outgoing" if obj.requester_id == request.user.id else "incoming"


class RegisterSerializer(serializers.Serializer):
    username = serializers.RegexField(r"^[\w.-]{3,30}$", error_messages={
        "invalid": "Username must be 3-30 characters and contain only letters, numbers, dots or underscores."
    })
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, validators=[validate_password])
    display_name = serializers.CharField(max_length=80, required=False, allow_blank=True)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("That username is already taken.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with that email already exists.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
