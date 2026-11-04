from django.contrib.auth import login as session_login
from django.contrib.auth import logout as session_logout
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from catalog.models import LikedTrack, PlayHistory, Playlist, SavedPlaylist
from catalog.serializers import PlaylistSerializer

from .models import Badge, Friendship, User, UserBadge
from .serializers import (
    BadgeSerializer,
    FriendRequestSerializer,
    RegisterSerializer,
    UserSerializer,
    friends_count,
    friendship_state,
    serialize_public_user,
)


def tokens_for(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _metric_value(user: User, metric: str) -> int:
    if metric == "plays":
        return PlayHistory.objects.filter(user=user).count()
    if metric == "likes":
        return LikedTrack.objects.filter(user=user).count()
    if metric == "friends":
        return friends_count(user)
    if metric == "public_playlists":
        return Playlist.objects.filter(owner=user, is_public=True).count()
    if metric == "saved_playlists":
        return SavedPlaylist.objects.filter(user=user).count()
    return 0


def _badge_context(user: User | None) -> tuple[dict, dict]:
    values = {
        metric: _metric_value(user, metric) if user and user.is_authenticated else 0
        for metric in {choice[0] for choice in Badge.METRIC_CHOICES}
    }
    earned = {}
    if user and user.is_authenticated:
        earned = {
            row.badge.slug: row
            for row in UserBadge.objects.filter(user=user).select_related("badge")
        }
    return values, earned


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"user": UserSerializer(user, context={"request": request}).data, **tokens_for(user)},
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        user = User.objects.filter(username=request.data.get("username")).first()
        if user:
            response.data["user"] = UserSerializer(user, context={"request": request}).data
        return response


class AdminSessionView(APIView):
    """Bridge a staff JWT login into a Django admin session.

    The app authenticates with JWTs, while Django admin uses session cookies.
    Signing into the app as a staff user should land on the admin dashboard
    without asking for the same credentials twice.
    """

    permission_classes = [IsAuthenticated]
    throttle_scope = "auth"

    def post(self, request):
        if not request.user.is_staff:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        session_login(
            request._request,
            request.user,
            backend="django.contrib.auth.backends.ModelBackend",
        )
        return Response({"ok": True})

    def delete(self, request):
        session_logout(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = UserSerializer(
            request.user, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request):
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserSearchView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        try:
            limit = max(1, min(int(request.query_params.get("limit", 20)), 50))
        except ValueError:
            limit = 20
        users = User.objects.all()
        if query:
            users = users.filter(
                Q(username__icontains=query)
                | Q(display_name__icontains=query)
                | Q(bio__icontains=query)
            )
        users = users.order_by("username")[:limit]
        current = request.user if request.user.is_authenticated else None
        items = [serialize_public_user(user, request, current) for user in users]
        return Response({"items": items, "count": len(items), "query": query})


class PublicProfileView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, username):
        user = get_object_or_404(User, username__iexact=username)
        current = request.user if request.user.is_authenticated else None
        is_self = bool(current and current.id == user.id)
        playlists = (
            Playlist.objects.filter(owner=user, is_public=True)
            .annotate(
                nb_tracks=Count("entries", distinct=True),
                saves_count=Count("saves", distinct=True),
            )
            .select_related("owner")
            .prefetch_related("entries__track")
            .order_by("-updated_at")
        )
        earned = {
            row.badge.slug: row
            for row in UserBadge.objects.filter(user=user).select_related("badge")
        }
        values, _ = _badge_context(user)
        badges = BadgeSerializer(
            Badge.objects.all(),
            many=True,
            context={"earned": earned, "metric_values": values},
        ).data
        stats = {
            "friends": friends_count(user),
            "public_playlists": playlists.count(),
            "badges": len(earned),
            "plays": PlayHistory.objects.filter(user=user).count(),
        }
        return Response(
            {
                "user": serialize_public_user(user, request, current),
                "stats": stats,
                "playlists": PlaylistSerializer(
                    playlists,
                    many=True,
                    context={"request": request},
                ).data,
                "badges": [badge for badge in badges if badge["earned"]],
                "friendship": friendship_state(current, user),
                "is_self": is_self,
            }
        )


class FriendListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        accepted = (
            Friendship.objects.filter(status=Friendship.Status.ACCEPTED)
            .filter(Q(requester=request.user) | Q(addressee=request.user))
            .select_related("requester", "addressee")
        )
        friends = [
            serialize_public_user(
                row.addressee if row.requester_id == request.user.id else row.requester,
                request,
                request.user,
            )
            for row in accepted
        ]
        incoming = Friendship.objects.filter(
            addressee=request.user, status=Friendship.Status.PENDING
        ).select_related("requester")
        outgoing = Friendship.objects.filter(
            requester=request.user, status=Friendship.Status.PENDING
        ).select_related("addressee")
        context = {"request": request}
        return Response(
            {
                "friends": friends,
                "incoming": FriendRequestSerializer(incoming, many=True, context=context).data,
                "outgoing": FriendRequestSerializer(outgoing, many=True, context=context).data,
            }
        )


class FriendRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        target = None
        user_id = request.data.get("user_id")
        username = (request.data.get("username") or "").strip()
        if user_id:
            target = User.objects.filter(pk=user_id).first()
        elif username:
            target = User.objects.filter(username__iexact=username).first()
        if not target:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if target.id == request.user.id:
            return Response({"detail": "You cannot add yourself."}, status=status.HTTP_400_BAD_REQUEST)
        existing = (
            Friendship.objects.filter(
                Q(requester=request.user, addressee=target)
                | Q(requester=target, addressee=request.user)
            )
            .order_by("-created_at")
            .first()
        )
        if existing:
            if existing.status == Friendship.Status.ACCEPTED:
                return Response(friendship_state(request.user, target))
            if existing.addressee_id == request.user.id:
                existing.status = Friendship.Status.ACCEPTED
                existing.responded_at = timezone.now()
                existing.save(update_fields=["status", "responded_at"])
                return Response(friendship_state(request.user, target))
            return Response(friendship_state(request.user, target))
        row = Friendship.objects.create(requester=request.user, addressee=target)
        return Response(
            {**friendship_state(request.user, target), "request_id": row.id},
            status=status.HTTP_201_CREATED,
        )


class FriendRequestAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        row = get_object_or_404(
            Friendship,
            pk=pk,
            addressee=request.user,
            status=Friendship.Status.PENDING,
        )
        row.status = Friendship.Status.ACCEPTED
        row.responded_at = timezone.now()
        row.save(update_fields=["status", "responded_at"])
        return Response(friendship_state(request.user, row.requester))


class FriendRequestDeclineView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        Friendship.objects.filter(
            pk=pk,
            addressee=request.user,
            status=Friendship.Status.PENDING,
        ).delete()
        return Response({"status": "none", "request_id": None})


class FriendRemoveView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, user_id):
        target = get_object_or_404(User, pk=user_id)
        Friendship.objects.filter(
            Q(requester=request.user, addressee=target)
            | Q(requester=target, addressee=request.user)
        ).delete()
        return Response({"status": "none", "request_id": None})


class BadgeListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        values, earned = _badge_context(
            request.user if request.user.is_authenticated else None
        )
        data = BadgeSerializer(
            Badge.objects.all(),
            many=True,
            context={"earned": earned, "metric_values": values},
        ).data
        return Response({"items": data})


class BadgeCollectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        badge = get_object_or_404(Badge, slug=slug)
        value = _metric_value(request.user, badge.metric)
        if value < badge.threshold:
            return Response(
                {
                    "detail": f"Keep going — {value}/{badge.threshold} completed.",
                    "value": value,
                    "threshold": badge.threshold,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        row, _ = UserBadge.objects.get_or_create(user=request.user, badge=badge)
        return Response(
            BadgeSerializer(
                badge,
                context={
                    "earned": {badge.slug: row},
                    "metric_values": {badge.metric: value},
                },
            ).data,
            status=status.HTTP_201_CREATED,
        )
