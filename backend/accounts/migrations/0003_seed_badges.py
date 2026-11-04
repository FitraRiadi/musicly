from django.db import migrations


BADGES = [
    {
        "slug": "first-spin",
        "title": "First Spin",
        "description": "Play your first track on Musicly.",
        "image_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f3b5.svg",
        "metric": "plays",
        "threshold": 1,
        "sort_order": 10,
    },
    {
        "slug": "melomane",
        "title": "Melomane",
        "description": "Listen to 100 tracks and grow your taste profile.",
        "image_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f3a7.svg",
        "metric": "plays",
        "threshold": 100,
        "sort_order": 20,
    },
    {
        "slug": "heart-collector",
        "title": "Heart Collector",
        "description": "Like 25 songs that speak to you.",
        "image_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f496.svg",
        "metric": "likes",
        "threshold": 25,
        "sort_order": 30,
    },
    {
        "slug": "social-butterfly",
        "title": "Social Butterfly",
        "description": "Become friends with 3 people on Musicly.",
        "image_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f91d.svg",
        "metric": "friends",
        "threshold": 3,
        "sort_order": 40,
    },
    {
        "slug": "curator",
        "title": "Curator",
        "description": "Publish 3 public playlists for the community.",
        "image_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4c0.svg",
        "metric": "public_playlists",
        "threshold": 3,
        "sort_order": 50,
    },
    {
        "slug": "playlist-hoarder",
        "title": "Playlist Hoarder",
        "description": "Save 5 public playlists from other listeners.",
        "image_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f31f.svg",
        "metric": "saved_playlists",
        "threshold": 5,
        "sort_order": 60,
    },
]


def seed_badges(apps, schema_editor):
    Badge = apps.get_model("accounts", "Badge")
    for item in BADGES:
        Badge.objects.update_or_create(slug=item["slug"], defaults=item)


def remove_badges(apps, schema_editor):
    Badge = apps.get_model("accounts", "Badge")
    Badge.objects.filter(slug__in=[item["slug"] for item in BADGES]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_badge_friendship_userbadge"),
    ]

    operations = [
        migrations.RunPython(seed_badges, remove_badges),
    ]
