from django.db import migrations, models


def mark_rare_badges(apps, schema_editor):
    Badge = apps.get_model("accounts", "Badge")
    Badge.objects.filter(slug="hub-legend").update(rarity="rare")


def unmark_rare_badges(apps, schema_editor):
    Badge = apps.get_model("accounts", "Badge")
    Badge.objects.filter(slug="hub-legend").update(rarity="standard")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_seed_rare_badge"),
    ]

    operations = [
        migrations.AddField(
            model_name="badge",
            name="rarity",
            field=models.CharField(
                choices=[("standard", "Standard"), ("rare", "Rare")],
                default="standard",
                max_length=12,
            ),
        ),
        migrations.RunPython(mark_rare_badges, unmark_rare_badges),
    ]
