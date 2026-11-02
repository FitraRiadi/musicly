from django.contrib import admin

from .models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("username", "email", "display_name", "is_staff", "created_at")
    search_fields = ("username", "email", "display_name")
