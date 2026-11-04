from django.db import migrations

CDN = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg"

HUB_LEGEND = {
    "slug": "hub-legend",
    "title": "Hub Legend",
    "description": "A rare badge for creators whose playlists are saved 500 times by other listeners.",
    "image_url": f"{CDN}/1f48e.svg",
    "metric": "playlist_saves_received",
    "threshold": 500,
    "rarity": "rare",
    "sort_order": 210,
}


def update_hub_legend(apps, schema_editor):
    Badge = apps.get_model("accounts", "Badge")
    Badge.objects.update_or_create(slug=HUB_LEGEND["slug"], defaults=HUB_LEGEND)


def restore_hub_legend(apps, schema_editor):
    Badge = apps.get_model("accounts", "Badge")
    Badge.objects.filter(slug=HUB_LEGEND["slug"]).update(
        description="Join 100 Song Hubs. A rare badge for the listener every room remembers.",
        metric="songhub_visits",
        threshold=100,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0007_badge_rarity"),
    ]

    operations = [
        migrations.RunPython(update_hub_legend, restore_hub_legend),
    ]
