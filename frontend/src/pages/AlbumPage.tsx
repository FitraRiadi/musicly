import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Disc3, Ellipsis, Play, Share2, Shuffle } from "lucide-react";
import { api } from "@/lib/api";
import type { Album, Artist as ArtistType } from "@/lib/types";
import { TrackList } from "@/components/music/TrackList";
import { MediaCard } from "@/components/music/MediaCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayerStore } from "@/store/player";
import { useUiStore } from "@/store/ui";
import { formatLongDuration, shuffleArray, yearOf } from "@/lib/utils";

export function AlbumPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useUiStore((state) => state.toast);
  const playContext = usePlayerStore((state) => state.playContext);
  const [album, setAlbum] = useState<Album | null>(null);
  const [more, setMore] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .album(id)
      .then((data) => {
        if (!alive) return;
        setAlbum(data);
        if (data.artist?.id) {
          api
            .artist(data.artist.id)
            .then((artist: ArtistType) => {
              if (alive) setMore((artist.album_list || []).filter((item) => item.id !== data.id).slice(0, 6));
            })
            .catch(() => undefined);
        }
      })
      .catch((err) => alive && setError(err?.message || "Album not found."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6 pt-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <Skeleton className="h-56 w-56 rounded-xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <Disc3 className="h-10 w-10 text-white/30" />
        <p className="text-xl font-bold">Album not available</p>
        <p className="text-sm text-white/50">{error}</p>
        <Button variant="secondary" onClick={() => navigate("/search")}>
          Search for music
        </Button>
      </div>
    );
  }

  const tracks = album.tracks || [];
  const totalSeconds = tracks.reduce((sum, track) => sum + track.duration, 0);

  return (
    <div className="animate-fade-up pb-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-30 blur-3xl"
          style={{ backgroundImage: `url(${album.cover})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink-850/60 to-ink-850" />
      </div>

      <div className="relative -mx-4 px-4 pt-6 md:-mx-7 md:px-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <img
            src={album.cover}
            alt={album.title}
            className="h-44 w-44 rounded-lg object-cover shadow-2xl sm:h-52 sm:w-52 lg:h-60 lg:w-60"
          />
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
              {album.record_type === "single" ? "Single" : "Album"}
            </p>
            <h1 className="mt-2 text-balance text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {album.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-sm text-white/65">
              <Link to={`/artist/${album.artist.id}`} className="font-semibold text-white hover:underline">
                {album.artist.name}
              </Link>
              {album.release_date && <span>· {yearOf(album.release_date)}</span>}
              <span>· {tracks.length} songs</span>
              {totalSeconds > 0 && <span>· {formatLongDuration(totalSeconds)}</span>}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={() => playContext(tracks, 0, album.title)}
            disabled={!tracks.length}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black shadow-glow transition hover:scale-105 hover:bg-spotify-bright disabled:opacity-40"
            aria-label="Play album"
          >
            <Play className="ml-1 h-6 w-6 fill-current" />
          </button>
          <button
            onClick={() => playContext(shuffleArray(tracks), 0, album.title)}
            className="rounded-full p-2 text-white/60 transition hover:text-white"
            aria-label="Shuffle album"
          >
            <Shuffle className="h-5 w-5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full p-2 text-white/60 transition hover:text-white" aria-label="More album options">
                <Ellipsis className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    toast("Album link copied", "success");
                  } catch {
                    toast("Could not copy link", "error");
                  }
                }}
              >
                <Share2 className="h-4 w-4" /> Copy album link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/artist/${album.artist.id}`)}>
                <Disc3 className="h-4 w-4" /> Go to artist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-6">
        <TrackList tracks={tracks} context={album.title} showCover={false} />
      </div>

      <p className="mt-8 text-[11px] text-white/35">
        {album.release_date && `${new Date(album.release_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · `}
        © {yearOf(album.release_date) || new Date().getFullYear()} {album.artist.name} · Distributed by Deezer
      </p>

      {more.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-xl font-bold">More by {album.artist.name}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {more.map((item) => (
              <MediaCard key={item.id} item={item} kind="album" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
