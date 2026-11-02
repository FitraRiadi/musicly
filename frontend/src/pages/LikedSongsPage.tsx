import { useEffect, useState } from "react";
import { Heart, Play, Shuffle } from "lucide-react";
import { api } from "@/lib/api";
import type { Track } from "@/lib/types";
import { TrackList } from "@/components/music/TrackList";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";
import { formatLongDuration, shuffleArray } from "@/lib/utils";

export function LikedSongsPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const playContext = usePlayerStore((state) => state.playContext);
  const likedMap = useLibraryStore((state) => state.liked);
  const toggleLike = useLibraryStore((state) => state.toggleLike);
  const toast = useUiStore((state) => state.toast);

  useEffect(() => {
    api
      .likes()
      .then((data) => setTracks(data.items.map((item) => item.track)))
      .catch(() => toast("Could not load your liked songs.", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTracks((current) => current.filter((track) => likedMap[track.id]));
  }, [likedMap]);

  const totalSeconds = tracks.reduce((sum, track) => sum + track.duration, 0);

  return (
    <div className="animate-fade-up pb-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-b from-[#4b1fa8] via-[#2a1160]/70 to-ink-850" />

      <div className="relative -mx-4 px-4 pt-6 md:-mx-7 md:px-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <div className="flex h-44 w-44 items-center justify-center rounded-lg bg-gradient-to-br from-[#5a2fd1] to-[#c9bcff] shadow-2xl sm:h-52 sm:w-52 lg:h-56 lg:w-56">
            <Heart className="h-16 w-16 fill-white text-white drop-shadow-lg" />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">Playlist</p>
            <h1 className="mt-2 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Liked Songs
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-semibold text-white">You</span>
              <span className="text-white/55">· {tracks.length} songs</span>
              {totalSeconds > 0 && <span className="text-white/55">· {formatLongDuration(totalSeconds)}</span>}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={() => playContext(tracks, 0, "Liked Songs")}
            disabled={!tracks.length}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black shadow-glow transition hover:scale-105 hover:bg-spotify-bright disabled:opacity-40"
            aria-label="Play liked songs"
          >
            <Play className="ml-1 h-6 w-6 fill-current" />
          </button>
          <button
            onClick={() => playContext(shuffleArray(tracks), 0, "Liked Songs")}
            disabled={!tracks.length}
            className="rounded-full p-2 text-white/60 transition hover:text-white disabled:opacity-40"
            aria-label="Shuffle liked songs"
          >
            <Shuffle className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-7">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tracks.length > 0 ? (
          <TrackList
            tracks={tracks}
            context="Liked Songs"
            onRemove={async (track) => {
              try {
                await toggleLike(track);
                toast("Removed from Liked Songs", "success");
              } catch {
                toast("Could not update Liked Songs.", "error");
              }
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] py-16 text-center">
            <Heart className="h-10 w-10 text-white/25" />
            <p className="text-lg font-bold">Songs you like will appear here</p>
            <p className="max-w-sm text-sm text-white/45">
              Tap the heart on any track to save it to your collection.
            </p>
            <Button asChild variant="secondary" className="mt-2">
              <a href="/search">Find songs</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
