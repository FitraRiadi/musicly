import { Link } from "react-router-dom";
import {
  ChevronDown,
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
import { useUiStore } from "@/store/ui";
import { cn, formatDuration, gradientFromString } from "@/lib/utils";
import { LikeButton } from "@/components/music/LikeButton";

export function MobileNowPlaying() {
  const { queue, index, isPlaying, progress, duration, shuffle, repeat, context, togglePlay, next, prev, seek, toggleShuffle, cycleRepeat, setLyricsOpen } =
    usePlayerStore();
  const open = useUiStore((state) => state.mobilePlayerOpen);
  const setOpen = useUiStore((state) => state.setMobilePlayerOpen);
  const track = queue[index];

  if (!open || !track) return null;
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
          <button
            onClick={() => setLyricsOpen(true)}
            className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
            aria-label="Show lyrics"
          >
            <Quote className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-6">
          <img
            src={track.album.cover}
            alt={track.album.title}
            className="mx-auto w-full max-w-[340px] rounded-xl object-cover shadow-2xl"
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/album/${track.album.id}`} className="line-clamp-2 text-2xl font-bold leading-tight">
                {track.title}
              </Link>
              <Link to={`/artist/${track.artist.id}`} className="mt-1 block truncate text-base text-white/70">
                {track.artist.name}
              </Link>
            </div>
            <LikeButton track={track} />
          </div>

          <div>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              value={Math.min(progress, duration || 1)}
              onChange={(event) => seek(Number(event.target.value))}
              className="musicly-range w-full"
              style={{ ["--range-progress" as string]: `${pct}%` }}
              aria-label="Seek"
            />
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-white/60">
              <span>{formatDuration(progress)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={toggleShuffle} className={cn(shuffle ? "text-primary" : "text-white/70")} aria-label="Shuffle">
              <Shuffle className="h-5 w-5" />
            </button>
            <button onClick={prev} aria-label="Previous">
              <SkipBack className="h-8 w-8 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="ml-1 h-7 w-7 fill-current" />}
            </button>
            <button onClick={() => next()} aria-label="Next">
              <SkipForward className="h-8 w-8 fill-current" />
            </button>
            <button onClick={cycleRepeat} className={cn(repeat !== "off" ? "text-primary" : "text-white/70")} aria-label="Repeat">
              {repeat === "one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
