import { Link, useNavigate } from "react-router-dom";
import {
  Clock3,
  Download,
  Ellipsis,
  FileDown,
  ListPlus,
  ListStart,
  Loader2,
  Music2,
  Pause,
  Play,
  Plus,
  Share2,
  Trash2,
  User,
  Disc3,
  Heart,
  CheckCircle2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayerStore } from "@/store/player";
import { useDownloadsStore } from "@/store/downloads";
import { useLibraryStore } from "@/store/library";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import type { Track } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";
import { downloadTrack } from "@/lib/download";
import { LikeButton } from "@/components/music/LikeButton";

export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={cn("flex h-3.5 items-end gap-[2px]", !playing && "opacity-60")} aria-hidden="true">
      <span className={cn("w-[2px] rounded-sm bg-primary", playing ? "animate-equalize-1" : "h-1.5")} />
      <span className={cn("w-[2px] rounded-sm bg-primary", playing ? "animate-equalize-2" : "h-2.5")} />
      <span className={cn("w-[2px] rounded-sm bg-primary", playing ? "animate-equalize-3" : "h-2")} />
    </span>
  );
}

interface TrackListProps {
  tracks: Track[];
  context: string;
  showAlbum?: boolean;
  showCover?: boolean;
  showHeader?: boolean;
  onRemove?: (track: Track) => void;
  playlistId?: string;
  className?: string;
}

