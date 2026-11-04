from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AdminSessionView,
    BadgeCollectView,
    BadgeListView,
    FriendListView,
    FriendRemoveView,
    FriendRequestAcceptView,
    FriendRequestDeclineView,
    FriendRequestView,
    LoginView,
    MeView,
    PublicProfileView,
    RegisterView,
    UserSearchView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("admin-session/", AdminSessionView.as_view(), name="admin-session"),
    path("users/", UserSearchView.as_view(), name="user-search"),
    path("users/<str:username>/", PublicProfileView.as_view(), name="public-profile"),
    path("friends/", FriendListView.as_view(), name="friends"),
    path("friends/requests/", FriendRequestView.as_view(), name="friend-request"),
    path("friends/requests/<int:pk>/accept/", FriendRequestAcceptView.as_view(), name="friend-accept"),
    path("friends/requests/<int:pk>/decline/", FriendRequestDeclineView.as_view(), name="friend-decline"),
    path("friends/<int:user_id>/", FriendRemoveView.as_view(), name="friend-remove"),
    path("badges/", BadgeListView.as_view(), name="badges"),
    path("badges/<slug:slug>/collect/", BadgeCollectView.as_view(), name="badge-collect"),
]
