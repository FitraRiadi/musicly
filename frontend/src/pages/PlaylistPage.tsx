import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Ellipsis,
  Link2,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Shuffle,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Playlist } from "@/lib/types";
import { TrackList } from "@/components/music/TrackList";
import { PlaylistCover } from "@/components/music/PlaylistCover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { usePlayerStore } from "@/store/player";
import { useDownloadsStore } from "@/store/downloads";
import { useLibraryStore } from "@/store/library";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import { formatCount, formatLongDuration, gradientFromString, shuffleArray, timeAgo } from "@/lib/utils";

export function PlaylistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);
  const playContext = usePlayerStore((state) => state.playContext);
  const refreshPlaylists = useLibraryStore((state) => state.refreshPlaylists);
  const downloadMany = useDownloadsStore((state) => state.downloadMany);
  const offlineItems = useDownloadsStore((state) => state.items);
  const activeDownloads = useDownloadsStore((state) => state.active);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api
      .playlist(id)
      .then((data) => {
        setPlaylist(data);
        setName(data.name);
        setDescription(data.description || "");
      })
      .catch((err) => setError({ message: err?.message || "Playlist not found.", status: err?.status }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const isOwner = Boolean(playlist && user && playlist.owner?.id === user.id);
  const tracks = (playlist?.tracks || []).map((entry) => entry.track);
  const totalSeconds = tracks.reduce((sum, track) => sum + track.duration, 0);
  const isDeezer = playlist?.source === "deezer" || Boolean(id?.startsWith("dz-"));
  const downloadedCount = tracks.filter((track) => offlineItems.some((item) => item.id === track.id)).length;
  const bulkDownloading = tracks.some((track) => activeDownloads[track.id]?.status === "downloading");

  const handleDownloadPlaylist = async () => {
    if (!tracks.length || bulkDownloading) return;
    const remaining = tracks.length - downloadedCount;
    if (remaining <= 0) {
      toast("All songs in this playlist are already downloaded.", "success");
      return;
    }
    toast(`Downloading ${remaining} ${remaining === 1 ? "song" : "songs"} for offline…`);
    const result = await downloadMany(tracks);
    if (result.failed > 0) {
      toast(`Downloaded ${result.downloaded} songs, ${result.failed} failed.`, "error");
    } else if (result.downloaded > 0) {
      toast(`Downloaded ${result.downloaded} ${result.downloaded === 1 ? "song" : "songs"}. Available offline.`, "success");
    } else {
      toast("All songs in this playlist are already downloaded.", "success");
    }
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!playlist) return;
    setSaving(true);
    try {
      const updated = await api.updatePlaylist(playlist.id, { name, description });
      setPlaylist({ ...playlist, ...updated });
      await refreshPlaylists();
      setEditOpen(false);
      toast("Playlist updated", "success");
    } catch (err: any) {
      toast(err?.message || "Could not update the playlist.", "error");
    } finally {
      setSaving(false);
    }
  };

  const removePlaylist = async () => {
    if (!playlist) return;
    try {
      await api.deletePlaylist(playlist.id);
      await refreshPlaylists();
      toast("Playlist deleted", "success");
      navigate("/library");
    } catch (err: any) {
      toast(err?.message || "Could not delete the playlist.", "error");
    }
  };

  const removeTrack = async (track: { id: string }) => {
    if (!playlist) return;
    try {
      const updated = await api.removeTrack(playlist.id, track.id);
      setPlaylist(updated);
      await refreshPlaylists();
      toast("Removed from playlist", "success");
    } catch (err: any) {
      toast(err?.message || "Could not remove the song.", "error");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pt-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <Skeleton className="h-48 w-48 rounded-xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-14 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
          <Search className="h-7 w-7 text-white/40" />
        </div>
        <p className="text-xl font-bold">Couldn't open this playlist</p>
        <p className="max-w-sm text-sm text-white/50">{error?.message}</p>
        {error?.status === 401 ? (
          <Button onClick={() => navigate("/login")}>Log in</Button>
        ) : (
          <Button variant="secondary" onClick={() => navigate("/search")}>
            Discover music
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-up pb-12">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[430px]"
        style={{ background: gradientFromString(playlist.name + playlist.id) }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-ink-850/70 to-ink-850" />
      </div>

      <div className="relative -mx-4 px-4 pt-6 md:-mx-7 md:px-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <PlaylistCover
            playlist={playlist}
            className="h-44 w-44 rounded-lg text-white shadow-2xl sm:h-52 sm:w-52 lg:h-56 lg:w-56"
            iconClassName="h-12 w-12"
          />
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">
                {isDeezer ? "Curated playlist" : playlist.is_public ? "Public playlist" : "Private playlist"}
              </p>
              {isDeezer && (
                <Badge variant="secondary" className="gap-1 py-0 text-[9px]">
                  <Database className="h-2.5 w-2.5" /> Deezer
                </Badge>
              )}
            </div>
            <h1 className="mt-2 text-balance text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="mt-3 line-clamp-2 max-w-2xl text-sm text-white/65">{playlist.description}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
              {!isDeezer ? (
                <span className="font-semibold text-white">{playlist.owner?.name || "You"}</span>
              ) : (
                <span className="font-semibold text-white">{playlist.owner?.name || "Deezer"}</span>
              )}
              <span className="text-white/50">· {tracks.length} songs</span>
              {totalSeconds > 0 && <span className="text-white/50">· {formatLongDuration(totalSeconds)}</span>}
              {playlist.updated_at && !isDeezer && (
                <span className="text-white/40">· updated {timeAgo(playlist.updated_at)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={() => playContext(tracks, 0, playlist.name)}
            disabled={!tracks.length}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black shadow-glow transition hover:scale-105 hover:bg-spotify-bright disabled:opacity-40"
            aria-label="Play playlist"
          >
            <Play className="ml-1 h-6 w-6 fill-current" />
          </button>
          <button
            onClick={() => playContext(shuffleArray(tracks), 0, playlist.name)}
            disabled={!tracks.length}
            className="rounded-full p-2 text-white/60 transition hover:text-white disabled:opacity-40"
            aria-label="Shuffle playlist"
          >
            <Shuffle className="h-5 w-5" />
          </button>
          {!isDeezer && isOwner && (
            <Button variant="outline" onClick={() => navigate("/search")} className="gap-2">
              <Plus className="h-4 w-4" /> Add songs
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full p-2 text-white/60 transition hover:text-white" aria-label="More playlist options">
                <Ellipsis className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => void handleDownloadPlaylist()}
                disabled={bulkDownloading || (tracks.length > 0 && downloadedCount === tracks.length)}
              >
                {bulkDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : downloadedCount === tracks.length && tracks.length > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {bulkDownloading
                  ? "Downloading…"
                  : downloadedCount === tracks.length && tracks.length > 0
                    ? "Playlist downloaded"
                    : "Download playlist"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    toast("Playlist link copied", "success");
                  } catch {
                    toast("Could not copy link", "error");
                  }
                }}
              >
                <Link2 className="h-4 w-4" /> Copy playlist link
              </DropdownMenuItem>
              {!isDeezer && isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-300" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4" /> Delete playlist
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {tracks.length > 0 ? (
        <div className="mt-7">
          <TrackList
            tracks={tracks}
            context={playlist.name}
            onRemove={!isDeezer && isOwner ? removeTrack : undefined}
          />
          <p className="mt-8 flex items-center gap-1.5 text-[11px] text-white/35">
            <Clock3 className="h-3 w-3" /> {formatCount(tracks.length)} songs · {formatLongDuration(totalSeconds)}
          </p>
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
            <Plus className="h-6 w-6 text-white/50" />
          </div>
          <p className="text-lg font-bold">Let's find something for your playlist</p>
          <p className="max-w-sm text-sm text-white/45">
            Search the catalog and use the ••• menu on any song to add it here.
          </p>
          <Button onClick={() => navigate("/search")} className="mt-2">
            Browse music
          </Button>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit playlist</DialogTitle>
            <DialogDescription>Update the name and description of your collection.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input id="edit-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={140} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={400}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this playlist?</DialogTitle>
            <DialogDescription>
              “{playlist.name}” will be permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={removePlaylist}>
              Delete playlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
