import { Link } from "react-router-dom";
import {
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Quote,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayerStore } from "@/store/player";
import { useUiStore } from "@/store/ui";
import { cn, formatDuration } from "@/lib/utils";
import { LikeButton } from "@/components/music/LikeButton";

function PlayButton({ playing, onClick, size = "md" }: { playing: boolean; onClick: () => void; size?: "md" | "sm" }) {
  return (
    <button
      onClick={onClick}
      aria-label={playing ? "Pause" : "Play"}
      className={cn(
        "flex items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95",
        size === "md" ? "h-9 w-9" : "h-9 w-9",
      )}
    >
      {playing ? (
        <Pause className="h-4 w-4 fill-current" />
      ) : (
        <Play className="ml-0.5 h-4 w-4 fill-current" />
      )}
    </button>
  );
}

function ProgressBar({ compact = false }: { compact?: boolean }) {
  const progress = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);
  const seek = usePlayerStore((state) => state.seek);
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <div className={cn("flex w-full items-center gap-2", compact && "gap-1.5")}>
      {!compact && <span className="w-9 text-right text-[11px] tabular-nums text-white/50">{formatDuration(progress)}</span>}
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
      {!compact && <span className="w-9 text-[11px] tabular-nums text-white/50">{formatDuration(duration)}</span>}
    </div>
  );
}

export function PlayerBar() {
  const {
    queue,
    index,
    isPlaying,
    shuffle,
    repeat,
    volume,
    muted,
    queueOpen,
    lyricsOpen,
    buffering,
    progress,
    duration,
    togglePlay,
    next,
    prev,
    toggleShuffle,
    cycleRepeat,
    setVolume,
    toggleMute,
    setQueueOpen,
    toggleLyrics,
  } = usePlayerStore();
  const setMobilePlayerOpen = useUiStore((state) => state.setMobilePlayerOpen);
  const track = queue[index];

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  if (!track) return null;

  return (
    <>
      {/* Desktop player */}
      <footer className="hidden h-[90px] items-center gap-4 border-t border-white/[0.07] bg-black/95 px-4 md:flex">
        <div className="flex w-[30%] min-w-0 items-center gap-3">
          <Link to={`/album/${track.album.id}`} className="group relative shrink-0">
            <img
              src={track.album.cover_small || track.album.cover}
              alt={track.album.title}
              className="h-14 w-14 rounded-md object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
              <Maximize2 className="h-4 w-4" />
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <Link to={`/album/${track.album.id}`} className="block truncate text-sm font-medium hover:underline">
              {track.title}
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to={`/artist/${track.artist.id}`}
                className="min-w-0 truncate text-xs text-white/55 hover:text-white hover:underline"
              >
                {track.artist.name}
              </Link>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                  track.has_full_audio ? "bg-primary/15 text-primary" : "bg-white/10 text-white/40",
                )}
              >
                {track.has_full_audio ? "Full track" : "Preview 30s"}
              </span>
            </div>
          </div>
          <LikeButton track={track} />
        </div>

        <div className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex items-center gap-5">
            <button
              onClick={toggleShuffle}
              aria-label="Toggle shuffle"
              className={cn("relative transition hover:text-white", shuffle ? "text-primary" : "text-white/55")}
            >
              <Shuffle className="h-[18px] w-[18px]" />
              {shuffle && <span className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
            </button>
            <button onClick={prev} aria-label="Previous track" className="text-white/70 transition hover:text-white">
              <SkipBack className="h-5 w-5 fill-current" />
            </button>
            <div className="relative">
              <PlayButton playing={isPlaying} onClick={togglePlay} />
              {buffering && (
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-black/20 border-t-black/60" />
              )}
            </div>
            <button onClick={() => next()} aria-label="Next track" className="text-white/70 transition hover:text-white">
              <SkipForward className="h-5 w-5 fill-current" />
            </button>
            <button
              onClick={cycleRepeat}
              aria-label="Change repeat mode"
              className={cn("relative transition hover:text-white", repeat !== "off" ? "text-primary" : "text-white/55")}
            >
              {repeat === "one" ? <Repeat1 className="h-[18px] w-[18px]" /> : <Repeat className="h-[18px] w-[18px]" />}
              {repeat !== "off" && (
                <span className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          </div>
          <div className="flex w-full max-w-[620px] items-center">
            <ProgressBar />
          </div>
        </div>

        <div className="flex w-[30%] items-center justify-end gap-2">
          <button
            onClick={toggleLyrics}
            aria-label={lyricsOpen ? "Hide lyrics" : "Show lyrics"}
            className={cn("rounded-full p-1.5 transition hover:text-white", lyricsOpen ? "text-primary" : "text-white/55")}
          >
            <Quote className="h-4 w-4" />
          </button>
          <button
            onClick={() => setQueueOpen(!queueOpen)}
            aria-label="Toggle queue"
            className={cn("rounded-full p-1.5 transition hover:text-white", queueOpen ? "text-primary" : "text-white/55")}
          >
            <ListMusic className="h-4 w-4" />
          </button>
          <button onClick={toggleMute} aria-label="Mute" className="p-1 text-white/55 transition hover:text-white">
            <VolumeIcon className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="musicly-range w-24"
            style={{ ["--range-progress" as string]: `${(muted ? 0 : volume) * 100}%` }}
            aria-label="Volume"
          />
        </div>
      </footer>

      {/* Mobile mini player */}
      <div className="md:hidden">
        <div className="mx-2 flex h-14 items-center gap-2 rounded-lg bg-ink-700 px-2">
          <button
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            onClick={() => setMobilePlayerOpen(true)}
            aria-label="Open now playing"
          >
            <img src={track.album.cover_small || track.album.cover} alt="" className="h-10 w-10 rounded object-cover" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{track.title}</p>
              <p className="truncate text-[11px] text-white/55">{track.artist.name}</p>
            </div>
          </button>
          <LikeButton track={track} size="sm" className="shrink-0" />
          <button
            onClick={togglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
          </button>
          <button onClick={() => next()} className="p-1 text-white/70" aria-label="Next">
            <SkipForward className="h-4 w-4 fill-current" />
          </button>
        </div>
        <div className="mx-2 h-[2px] overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full bg-white/70"
            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
          />
        </div>
      </div>
    </>
  );
}
