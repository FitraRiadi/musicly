from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password

from .models import User


class UserSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "name", "display_name", "bio", "avatar", "is_staff", "created_at"]
        read_only_fields = ["id", "username", "email", "is_staff", "created_at", "name", "avatar"]

    def get_avatar(self, obj: User):
        if not obj.avatar:
            return None
        request = self.context.get("request")
        url = obj.avatar.url
        return request.build_absolute_uri(url) if request else url

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        return instance


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
