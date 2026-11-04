import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, HardDrive, Loader2, Play, Shuffle, Trash2 } from "lucide-react";
import { TrackList } from "@/components/music/TrackList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDownloadsStore } from "@/store/downloads";
import { usePlayerStore } from "@/store/player";
import { useUiStore } from "@/store/ui";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatBytes, formatLongDuration, shuffleArray } from "@/lib/utils";

export function DownloadsPage() {
  const items = useDownloadsStore((state) => state.items);
  const active = useDownloadsStore((state) => state.active);
  const loaded = useDownloadsStore((state) => state.loaded);
  const load = useDownloadsStore((state) => state.load);
  const clear = useDownloadsStore((state) => state.clear);
  const playContext = usePlayerStore((state) => state.playContext);
  const toast = useUiStore((state) => state.toast);
  const online = useOnlineStatus();

  useEffect(() => {
    void load();
  }, [load]);

  const tracks = items.map((item) => item.track);
  const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
  const totalSeconds = tracks.reduce((sum, track) => sum + track.duration, 0);
  const activeDownloads = Object.values(active).filter((item) => item.status === "downloading");

  const handleClear = async () => {
    if (!items.length) return;
    if (!window.confirm("Remove all downloaded music from this device?")) return;
    try {
      await clear();
      toast("Downloads cleared", "success");
    } catch {
      toast("Could not clear downloads.", "error");
    }
  };

  return (
    <div className="animate-fade-up pb-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-b from-[#0d6240] via-[#073a28]/75 to-ink-850" />

      <div className="relative -mx-4 px-4 pt-6 md:-mx-7 md:px-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <div className="flex h-44 w-44 items-center justify-center rounded-lg bg-gradient-to-br from-[#1ed760] via-[#0f9d58] to-[#053b26] shadow-2xl sm:h-52 sm:w-52 lg:h-56 lg:w-56">
            <Download className="h-16 w-16 text-white drop-shadow-lg" />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">Playlist</p>
              {!online && (
                <Badge variant="outline" className="gap-1 border-amber-300/30 text-amber-200">
                  Offline mode
                </Badge>
              )}
            </div>
            <h1 className="mt-2 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Downloads
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-semibold text-white">You</span>
              <span className="text-white/55">· {tracks.length} songs</span>
              {totalSeconds > 0 && <span className="text-white/55">· {formatLongDuration(totalSeconds)}</span>}
              {totalBytes > 0 && <span className="text-white/55">· {formatBytes(totalBytes)}</span>}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-white/45">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              Stored on this device and ready without internet.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => playContext(tracks, 0, "Downloads")}
            disabled={!tracks.length}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black shadow-glow transition hover:scale-105 hover:bg-spotify-bright disabled:opacity-40"
            aria-label="Play downloads"
          >
            <Play className="ml-1 h-6 w-6 fill-current" />
          </button>
          <button
            onClick={() => playContext(shuffleArray(tracks), 0, "Downloads")}
            disabled={!tracks.length}
            className="rounded-full p-2 text-white/60 transition hover:text-white disabled:opacity-40"
            aria-label="Shuffle downloads"
          >
            <Shuffle className="h-5 w-5" />
          </button>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto gap-2 text-white/55 hover:text-white"
              onClick={() => void handleClear()}
              disabled={activeDownloads.length > 0}
              title={activeDownloads.length > 0 ? "Wait for downloads to finish" : "Remove all downloads"}
            >
              <Trash2 className="h-4 w-4" /> Clear all
            </Button>
          )}
        </div>
      </div>

      {activeDownloads.length > 0 && (
        <div className="mt-7 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Downloading {activeDownloads.length} {activeDownloads.length === 1 ? "song" : "songs"}…
          </div>
          <div className="mt-3 space-y-3">
            {activeDownloads.map((download) => {
              const percent = download.progress != null ? Math.round(download.progress * 100) : null;
              return (
                <div key={download.track.id} className="flex items-center gap-3">
                  <img
                    src={download.track.album.cover_small || download.track.album.cover}
                    alt=""
                    className="h-9 w-9 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-white/80">{download.track.title}</span>
                      <span className="shrink-0 tabular-nums text-white/45">{percent != null ? `${percent}%` : "Saving…"}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={percent != null ? "h-full rounded-full bg-primary transition-all" : "h-full w-1/3 animate-pulse rounded-full bg-primary"}
                        style={percent != null ? { width: `${Math.max(3, percent)}%` } : undefined}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-7">
        {!loaded ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tracks.length > 0 ? (
          <TrackList tracks={tracks} context="Downloads" />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HardDrive className="h-7 w-7" />
            </div>
            <p className="text-lg font-bold">No downloads yet</p>
            <p className="max-w-sm text-sm text-white/45">
              Open a song menu and choose <span className="font-medium text-white/70">Download for offline</span>. Downloaded songs stay on this device and play without internet.
            </p>
            <Button asChild variant="secondary" className="mt-2">
              <Link to="/search">Find songs to download</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
