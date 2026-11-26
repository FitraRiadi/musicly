import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Lyrics } from "@/lib/types";

export interface LyricLine {
  time: number;
  text: string;
}

/** Keep already-opened lyrics in memory so the same track never refetches. */
const lyricsCache = new Map<string, Lyrics>();

/** Parse LRC timestamps, including lines with multiple timestamps. */
export function parseLrc(value: string): LyricLine[] {
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

/** Index of the line that is playing at `seconds`, or -1 before the first one. */
export function activeLineIndex(lines: LyricLine[], seconds: number): number {
  let active = -1;
  for (let position = 0; position < lines.length; position += 1) {
    if (lines[position].time <= seconds + 0.15) active = position;
    else break;
  }
  return active;
}

export function useLyrics(trackId: string | undefined) {
  const [data, setData] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!trackId) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    const cached = lyricsCache.get(trackId);
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
      .lyrics(trackId)
      .then((result) => {
        if (!cancelled) {
          lyricsCache.set(trackId, result);
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
  }, [trackId]);

  return { data, loading, error };
}
