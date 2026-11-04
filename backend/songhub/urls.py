from django.urls import path

from . import views

urlpatterns = [
    path("rooms/", views.RoomListCreateView.as_view(), name="songhub-rooms"),
    path("invitations/", views.RoomInviteListView.as_view(), name="songhub-invitations"),
    path(
        "invitations/<int:pk>/decline/",
        views.RoomInviteDeclineView.as_view(),
        name="songhub-invitation-decline",
    ),
    path("rooms/<str:code>/join/", views.RoomJoinView.as_view(), name="songhub-join"),
    path("rooms/<str:code>/state/", views.RoomStateView.as_view(), name="songhub-state"),
    path("rooms/<str:code>/leave/", views.RoomLeaveView.as_view(), name="songhub-leave"),
    path(
        "rooms/<str:code>/host/",
        views.RoomTransferHostView.as_view(),
        name="songhub-transfer-host",
    ),
    path(
        "rooms/<str:code>/settings/",
        views.RoomSettingsView.as_view(),
        name="songhub-settings",
    ),
    path(
        "rooms/<str:code>/playback/",
        views.RoomPlaybackView.as_view(),
        name="songhub-playback",
    ),
    path(
        "rooms/<str:code>/requests/",
        views.RoomRequestView.as_view(),
        name="songhub-requests",
    ),
    path(
        "rooms/<str:code>/requests/<int:pk>/resolve/",
        views.RoomRequestResolveView.as_view(),
        name="songhub-request-resolve",
    ),
    path(
        "rooms/<str:code>/messages/",
        views.RoomMessageView.as_view(),
        name="songhub-messages",
    ),
    path(
        "rooms/<str:code>/reactions/",
        views.RoomReactionView.as_view(),
        name="songhub-reactions",
    ),
    path("rooms/<str:code>/mic/", views.RoomMicView.as_view(), name="songhub-mic"),
    path(
        "rooms/<str:code>/invite/",
        views.RoomInviteView.as_view(),
        name="songhub-invite",
    ),
    path(
        "rooms/<str:code>/signals/",
        views.RoomSignalView.as_view(),
        name="songhub-signals",
    ),
]
