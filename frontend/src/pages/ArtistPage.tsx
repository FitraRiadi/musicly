import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, Ellipsis, Play, Share2, Shuffle, UserCheck, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import type { Artist } from "@/lib/types";
import { TrackList } from "@/components/music/TrackList";
import { MediaCard } from "@/components/music/MediaCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayerStore } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import { formatCount, shuffleArray } from "@/lib/utils";

export function ArtistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useUiStore((state) => state.toast);
  const user = useAuthStore((state) => state.user);
  const playContext = usePlayerStore((state) => state.playContext);
  const isFollowing = useLibraryStore((state) => (id ? Boolean(state.followed[id]) : false));
  const toggleFollow = useLibraryStore((state) => state.toggleFollow);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .artist(id)
      .then((data) => alive && setArtist(data))
      .catch((err) => alive && setError(err?.message || "Artist not found."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const follow = async () => {
    if (!artist) return;
    if (!user) {
      toast("Log in to follow artists.", "error");
      navigate("/login");
      return;
    }
    try {
      const nowFollowing = await toggleFollow(artist.id, artist.name, artist.picture);
      toast(nowFollowing ? `Following ${artist.name}` : `Unfollowed ${artist.name}`, "success");
    } catch {
      toast("Could not update your following list.", "error");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pt-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <UserPlus className="h-10 w-10 text-white/30" />
        <p className="text-xl font-bold">Artist not available</p>
        <p className="text-sm text-white/50">{error}</p>
        <Button variant="secondary" onClick={() => navigate("/search")}>
          Search for artists
        </Button>
      </div>
    );
  }

  const topTracks = artist.top_tracks || [];

  return (
    <div className="animate-fade-up pb-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px] overflow-hidden">
        {artist.picture && (
          <div
            className="absolute inset-0 bg-cover bg-[center_30%] opacity-40 blur-2xl"
            style={{ backgroundImage: `url(${artist.picture})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-ink-850/55 to-ink-850" />
      </div>

      <div className="relative -mx-4 flex flex-col gap-6 px-4 pt-8 md:-mx-7 md:px-7">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
          <img
            src={artist.picture}
            alt={artist.name}
            className="h-40 w-40 rounded-full object-cover shadow-2xl ring-4 ring-black/20 sm:h-52 sm:w-52"
          />
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">
              <BadgeCheck className="h-4 w-4 text-sky-400" /> Verified artist
            </div>
            <h1 className="mt-2 text-balance text-4xl font-extrabold leading-none tracking-tight sm:text-6xl lg:text-7xl">
              {artist.name}
            </h1>
            <p className="mt-4 text-sm text-white/60">
              {formatCount(artist.fans)} monthly listeners · {formatCount(artist.albums)} releases
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => playContext(topTracks, 0, artist.name)}
            disabled={!topTracks.length}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black shadow-glow transition hover:scale-105 hover:bg-spotify-bright disabled:opacity-40"
            aria-label={`Play ${artist.name}`}
          >
            <Play className="ml-1 h-6 w-6 fill-current" />
          </button>
          <button
            onClick={() => playContext(shuffleArray(topTracks), 0, artist.name)}
            className="rounded-full p-2 text-white/60 transition hover:text-white"
            aria-label="Shuffle artist"
          >
            <Shuffle className="h-5 w-5" />
          </button>
          <Button variant="outline" onClick={follow} className="gap-2">
            {isFollowing ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {isFollowing ? "Following" : "Follow"}
          </Button>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {formatCount(artist.fans)} fans
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full p-2 text-white/60 transition hover:text-white" aria-label="More artist options">
                <Ellipsis className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    toast("Artist link copied", "success");
                  } catch {
                    toast("Could not copy link", "error");
                  }
                }}
              >
                <Share2 className="h-4 w-4" /> Copy artist link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <section className="mt-9">
        <h2 className="mb-3 text-xl font-bold">Popular</h2>
        <TrackList tracks={topTracks.slice(0, 5)} context={artist.name} showCover />
      </section>

      {artist.album_list && artist.album_list.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold">Discography</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {artist.album_list.slice(0, 10).map((album) => (
              <MediaCard key={album.id} item={album} kind="album" />
            ))}
          </div>
        </section>
      )}

      {artist.related && artist.related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold">Fans also like</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {artist.related.slice(0, 5).map((related) => (
              <MediaCard key={related.id} item={related} kind="artist" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
