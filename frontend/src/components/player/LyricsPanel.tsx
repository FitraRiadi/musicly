import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { GripHorizontal, Music2, Quote, X } from "lucide-react";
import { useDraggablePanel } from "@/hooks/useDraggablePanel";
import { activeLineIndex, parseLrc, useLyrics } from "@/hooks/useLyrics";
import { usePlayerStore } from "@/store/player";
import { cn } from "@/lib/utils";

function LoadingLines() {
  return (
    <div className="space-y-4" aria-label="Loading lyrics">
      {[74, 58, 82, 64, 46, 70].map((width, index) => (
        <div
          key={index}
          className="mx-auto h-4 animate-pulse rounded-full bg-white/10"
          style={{ width: `${width}%`, animationDelay: `${index * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function LyricsPanel() {
  const { queue, index, progress, isPlaying, lyricsOpen, setLyricsOpen } = usePlayerStore();
  const track = queue[index];
  const { data, loading, error } = useLyrics(lyricsOpen ? track?.id : undefined);
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const { panelRef, position, dragging, dragHandleProps } = useDraggablePanel(
    "musicly_lyrics_position",
    lyricsOpen && Boolean(track),
  );

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

  useEffect(() => {
    if (!lyricsOpen || activeIndex < 0) return;
    lineRefs.current[activeIndex]?.scrollIntoView({
      block: "center",
      behavior: isPlaying ? "smooth" : "auto",
    });
  }, [activeIndex, lyricsOpen, isPlaying]);

  if (!lyricsOpen || !track) return null;

  const panelStyle = {
    "--panel-x": `${position.x}px`,
    "--panel-y": `${position.y}px`,
  } as CSSProperties;

  return (
    <aside
      ref={panelRef}
      style={panelStyle}
      className={cn(
        "fixed inset-0 z-[80] flex flex-col bg-ink-900/95 pb-safe pt-safe backdrop-blur-2xl md:inset-auto md:right-3 md:top-3 md:z-40 md:h-[min(680px,calc(100dvh-140px))] md:w-[390px] md:translate-x-[var(--panel-x)] md:translate-y-[var(--panel-y)] md:rounded-2xl md:border md:border-white/10 md:bg-ink-800/95 md:pb-0 md:pt-0 md:shadow-2xl",
        dragging && "md:ring-1 md:ring-primary/35",
      )}
    >
      <header
        {...dragHandleProps}
        className="flex cursor-grab touch-none items-start justify-between gap-4 border-b border-white/10 px-5 py-4 active:cursor-grabbing md:px-6"
        title="Drag to move"
      >
        <div className="flex min-w-0 items-start gap-3">
          <GripHorizontal className="mt-2 h-4 w-4 shrink-0 text-white/20" />
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Quote className="h-4 w-4 fill-current" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Lyrics</p>
            <h2 className="mt-0.5 truncate text-sm font-bold">{track.title}</h2>
            <p className="truncate text-xs text-white/50">{track.artist.name}</p>
          </div>
        </div>
        <button
          onClick={() => setLyricsOpen(false)}
          className="rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
          aria-label="Close lyrics"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="thin-scrollbar flex-1 overflow-y-auto px-6 py-8 md:px-7">
        {loading ? (
          <LoadingLines />
        ) : error ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-center">
            <Music2 className="h-9 w-9 text-white/20" />
            <p className="text-sm font-medium text-white/70">Could not load lyrics</p>
            <p className="max-w-[250px] text-xs text-white/40">{error}</p>
          </div>
        ) : data?.instrumental ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 text-center">
            <Music2 className="h-9 w-9 text-white/20" />
            <p className="text-sm font-medium text-white/70">Instrumental</p>
            <p className="max-w-[250px] text-xs text-white/40">This track has no lyrics.</p>
          </div>
        ) : syncedLines.length ? (
          <div className="space-y-5 pb-[45vh] md:pb-[35vh]">
            {syncedLines.map((line, position) => (
              <p
                key={`${line.time}-${position}`}
                ref={(node) => {
                  lineRefs.current[position] = node;
                }}
                className={cn(
                  "text-center text-[17px] font-semibold leading-snug transition-all duration-300 md:text-lg",
                  position === activeIndex
                    ? "scale-[1.02] text-white"
                    : position < activeIndex
                      ? "text-white/25"
                      : "text-white/40",
                )}
              >
                {line.text}
              </p>
            ))}
          </div>
        ) : plainLines.length ? (
          <div className="space-y-3 pb-10">
            {plainLines.map((line, position) =>
              line.trim() ? (
                <p key={position} className="text-[15px] leading-relaxed text-white/70">
                  {line}
                </p>
              ) : (
                <div key={position} className="h-2" />
              ),
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
            <Music2 className="h-9 w-9 text-white/20" />
            <p className="text-sm font-medium text-white/70">Lyrics not available yet</p>
            <p className="max-w-[250px] text-xs text-white/40">
              We could not find lyrics for this track. An admin can add them in the catalog.
            </p>
          </div>
        )}
      </div>

      <footer className="border-t border-white/10 px-5 py-3 text-center text-[10px] text-white/35 md:px-6">
        {data?.source === "lrclib" ? (
          <>
            Lyrics via{" "}
            <a
              href="https://lrclib.net"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/20 underline-offset-2 hover:text-white/60"
            >
              LRCLIB
            </a>
          </>
        ) : data?.source === "manual" ? (
          "Lyrics added by Musicly"
        ) : data && !data.available ? (
          "No lyrics are stored for this track"
        ) : track.has_full_audio ? (
          "Lyrics follow the playing track"
        ) : (
          "Synced lyrics follow the full song; you are hearing a 30-second preview"
        )}
      </footer>
    </aside>
  );
}
