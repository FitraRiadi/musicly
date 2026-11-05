import { Link } from "react-router-dom";
import {
  ListMusic,
  Loader2,
  Lock,
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
import { useSongHubStore } from "@/store/songhub";
import { useUiStore } from "@/store/ui";
import { cn, formatDuration } from "@/lib/utils";
import { LikeButton } from "@/components/music/LikeButton";

function PlayButton({
  playing,
  onClick,
  disabled = false,
  size = "md",
}: {
  playing: boolean;
  onClick: () => void;
  disabled?: boolean;
  size?: "md" | "sm";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={playing ? "Pause" : "Play"}
      className={cn(
        "flex items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95",
        size === "md" ? "h-9 w-9" : "h-9 w-9",
        disabled && "cursor-not-allowed opacity-35 hover:scale-100 active:scale-100",
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

function ProgressBar({ compact = false, disabled = false }: { compact?: boolean; disabled?: boolean }) {
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
        disabled={disabled}
        className={cn("musicly-range w-full", disabled && "cursor-not-allowed opacity-40")}
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
  const hubRoom = useSongHubStore((state) => state.room);
  const hubMe = useSongHubStore((state) => state.me);
  const listenOnly = Boolean(hubRoom && hubMe?.role === "member");
  const track = queue[index];
  const imported = track?.source === "imported";

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  if (!track) return null;

  return (
    <>
      {/* Desktop player */}
      <footer className="hidden h-[90px] items-center gap-4 border-t border-white/[0.07] bg-black/95 px-4 md:flex">
        <div className="flex w-[30%] min-w-0 items-center gap-3">
          {imported ? (
            <div className="relative shrink-0">
              <img
                src={track.album.cover_small || track.album.cover}
                alt={track.album.title}
                className="h-14 w-14 rounded-md object-cover"
              />
            </div>
          ) : (
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
          )}
          <div className="min-w-0 flex-1">
            {imported ? (
              <span className="block truncate text-sm font-medium">{track.title}</span>
            ) : (
              <Link to={`/track/${track.id}`} className="block truncate text-sm font-medium hover:underline">
                {track.title}
              </Link>
            )}
            {imported ? (
              <span className="block min-w-0 truncate text-xs text-white/55">{track.artist.name}</span>
            ) : (
              <Link
                to={`/artist/${track.artist.id}`}
                className="block min-w-0 truncate text-xs text-white/55 hover:text-white hover:underline"
              >
                {track.artist.name}
              </Link>
            )}
          </div>
          {listenOnly && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"
              title="The Song Hub host controls playback"
            >
              <Lock className="h-3 w-3" />
              <span className="hidden xl:inline">Listen-only</span>
            </span>
          )}
          <LikeButton track={track} />
        </div>

        <div className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex items-center gap-5">
            <button
              onClick={toggleShuffle}
              disabled={listenOnly}
              aria-label="Toggle shuffle"
              className={cn(
                "relative transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-white/55",
                shuffle ? "text-primary" : "text-white/55",
              )}
            >
              <Shuffle className="h-[18px] w-[18px]" />
              {shuffle && <span className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
            </button>
            <button
              onClick={prev}
              disabled={listenOnly}
              aria-label="Previous track"
              className="text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <SkipBack className="h-5 w-5 fill-current" />
            </button>
            <div className="relative">
              <PlayButton playing={isPlaying} onClick={togglePlay} disabled={listenOnly} />
              {buffering && (
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-black/20 border-t-black/60" />
              )}
            </div>
            <button
              onClick={() => next()}
              disabled={listenOnly}
              aria-label="Next track"
              className="text-white/70 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <SkipForward className="h-5 w-5 fill-current" />
            </button>
            <button
              onClick={cycleRepeat}
              disabled={listenOnly}
              aria-label="Change repeat mode"
              className={cn(
                "relative transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-white/55",
                repeat !== "off" ? "text-primary" : "text-white/55",
              )}
            >
              {repeat === "one" ? <Repeat1 className="h-[18px] w-[18px]" /> : <Repeat className="h-[18px] w-[18px]" />}
              {repeat !== "off" && (
                <span className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          </div>
          <div className="flex w-full max-w-[620px] items-center">
            <ProgressBar disabled={listenOnly || buffering} />
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
          {listenOnly && (
            <span title="Listen-only in Song Hub" className="shrink-0 p-1 text-primary">
              <Lock className="h-3.5 w-3.5" />
            </span>
          )}
          <button
            onClick={togglePlay}
            disabled={listenOnly}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
            aria-label={isPlaying ? "Pause" : "Play"}
            aria-busy={buffering}
          >
            {buffering && !isPlaying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
            )}
          </button>
          <button
            onClick={() => next()}
            disabled={listenOnly}
            className="p-1 text-white/70 disabled:opacity-30"
            aria-label="Next"
          >
            <SkipForward className="h-4 w-4 fill-current" />
          </button>
        </div>
        <div className="mx-2 h-[2px] overflow-hidden rounded-full bg-white/15">
          <div
            className={cn("h-full", listenOnly ? "bg-primary/60" : "bg-white/70")}
            style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
          />
        </div>
      </div>
    </>
  );
}
