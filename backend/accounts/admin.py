from django.contrib import admin

from .models import Badge, Friendship, User, UserBadge


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "email", "display_name", "is_staff", "created_at")
    search_fields = ("username", "email", "display_name")


@admin.register(Friendship)
class FriendshipAdmin(admin.ModelAdmin):
    list_display = ("requester", "addressee", "status", "created_at", "responded_at")
    list_filter = ("status",)
    search_fields = ("requester__username", "addressee__username")


@admin.register(Badge)
class BadgeAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "metric", "threshold", "sort_order")
    list_editable = ("metric", "threshold", "sort_order")
    search_fields = ("title", "slug", "description")


@admin.register(UserBadge)
class UserBadgeAdmin(admin.ModelAdmin):
    list_display = ("user", "badge", "earned_at")
    search_fields = ("user__username", "badge__title")
