import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Pause, Play, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { HomeSection, Track } from "@/lib/types";
import { Section } from "@/components/music/Section";
import { useAuthStore } from "@/store/auth";
import { usePlayerStore } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { cn, greeting } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function QuickTile({ track, tracks, index }: { track: Track; tracks: Track[]; index: number }) {
  const { queue, index: queueIndex, isPlaying, playContext, togglePlay } = usePlayerStore();
  const isCurrent = queue[queueIndex]?.id === track.id;

  return (
    <button
      onClick={() => (isCurrent ? togglePlay() : playContext(tracks, index, "Recently played"))}
      className="group flex items-center gap-3 overflow-hidden rounded-lg bg-white/[0.07] pr-3 text-left transition hover:bg-white/[0.14]"
    >
      <img src={track.album.cover_small || track.album.cover} alt="" className="h-14 w-14 object-cover sm:h-16 sm:w-16" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{track.title}</span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-black opacity-0 shadow-glow transition group-hover:opacity-100">
        {isCurrent && isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </span>
    </button>
  );
}

export function HomePage() {
  const user = useAuthStore((state) => state.user);
  const liked = useLibraryStore((state) => state.liked);
  const likedCount = Object.keys(liked).length;
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const playContext = usePlayerStore((state) => state.playContext);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .home()
      .then((data) => {
        if (alive) setSections(data.sections || []);
      })
      .catch((err) => alive && setError(err?.message || "Could not load your home feed."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    api
      .history(8)
      .then((data) => setHistory(data.items.map((item) => item.track)))
      .catch(() => undefined);
  }, [user?.id]);

  const quickTracks = useMemo(() => {
    const fallback = (sections.find((section) => section.kind === "tracks")?.items || []) as Track[];
    const merged: Track[] = [];
    for (const track of [...history, ...fallback]) {
      if (merged.length >= 8) break;
      if (!merged.some((item) => item.id === track.id)) merged.push(track);
    }
    return merged;
  }, [history, sections]);

  const visibleQuickTracks = quickTracks.slice(0, user && likedCount > 0 ? 7 : 8);

  const hour = new Date().getHours();
  const subtitle = hour < 12 ? "Start your day with a soundtrack." : hour < 18 ? "Keep the momentum going." : "Unwind with something good.";

  return (
    <div className="animate-fade-up pb-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(30,215,96,0.16),transparent_65%)]" />

      <div className="relative pt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/90">Musicly</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">{greeting()}</h1>
            <p className="mt-1 text-sm text-white/50">{subtitle}</p>
          </div>
          {!user && (
            <Link
              to="/register"
              className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
            >
              Create a free account →
            </Link>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.05] p-0">
                  <Skeleton className="h-16 w-16 rounded-none rounded-l-lg" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))
            : visibleQuickTracks.map((track, index) => (
                <QuickTile key={track.id} track={track} tracks={visibleQuickTracks} index={index} />
              ))}

          {user && likedCount > 0 && (
            <button
              onClick={() => {
                const tracks = Object.values(liked);
                if (tracks.length) playContext(tracks, 0, "Liked Songs");
              }}
              className="group flex items-center gap-3 overflow-hidden rounded-lg bg-gradient-to-r from-[#3b1a8a] to-white/[0.07] pr-3 text-left transition hover:from-[#4a22a8]"
            >
              <span className="flex h-14 w-14 items-center justify-center bg-gradient-to-br from-[#5a2fd1] to-[#b9a7ff] sm:h-16 sm:w-16">
                <Heart className="h-6 w-6 fill-white text-white" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">Liked Songs</span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-black opacity-0 shadow-glow transition group-hover:opacity-100">
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              </span>
            </button>
          )}

          {!user && !loading && quickTracks.length === 0 && (
            <div className="col-span-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              <Sparkles className="h-5 w-5 text-primary" />
              Sign in to unlock your recently played, liked songs and personal mixes.
            </div>
          )}
        </div>
      </div>

      <div className="relative mt-8 space-y-9">
        {error && (
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <Section key={i} section={{ id: `s${i}`, title: "", kind: "tracks", items: [] }} loading />)
          : sections.map((section) => <Section key={section.id} section={section} />)}
      </div>

      <footer className="mt-14 border-t border-white/[0.06] pt-6 text-[11px] leading-relaxed text-white/35">
        <p className="font-semibold text-white/50">Musicly — a Spotify-inspired listening experience.</p>
        <p className="mt-1 max-w-2xl">
          Catalog metadata, artwork and 30-second previews are provided by the public Deezer API. This is a clone built
          for learning, not affiliated with Spotify or Deezer.
        </p>
        <p className={cn("mt-3", "text-white/25")}>© {new Date().getFullYear()} Musicly. All previews belong to their respective owners.</p>
      </footer>
    </div>
  );
}
