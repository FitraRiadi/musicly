import { useEffect, useState } from "react";
import { Loader2, Music2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Track } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

export function SongPickerDialog({
  open,
  onOpenChange,
  onPick,
  title = "Choose a song",
  description = "Search the Musicly catalog and send it to the room.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (track: Track) => void;
  title?: string;
  description?: string;
}) {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setTracks([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .search(trimmed, "track", 14)
        .then((data) => {
          if (alive) {
            const rows = data.tracks?.length
              ? data.tracks
              : ((data.items as Track[] | undefined) ?? []);
            setTracks(rows);
          }
        })
        .catch(() => {
          if (alive) setTracks([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 320);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search songs…"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="thin-scrollbar max-h-[340px] min-h-[120px] overflow-y-auto rounded-xl border border-white/[0.07] bg-black/20 p-1.5">
          {loading ? (
            <div className="space-y-1 p-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 p-2">
                  <div className="h-10 w-10 animate-pulse rounded bg-white/10" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-white/[0.07]" />
                  </div>
                </div>
              ))}
            </div>
          ) : tracks.length ? (
            tracks.map((track) => (
              <button
                key={track.id}
                onClick={() => {
                  onPick(track);
                  onOpenChange(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/[0.08]"
              >
                <img
                  src={track.album.cover_small || track.album.cover}
                  alt=""
                  className="h-10 w-10 rounded object-cover"
                  loading="lazy"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{track.title}</span>
                  <span className="block truncate text-xs text-white/45">{track.artist.name}</span>
                </span>
                <span className="text-[11px] tabular-nums text-white/35">
                  {formatDuration(track.duration)}
                </span>
              </button>
            ))
          ) : (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center text-white/35">
              {query.trim().length >= 2 ? (
                <>
                  <Music2 className="h-7 w-7" />
                  <p className="text-xs">No songs found. Try another search.</p>
                </>
              ) : (
                <>
                  <Search className="h-7 w-7" />
                  <p className="text-xs">Type at least two characters to search.</p>
                </>
              )}
            </div>
          )}
          {loading && <Loader2 className="sr-only" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
