from django.db import migrations

CDN = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg"

RARE_BADGES = [
    {
        "slug": "hub-legend",
        "title": "Hub Legend",
        "description": "Join 100 Song Hubs. A rare badge for the listener every room remembers.",
        "image_url": f"{CDN}/1f48e.svg",
        "metric": "songhub_visits",
        "threshold": 100,
        "sort_order": 210,
    },
]


def seed_rare_badges(apps, schema_editor):
    Badge = apps.get_model("accounts", "Badge")
    for item in RARE_BADGES:
        Badge.objects.update_or_create(slug=item["slug"], defaults=item)


def remove_rare_badges(apps, schema_editor):
    Badge = apps.get_model("accounts", "Badge")
    Badge.objects.filter(slug__in=[item["slug"] for item in RARE_BADGES]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_seed_advanced_badges"),
    ]

    operations = [
        migrations.RunPython(seed_rare_badges, remove_rare_badges),
    ]
