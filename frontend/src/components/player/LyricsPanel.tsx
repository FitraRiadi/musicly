import { useEffect, useMemo, useRef, useState } from "react";
import { Music2, Quote, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Lyrics } from "@/lib/types";
import { usePlayerStore } from "@/store/player";
import { cn } from "@/lib/utils";

interface LyricLine {
  time: number;
  text: string;
}

/** Keep already-opened lyrics in memory so toggling the panel is instant. */
const lyricsCache = new Map<string, Lyrics>();

/** Parse LRC timestamps, including lines with multiple timestamps. */
function parseLrc(value: string): LyricLine[] {
  if (!value) return [];
  const lines: LyricLine[] = [];
  for (const raw of value.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]+\]/g, "").trim();
    if (!text) continue;
    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      const fraction = stamp[3] ? Number(`0.${stamp[3].padEnd(3, "0").slice(0, 3)}`) : 0;
      lines.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

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
  const [data, setData] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([]);

  useEffect(() => {
    if (!lyricsOpen || !track) return;
    const cached = lyricsCache.get(track.id);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    api
      .lyrics(track.id)
      .then((result) => {
        if (!cancelled) {
          lyricsCache.set(track.id, result);
          setData(result);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load lyrics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lyricsOpen, track?.id]);

  const syncedLines = useMemo(() => parseLrc(data?.synced || ""), [data?.synced]);
  const plainLines = useMemo(
    () =>
      (data?.plain || "")
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line, position, all) => line.trim() || (position > 0 && position < all.length - 1)),
    [data?.plain],
  );

  const activeIndex = useMemo(() => {
    if (!syncedLines.length) return -1;
    let active = -1;
    for (let position = 0; position < syncedLines.length; position += 1) {
      if (syncedLines[position].time <= progress + 0.15) active = position;
      else break;
    }
    return active;
  }, [syncedLines, progress]);

  useEffect(() => {
    if (!lyricsOpen || activeIndex < 0) return;
    lineRefs.current[activeIndex]?.scrollIntoView({
      block: "center",
      behavior: isPlaying ? "smooth" : "auto",
    });
  }, [activeIndex, lyricsOpen, isPlaying]);

  if (!lyricsOpen || !track) return null;

  return (
    <aside className="fixed inset-0 z-[80] flex flex-col bg-ink-900/95 pb-safe pt-safe backdrop-blur-2xl md:inset-auto md:bottom-[104px] md:right-3 md:top-3 md:z-40 md:w-[390px] md:rounded-2xl md:border md:border-white/10 md:bg-ink-800/95 md:pb-0 md:pt-0 md:shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Quote className="h-4 w-4 fill-current" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Lyrics</p>
            <h2 className="mt-0.5 truncate text-sm font-bold">{track.title}</h2>
            <p className="truncate text-xs text-white/50">{track.artist.name}</p>
            <p
              className={cn(
                "mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                track.has_full_audio ? "bg-primary/15 text-primary" : "bg-white/10 text-white/45",
              )}
            >
              {track.has_full_audio ? "Full track" : "Preview 30s"}
            </p>
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
          "Lyrics follow the full track"
        ) : (
          "Synced lyrics follow the full song; you are hearing a 30-second preview"
        )}
      </footer>
    </aside>
  );
}