export function TrackList({
  tracks,
  context,
  showAlbum = true,
  showCover = true,
  showHeader = true,
  onRemove,
  className,
}: TrackListProps) {
  const navigate = useNavigate();
  const { queue, index, isPlaying, playContext, togglePlay, addToQueue, playNext } = usePlayerStore();
  const openAddToPlaylist = useUiStore((state) => state.openAddToPlaylist);
  const toast = useUiStore((state) => state.toast);
  const toggleLike = useLibraryStore((state) => state.toggleLike);
  const user = useAuthStore((state) => state.user);
  const offlineItems = useDownloadsStore((state) => state.items);
  const activeDownloads = useDownloadsStore((state) => state.active);
  const downloadForOffline = useDownloadsStore((state) => state.download);
  const removeDownload = useDownloadsStore((state) => state.remove);

  const currentId = queue[index]?.id;

  const handlePlay = (track: Track, i: number) => {
    if (currentId === track.id) togglePlay();
    else playContext(tracks, i, context);
  };

  const handleLike = async (track: Track) => {
    if (!user) {
      toast("Log in to save songs to your library.", "error");
      navigate("/login");
      return;
    }
    try {
      const liked = await toggleLike(track);
      toast(liked ? "Added to Liked Songs" : "Removed from Liked Songs", "success");
    } catch {
      toast("Could not update Liked Songs.", "error");
    }
  };

  const handleDownload = (track: Track) => {
    if (!downloadTrack(track)) {
      toast("Full audio is not available for this song.", "error");
      return;
    }
    toast("Download started. Check your Downloads folder.", "success");
  };

  const handleOfflineDownload = async (track: Track) => {
    const isDownloaded = offlineItems.some((item) => item.id === track.id);
    if (isDownloaded) {
      try {
        await removeDownload(track.id);
        toast("Removed from Downloads", "success");
      } catch {
        toast("Could not remove this download.", "error");
      }
      return;
    }
    if (activeDownloads[track.id]?.status === "downloading") return;
    if (!track.has_full_audio || !track.stream_url) {
      toast("Full audio is not available for this song.", "error");
      return;
    }
    try {
      await downloadForOffline(track);
      toast("Downloaded. Available offline in Downloads.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download this song.", "error");
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {showHeader && (
        <div className="mb-2 hidden items-center gap-4 border-b border-white/[0.07] px-3 pb-2 text-[11px] uppercase tracking-wider text-white/45 sm:flex">
          <span className="w-5 text-center">#</span>
          <span className="flex-1">Title</span>
          {showAlbum && <span className="hidden w-[32%] lg:block">Album</span>}
          <span className="w-9 text-right">
            <Clock3 className="ml-auto h-4 w-4" />
          </span>
          <span className="w-28" />
        </div>
      )}

      <div className="flex flex-col">
        {tracks.map((track, i) => {
          const isCurrent = currentId === track.id;
          const downloaded = offlineItems.some((item) => item.id === track.id);
          const activeDownload = activeDownloads[track.id];
          const imported = track.source === "imported";
          return (
            <div
              key={`${track.id}-${i}`}
              onDoubleClick={() => playContext(tracks, i, context)}
              className="group grid grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-white/[0.07] sm:grid-cols-[20px_minmax(0,1.6fr)_minmax(0,1fr)_36px_96px] sm:gap-4"
            >
              <button
                onClick={() => handlePlay(track, i)}
                className="flex h-5 w-5 items-center justify-center text-sm text-white/50"
                aria-label={`Play ${track.title}`}
              >
                {isCurrent ? (
                  <>
                    <span className="group-hover:hidden">
                      <Equalizer playing={isPlaying} />
                    </span>
                    <span className="hidden group-hover:block">
                      {isPlaying ? (
                        <Pause className="h-3.5 w-3.5 fill-current text-white" />
                      ) : (
                        <Play className="h-3.5 w-3.5 fill-current text-white" />
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="tabular-nums text-white/50 group-hover:hidden">{i + 1}</span>
                    <Play className="hidden h-3.5 w-3.5 fill-current text-white group-hover:block" />
                  </>
                )}
              </button>

              <div className="flex min-w-0 items-center gap-3">
                {showCover && (
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
                    <img src={track.album.cover_small || track.album.cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="min-w-0">
                  {imported ? (
                    <span className={cn("block truncate text-[14px] font-medium", isCurrent ? "text-primary" : "text-white")}>
                      {track.title}
                      {track.explicit && (
                        <span className="ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-white/25 align-middle text-[8px] font-bold text-white/80">
                          E
                        </span>
                      )}
                      {downloaded && (
                        <span className="ml-1.5 inline-flex align-middle" title="Available offline">
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        </span>
                      )}
                    </span>
                  ) : (
                    <Link
                      to={`/track/${track.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className={cn("block truncate text-[14px] font-medium hover:underline", isCurrent ? "text-primary" : "text-white")}
                    >
                      {track.title}
                      {track.explicit && (
                        <span className="ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-white/25 align-middle text-[8px] font-bold text-white/80">
                          E
                        </span>
                      )}
                      {downloaded && (
                        <span className="ml-1.5 inline-flex align-middle" title="Available offline">
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        </span>
                      )}
                    </Link>
                  )}
                  {imported ? (
                    <span className="block truncate text-xs text-white/55">{track.artist.name}</span>
                  ) : (
                    <Link
                      to={`/artist/${track.artist.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="block truncate text-xs text-white/55 hover:text-white hover:underline"
                    >
                      {track.artist.name}
                    </Link>
                  )}
                </div>
              </div>

              {showAlbum && (
                imported ? (
                  <span className="hidden truncate text-xs text-white/55 lg:block">{track.album.title}</span>
                ) : (
                  <Link
                    to={`/album/${track.album.id}`}
                    onClick={(event) => event.stopPropagation()}
                    className="hidden truncate text-xs text-white/55 hover:text-white hover:underline lg:block"
                  >
                    {track.album.title}
                  </Link>
                )
              )}

              <div className="flex items-center gap-0.5">
                {!imported && <LikeButton track={track} size="sm" />}
                <span className="w-9 text-right text-xs tabular-nums text-white/50">{formatDuration(track.duration)}</span>
              </div>

              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => playNext(track)}
                  className="hidden rounded-full p-1.5 text-white/50 transition hover:text-white sm:block"
                  aria-label="Play next"
                  title="Play next"
                >
                  <ListStart className="h-4 w-4" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="rounded-full p-1.5 text-white/50 opacity-100 transition hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100"
                      aria-label="More options"
                    >
                      <Ellipsis className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => handlePlay(track, i)}>
                      <Play className="h-4 w-4" /> Play
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        playNext(track);
                        toast("Playing next", "success");
                      }}
                    >
                      <ListStart className="h-4 w-4" /> Play next
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        addToQueue(track);
                        toast("Added to queue", "success");
                      }}
                    >
                      <ListPlus className="h-4 w-4" /> Add to queue
                    </DropdownMenuItem>
                    {!imported && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openAddToPlaylist(track)}>
                          <Plus className="h-4 w-4" /> Add to playlist
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleLike(track)}>
                          <Heart className="h-4 w-4" /> {useLibraryStore.getState().isLiked(track.id) ? "Remove from" : "Save to"} Liked Songs
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/track/${track.id}`)}>
                          <Music2 className="h-4 w-4" /> Go to song
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => void handleOfflineDownload(track)}
                      disabled={activeDownload?.status === "downloading"}
                    >
                      {activeDownload?.status === "downloading" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : downloaded ? (
                        imported ? (
                          <Trash2 className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      {activeDownload?.status === "downloading"
                        ? `Downloading${activeDownload.progress != null ? ` ${Math.round(activeDownload.progress * 100)}%` : "…"}`
                        : downloaded
                          ? "Remove download"
                          : "Download for offline"}
                    </DropdownMenuItem>
                    {!imported && (
                      <>
                        <DropdownMenuItem onClick={() => handleDownload(track)}>
                          <FileDown className="h-4 w-4" /> Save audio file
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => navigate(`/artist/${track.artist.id}`)}>
                          <User className="h-4 w-4" /> Go to artist
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/album/${track.album.id}`)}>
                          <Disc3 className="h-4 w-4" /> Go to album
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(`${window.location.origin}/track/${track.id}`);
                              toast("Song link copied to clipboard", "success");
                            } catch {
                              toast("Could not copy the link.", "error");
                            }
                          }}
                        >
                          <Share2 className="h-4 w-4" /> Copy song link
                        </DropdownMenuItem>
                      </>
                    )}
                    {onRemove && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-300" onClick={() => onRemove(track)}>
                          <Trash2 className="h-4 w-4" /> Remove from playlist
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      {tracks.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-white/45">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
            <Play className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-white/70">No songs here yet</p>
          <p className="max-w-xs text-xs">Find something you love and add it to this collection.</p>
        </div>
      )}
    </div>
  );
}
