import { Link } from "react-router-dom";
import {
  ChevronDown,
  ListMusic,
  ListPlus,
  Loader2,
  Lock,
  Pause,
  Play,
  Quote,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useSongHubStore } from "@/store/songhub";
import { useUiStore } from "@/store/ui";
import { cn, formatDuration, gradientFromString } from "@/lib/utils";
import { LikeButton } from "@/components/music/LikeButton";

export function MobileNowPlaying() {
  const { queue, index, isPlaying, buffering, progress, duration, shuffle, repeat, context, togglePlay, next, prev, seek, toggleShuffle, cycleRepeat, setLyricsOpen, setQueueOpen } =
    usePlayerStore();
  const open = useUiStore((state) => state.mobilePlayerOpen);
  const setOpen = useUiStore((state) => state.setMobilePlayerOpen);
  const openAddToPlaylist = useUiStore((state) => state.openAddToPlaylist);
  const hubRoom = useSongHubStore((state) => state.room);
  const hubMe = useSongHubStore((state) => state.me);
  const listenOnly = Boolean(hubRoom && hubMe?.role === "member");
  const track = queue[index];

  if (!open || !track) return null;
  const imported = track.source === "imported";
  const pct = duration ? (progress / duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-ink-900 md:hidden"
      style={{ background: gradientFromString(track.album.title || track.title) }}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <div className="relative flex h-full flex-col px-5 pb-8 pt-safe">
        <div className="flex items-center justify-between py-3">
          <button onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-white/10" aria-label="Close player">
            <ChevronDown className="h-6 w-6" />
          </button>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Playing from</p>
            <p className="max-w-[200px] truncate text-xs font-semibold">{context || "Musicly"}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setQueueOpen(true)}
              className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
              aria-label="Open queue"
              title="Open queue"
            >
              <ListMusic className="h-5 w-5" />
            </button>
            <button
              onClick={() => setLyricsOpen(true)}
              className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
              aria-label="Show lyrics"
            >
              <Quote className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-6">
          <img
            src={track.album.cover}
            alt={track.album.title}
            className="mx-auto w-full max-w-[340px] rounded-xl object-cover shadow-2xl"
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {imported ? (
                <span className="line-clamp-2 text-2xl font-bold leading-tight">{track.title}</span>
              ) : (
                <Link to={`/track/${track.id}`} className="line-clamp-2 text-2xl font-bold leading-tight">
                  {track.title}
                </Link>
              )}
              {imported ? (
                <span className="mt-1 block truncate text-base text-white/70">{track.artist.name}</span>
              ) : (
                <Link to={`/artist/${track.artist.id}`} className="mt-1 block truncate text-base text-white/70">
                  {track.artist.name}
                </Link>
              )}
              {listenOnly && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  <Lock className="h-3 w-3" /> Listen-only · the host controls playback
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => openAddToPlaylist(track)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Add to playlist"
                title="Add to playlist"
              >
                <ListPlus className="h-5 w-5" />
              </button>
              <LikeButton track={track} />
            </div>
          </div>

          <div>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              value={Math.min(progress, duration || 1)}
              onChange={(event) => seek(Number(event.target.value))}
              disabled={listenOnly || buffering}
              className={cn("musicly-range w-full", (listenOnly || buffering) && "cursor-not-allowed opacity-40")}
              style={{ ["--range-progress" as string]: `${pct}%` }}
              aria-label="Seek"
            />
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-white/60">
              <span>{formatDuration(progress)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={toggleShuffle}
              disabled={listenOnly}
              className={cn(shuffle ? "text-primary" : "text-white/70", listenOnly && "opacity-30")}
              aria-label="Shuffle"
            >
              <Shuffle className="h-5 w-5" />
            </button>
            <button onClick={prev} disabled={listenOnly} className="disabled:opacity-30" aria-label="Previous">
              <SkipBack className="h-8 w-8 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              disabled={listenOnly}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl disabled:opacity-40"
              aria-label={isPlaying ? "Pause" : "Play"}
              aria-busy={buffering}
            >
              {buffering && !isPlaying ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-7 w-7 fill-current" />
              ) : (
                <Play className="ml-1 h-7 w-7 fill-current" />
              )}
            </button>
            <button onClick={() => next()} disabled={listenOnly} className="disabled:opacity-30" aria-label="Next">
              <SkipForward className="h-8 w-8 fill-current" />
            </button>
            <button
              onClick={cycleRepeat}
              disabled={listenOnly}
              className={cn(repeat !== "off" ? "text-primary" : "text-white/70", listenOnly && "opacity-30")}
              aria-label="Repeat"
            >
              {repeat === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
