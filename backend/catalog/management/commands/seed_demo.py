"""Seed a demo listener with playlists, likes and two weeks of history.

Usage: python manage.py seed_demo
The command is idempotent: it reuses the `demo` account and replaces its
listening history so the Tremor dashboard always has data to render.
"""

from __future__ import annotations

import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import User
from catalog import deezer
from catalog.curation import (
    SPOTLIGHT_ARTISTS,
    SPOTLIGHT_DESCRIPTION,
    SPOTLIGHT_PLAYLIST,
)
from catalog.models import (
    FollowedArtist,
    LikedTrack,
    PlayHistory,
    Playlist,
    PlaylistTrack,
    Track,
)
from catalog.serializers import track_from_payload

PLAYLISTS = [
    ("Late night drive", "Synths, neon and open roads. Perfect after midnight."),
    ("Focus flow", "Instrumental-leaning cuts to keep you in the zone."),
    ("Sunday morning", "Slow coffee, warm light and easy listening."),
]


class Command(BaseCommand):
    help = "Create the demo@musicly.app account with playlists and listening history."

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username="demo",
            defaults={
                "email": "demo@musicly.app",
                "display_name": "Demo Listener",
                "bio": "Collecting warm synths, late-night drives and Sunday mornings.",
            },
        )
        user.set_password("Musicly123!")
        user.display_name = user.display_name or "Demo Listener"
        user.email = user.email or "demo@musicly.app"
        user.save()

        try:
            chart = deezer.charts()
            payloads = chart.get("tracks", [])
        except deezer.DeezerError as exc:
            self.stderr.write(f"Could not reach Deezer: {exc}")
            return

        tracks = []
        for payload in payloads:
            if not payload.get("preview"):
                continue
            try:
                tracks.append(track_from_payload(payload))
            except (ValueError, TypeError):
                continue

        if len(tracks) < 10:
            self.stderr.write("Not enough playable tracks returned by Deezer.")
            return

        # A few extra tracks from a second chart page keep things varied.
        try:
            extra = deezer.search("chill", kind="track", limit=20).get("items", [])
            for payload in extra:
                if payload.get("preview") and all(str(t.deezer_id) != payload["id"] for t in tracks):
                    tracks.append(track_from_payload(payload))
        except deezer.DeezerError:
            pass

        # Editorial spotlight: guarantee Rex Orange County, My Chemical Romance,
        # Radiohead and Oasis are represented in the demo library.
        spotlight_groups = []
        spotlight_artists = []
        seen_ids = {str(track.deezer_id) for track in tracks}
        for entry in SPOTLIGHT_ARTISTS:
            try:
                artist = deezer.get_artist(entry["id"])
            except deezer.DeezerError:
                continue
            spotlight_artists.append(artist)
            group = []
            for payload in artist.get("top_tracks", [])[:4]:
                if not payload.get("preview") or str(payload.get("id")) in seen_ids:
                    continue
                try:
                    track = track_from_payload(payload)
                except (ValueError, TypeError):
                    continue
                seen_ids.add(str(payload.get("id")))
                group.append(track)
            if group:
                spotlight_groups.append(group)

        # Interleave the artists so histories, playlists and likes include all four.
        spotlight_tracks = []
        for index in range(max((len(group) for group in spotlight_groups), default=0)):
            for group in spotlight_groups:
                if index < len(group):
                    spotlight_tracks.append(group[index])

        tracks.extend(spotlight_tracks)

        PlayHistory.objects.filter(user=user).delete()
        LikedTrack.objects.filter(user=user).delete()
        Playlist.objects.filter(owner=user).delete()
        FollowedArtist.objects.filter(user=user).delete()

        random.seed(7)
        now = timezone.now()
        created_plays = 0
        for day in range(13, -1, -1):
            for _ in range(random.randint(2, 7)):
                track = random.choice(tracks)
                played_at = now - timedelta(
                    days=day, hours=random.randint(0, 12), minutes=random.randint(0, 59)
                )
                row = PlayHistory.objects.create(user=user, track=track, context="Demo listening")
                PlayHistory.objects.filter(pk=row.pk).update(played_at=played_at)
                created_plays += 1

        # Recent spotlight plays make the editorial artists show up in "Jump
        # back in" and the home quick picks as soon as the demo account logs in.
        for index, track in enumerate(spotlight_tracks[:8]):
            played_at = now - timedelta(minutes=3 + index * 2)
            row = PlayHistory.objects.create(user=user, track=track, context="Alt & indie essentials")
            PlayHistory.objects.filter(pk=row.pk).update(played_at=played_at)
            created_plays += 1

        liked_tracks = random.sample(tracks, k=min(9, len(tracks)))
        for track in spotlight_tracks[:4]:
            if track not in liked_tracks:
                liked_tracks.append(track)
        for track in liked_tracks:
            LikedTrack.objects.get_or_create(user=user, track=track)

        for index, (name, description) in enumerate(PLAYLISTS):
            selection = tracks[index * 3 : index * 3 + 8]
            playlist = Playlist.objects.create(
                owner=user,
                name=name,
                description=description,
                cover_url=selection[0].cover_url if selection else "",
            )
            for position, track in enumerate(selection):
                PlaylistTrack.objects.create(
                    playlist=playlist, track=track, position=position, added_by=user
                )

        if spotlight_tracks:
            selection = spotlight_tracks[:12]
            playlist = Playlist.objects.create(
                owner=user,
                name=SPOTLIGHT_PLAYLIST,
                description=SPOTLIGHT_DESCRIPTION,
                cover_url=selection[0].cover_url,
            )
            for position, track in enumerate(selection):
                PlaylistTrack.objects.create(
                    playlist=playlist, track=track, position=position, added_by=user
                )

        try:
            artists = deezer.charts().get("artists", [])[:5]
            for artist in artists:
                FollowedArtist.objects.get_or_create(
                    user=user,
                    artist_id=int(artist["id"]),
                    defaults={"name": artist["name"], "picture_url": artist["picture"]},
                )
        except deezer.DeezerError:
            pass

        for artist in spotlight_artists:
            FollowedArtist.objects.get_or_create(
                user=user,
                artist_id=int(artist["id"]),
                defaults={"name": artist["name"], "picture_url": artist["picture"]},
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded demo listener with {len(tracks)} cached tracks, "
                f"{created_plays} plays, "
                f"{Playlist.objects.filter(owner=user).count()} playlists, "
                f"{LikedTrack.objects.filter(user=user).count()} likes and "
                f"{FollowedArtist.objects.filter(user=user).count()} followed artists."
            )
        )
        self.stdout.write("Login: demo / Musicly123!")
