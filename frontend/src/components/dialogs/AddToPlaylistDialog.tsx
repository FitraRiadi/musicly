import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ListMusic, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/ui";
import { useLibraryStore } from "@/store/library";
import { api } from "@/lib/api";
import { PlaylistCover } from "@/components/music/PlaylistCover";

export function AddToPlaylistDialog() {
  const track = useUiStore((state) => state.addToPlaylistTrack);
  const close = useUiStore((state) => state.closeAddToPlaylist);
  const openCreate = useUiStore((state) => state.openCreatePlaylist);
  const toast = useUiStore((state) => state.toast);
  const playlists = useLibraryStore((state) => state.playlists);
  const refreshPlaylists = useLibraryStore((state) => state.refreshPlaylists);

  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [addedId, setAddedId] = useState<string | number | null>(null);

  const add = async (playlistId: string | number) => {
    if (!track) return;
    setBusyId(playlistId);
    try {
      await api.addTracks(playlistId, [track.id]);
      setAddedId(playlistId);
      await refreshPlaylists();
      toast("Added to playlist", "success");
      window.setTimeout(() => close(), 550);
    } catch (error: any) {
      toast(error?.message || "Could not add the song.", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={Boolean(track)} onOpenChange={(value) => !value && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to playlist</DialogTitle>
          <DialogDescription className="truncate">{track ? track.title : ""}</DialogDescription>
        </DialogHeader>

        <button
          onClick={() => {
            close();
            openCreate(track);
          }}
          className="flex items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/[0.06]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">New playlist</p>
            <p className="text-xs text-white/50">Start a fresh collection</p>
          </div>
        </button>

        <div className="thin-scrollbar max-h-[320px] space-y-1 overflow-y-auto pr-1">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              onClick={() => void add(playlist.id)}
              disabled={busyId !== null}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/[0.06] disabled:opacity-60"
            >
              <PlaylistCover playlist={playlist} className="h-12 w-12 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{playlist.name}</p>
                <p className="truncate text-xs text-white/50">{playlist.nb_tracks} songs</p>
              </div>
              {busyId === playlist.id && <Loader2 className="h-4 w-4 animate-spin text-white/60" />}
              {addedId === playlist.id && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
          {playlists.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-white/45">
              <ListMusic className="h-8 w-8" />
              <p className="text-sm">No playlists yet</p>
              <p className="text-xs">Create one to start collecting songs.</p>
            </div>
          )}
        </div>

        <Button asChild variant="ghost" size="sm" className="justify-start px-2 text-white/60">
          <Link to="/library" onClick={close}>
            Browse your library
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
