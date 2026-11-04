from django.db import migrations

CDN = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg"

BADGES = [
    {
        "slug": "marathon-listener",
        "title": "Marathon Listener",
        "description": "Listen on 30 different days. A month of showing up for the music.",
        "image_url": f"{CDN}/1f3c3.svg",
        "metric": "listening_days",
        "threshold": 30,
        "sort_order": 70,
    },
    {
        "slug": "sonic-explorer",
        "title": "Sonic Explorer",
        "description": "Discover 150 different artists across your listening history.",
        "image_url": f"{CDN}/1f30d.svg",
        "metric": "distinct_artists",
        "threshold": 150,
        "sort_order": 80,
    },
    {
        "slug": "deep-cuts",
        "title": "Deep Cuts",
        "description": "Play 500 unique tracks. No repeats, no shortcuts.",
        "image_url": f"{CDN}/1f4bf.svg",
        "metric": "unique_tracks",
        "threshold": 500,
        "sort_order": 90,
    },
    {
        "slug": "master-librarian",
        "title": "Master Librarian",
        "description": "File 100 songs into your own playlists with care.",
        "image_url": f"{CDN}/1f4da.svg",
        "metric": "playlist_tracks",
        "threshold": 100,
        "sort_order": 100,
    },
    {
        "slug": "tastemaker",
        "title": "Tastemaker",
        "description": "Have 25 saves across the public playlists you created.",
        "image_url": f"{CDN}/1f451.svg",
        "metric": "playlist_saves_received",
        "threshold": 25,
        "sort_order": 110,
    },
    {
        "slug": "devoted-fan",
        "title": "Devoted Fan",
        "description": "Follow 10 artists whose next release you never want to miss.",
        "image_url": f"{CDN}/1f3b8.svg",
        "metric": "followed_artists",
        "threshold": 10,
        "sort_order": 120,
    },
    {
        "slug": "night-owl",
        "title": "Night Owl",
        "description": "Play 50 tracks between 10pm and 4am. The late shift is yours.",
        "image_url": f"{CDN}/1f989.svg",
        "metric": "night_plays",
        "threshold": 50,
        "sort_order": 130,
    },
    {
        "slug": "unstoppable",
        "title": "Unstoppable",
        "description": "Build a 14-day listening streak without missing a day.",
        "image_url": f"{CDN}/1f525.svg",
        "metric": "listening_streak",
        "threshold": 14,
        "sort_order": 140,
    },
    {
        "slug": "hub-founder",
        "title": "Hub Founder",
        "description": "Open 5 Song Hubs and bring listeners together.",
        "image_url": f"{CDN}/1f3e0.svg",
        "metric": "songhub_rooms",
        "threshold": 5,
        "sort_order": 150,
    },
    {
        "slug": "hub-regular",
        "title": "Hub Regular",
        "description": "Join Song Hubs 20 times and become part of the crowd.",
        "image_url": f"{CDN}/1f6aa.svg",
        "metric": "songhub_visits",
        "threshold": 20,
        "sort_order": 160,
    },
    {
        "slug": "chatterbox",
        "title": "Chatterbox",
        "description": "Send 200 chat messages or stickers inside Song Hubs.",
        "image_url": f"{CDN}/1f4ac.svg",
        "metric": "songhub_messages",
        "threshold": 200,
        "sort_order": 170,
    },
    {
        "slug": "reaction-legend",
        "title": "Reaction Legend",
        "description": "Send 150 room reactions. Make every drop feel alive.",
        "image_url": f"{CDN}/1f3ad.svg",
        "metric": "songhub_reactions",
        "threshold": 150,
        "sort_order": 180,
    },
    {
        "slug": "request-line-legend",
        "title": "Request Line Legend",
        "description": "Request 50 songs in Song Hubs and shape the setlist.",
        "image_url": f"{CDN}/1f3a4.svg",
        "metric": "songhub_requests",
        "threshold": 50,
        "sort_order": 190,
    },
    {
        "slug": "thousand-spins",
        "title": "Thousand Spins",
        "description": "Reach 1,000 total plays. A true Musicly veteran.",
        "image_url": f"{CDN}/1f3c6.svg",
        "metric": "plays",
        "threshold": 1000,
        "sort_order": 200,
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
        ("accounts", "0004_alter_badge_metric"),
        ("songhub", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_badges, remove_badges),
    ]
