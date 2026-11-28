import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { activeLineIndex, parseLrc, useLyrics } from "@/hooks/useLyrics";
import { api } from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { cn, formatDuration, gradientFromString } from "@/lib/utils";

/** Track rows carry no artist artwork, so the profile is fetched per artist. */
const artistPictureCache = new Map<string, string>();

function LoadingLines() {
  return (
    <div className="space-y-4" aria-label="Loading lyrics">
      {[74, 58, 82, 64, 46, 70].map((width, index) => (
        <div
          key={index}
          className="h-4 animate-pulse rounded-full bg-white/10"
          style={{ width: `${width}%`, animationDelay: `${index * 90}ms` }}
        />
      ))}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-center">
      <Music2 className="h-9 w-9 text-white/20" />
      <p className="text-sm font-medium text-white/70">{title}</p>
      <p className="max-w-[250px] text-xs text-white/40">{detail}</p>
    </div>
  );
}

export function LyricsPanel() {
  const {
    queue,
    index,
    progress,
    duration,
    isPlaying,
    buffering,
    lyricsOpen,
    setLyricsOpen,
    togglePlay,
    next,
    prev,
    seek,
  } = usePlayerStore();
  const track = queue[index];
  const { data, loading, error } = useLyrics(lyricsOpen ? track?.id : undefined);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [artistPicture, setArtistPicture] = useState("");

  const artistId = track?.artist?.id || "";
  useEffect(() => {
    if (!artistId) {
      setArtistPicture("");
      return;
    }
    const cached = artistPictureCache.get(artistId);
    if (cached !== undefined) {
      setArtistPicture(cached);
      return;
    }
    let alive = true;
    api
      .artist(artistId)
      .then((artist) => {
        const picture = (artist.picture || "").replace("1000x1000", "400x400");
        if (!alive) return;
        artistPictureCache.set(artistId, picture);
        setArtistPicture(picture);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [artistId]);

  const syncedLines = useMemo(() => parseLrc(data?.synced || ""), [data?.synced]);
  const plainLines = useMemo(
    () =>
      (data?.plain || "")
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line, position, all) => line.trim() || (position > 0 && position < all.length - 1)),
    [data?.plain],
  );

  const activeIndex = useMemo(() => activeLineIndex(syncedLines, progress), [syncedLines, progress]);

  // A new track starts its lyrics from the top, not from the previous scroll.
  useEffect(() => {
    if (!lyricsOpen) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [track?.id, lyricsOpen]);

  useEffect(() => {
    if (!lyricsOpen || activeIndex < 0) return;
    lineRefs.current[activeIndex]?.scrollIntoView({
      block: "center",
      behavior: isPlaying ? "smooth" : "auto",
    });
  }, [activeIndex, lyricsOpen, isPlaying]);

  if (!lyricsOpen || !track) return null;

  const cover = track.album.cover || track.album.cover_small || "";
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <aside className="fixed inset-0 z-[80] flex flex-col bg-black pb-safe pt-safe md:flex-row md:gap-2 md:px-2 md:pb-2 md:pt-2">
      {/* Desktop now-playing card */}
      <section
        className="relative hidden min-w-0 shrink-0 flex-col justify-center gap-8 rounded-xl p-8 md:flex md:w-[360px] lg:w-[420px]"
        style={{ background: gradientFromString(track.album.title || track.title) }}
      >
        <div className="pointer-events-none absolute inset-0 bg-black/45" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-black/60" />
        {cover ? (
          <div className="relative mt-8 min-w-0">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-6 -top-12 aspect-square w-[92%] animate-[spin_16s_linear_infinite] rounded-full shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)]"
              style={{
                background:
                  "repeating-radial-gradient(circle at center, #161616 0 2px, #050505 2px 5px)",
                animationPlayState: isPlaying ? "running" : "paused",
              }}
            >
              <div className="absolute inset-[36%] rounded-full border border-white/10 bg-white/[0.04]" />
              <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/15" />
            </div>
            <img
              src={cover}
              alt={track.album.title}
              className="relative aspect-square w-full rounded-lg object-cover shadow-[0_24px_60px_-16px_rgba(0,0,0,0.95)]"
            />
            {(track.artist.picture || artistPicture) ? (
              <img
                src={track.artist.picture || artistPicture}
                alt={track.artist.name}
                className="absolute -bottom-4 -left-4 z-20 h-16 w-16 rounded-full border-[3px] border-ink-950 object-cover shadow-xl lg:h-20 lg:w-20"
              />
            ) : null}
          </div>
        ) : (
          <div className="relative mt-6 flex aspect-square w-full items-center justify-center rounded-lg bg-white/5">
            <Music2 className="h-12 w-12 text-white/20" />
          </div>
        )}
        <div className="relative min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight lg:text-3xl">{track.title}</h1>
          <p className="mt-2 truncate text-sm font-medium text-white/55">
            {track.artist.name}
            {track.album.title ? (
              <>
                <span className="px-1.5 text-white/25">-</span>
                {track.album.title}
              </>
            ) : null}
          </p>
        </div>
      </section>

      {/* Lyrics */}
      <section className="relative flex min-h-0 flex-1 flex-col bg-black md:rounded-xl md:bg-ink-900">
        <div className="flex shrink-0 items-center justify-end px-4 pb-1 pt-3 md:px-6 md:pt-4">
          <button
            onClick={() => setLyricsOpen(false)}
            className="shrink-0 rounded-full p-2 text-white/50 transition hover:text-white"
            aria-label="Minimize lyrics"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M5 8h14" />
              <path d="M8 14h8" />
            </svg>
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-black to-transparent md:from-ink-900" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-black via-black/70 to-transparent md:h-32 md:from-ink-900 md:via-ink-900/80" />
          <div ref={scrollRef} className="thin-scrollbar h-full overflow-y-auto px-6 pb-[40vh] pt-[26vh] md:px-10 md:pb-[35vh] md:pt-[30vh]">
            {loading ? (
              <LoadingLines />
            ) : error ? (
              <EmptyState title="Could not load lyrics" detail={error} />
            ) : data?.instrumental ? (
              <EmptyState title="Instrumental" detail="This track has no lyrics." />
            ) : syncedLines.length ? (
              <div className="space-y-4 md:space-y-5">
                {syncedLines.map((line, position) => (
                  <button
                    type="button"
                    key={`${line.time}-${position}`}
                    ref={(node) => {
                      lineRefs.current[position] = node;
                    }}
                    onClick={() => seek(line.time)}
                    title={`Jump to ${formatDuration(line.time)}`}
                    className={cn(
                      "block w-full cursor-pointer text-left text-[20px] font-bold leading-snug tracking-tight transition-all duration-200 hover:text-white md:text-[26px] lg:text-[30px]",
                      position === activeIndex
                        ? "text-white"
                        : position < activeIndex
                          ? "text-white/20"
                          : "text-white/45",
                    )}
                  >
                    {line.text}
                  </button>
                ))}
              </div>
            ) : plainLines.length ? (
              <div className="space-y-3">
                {plainLines.map((line, position) =>
                  line.trim() ? (
                    <p key={position} className="text-[16px] leading-relaxed text-white/70 md:text-[18px]">
                      {line}
                    </p>
                  ) : (
                    <div key={position} className="h-2" />
                  ),
                )}
              </div>
            ) : (
              <EmptyState
                title="Lyrics not available yet"
                detail="We could not find lyrics for this track. An admin can add them in the catalog."
              />
            )}
          </div>
        </div>

        <div className="hidden shrink-0 px-10 pb-5 pt-4 md:block">
          <div className="flex items-center gap-3">
            <span className="w-10 text-right text-[11px] tabular-nums text-white/40">{formatDuration(progress)}</span>
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
            <span className="w-10 text-[11px] tabular-nums text-white/40">{formatDuration(duration)}</span>
          </div>
          <div className="mt-3 flex items-center justify-center gap-6">
            <button
              onClick={prev}
              className="rounded-full p-2.5 text-white/65 transition hover:bg-white/10 hover:text-white"
              aria-label="Previous track"
            >
              <SkipBack className="h-5 w-5 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {buffering && isPlaying ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              )}
            </button>
            <button
              onClick={() => next()}
              className="rounded-full p-2.5 text-white/65 transition hover:bg-white/10 hover:text-white"
              aria-label="Next track"
            >
              <SkipForward className="h-5 w-5 fill-current" />
            </button>
          </div>
        </div>
      </section>
    </aside>
  );
}
