import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useUiStore } from "@/store/ui";
import { useLibraryStore } from "@/store/library";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function CreatePlaylistDialog() {
  const open = useUiStore((state) => state.createPlaylistOpen);
  const seed = useUiStore((state) => state.createPlaylistSeed);
  const close = useUiStore((state) => state.closeCreatePlaylist);
  const toast = useUiStore((state) => state.toast);
  const addPlaylistLocally = useLibraryStore((state) => state.addPlaylistLocally);
  const refreshPlaylists = useLibraryStore((state) => state.refreshPlaylists);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const [name, setName] = useState("My playlist");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName("My playlist");
      setDescription("");
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      close();
      navigate("/login");
      return;
    }
    setLoading(true);
    try {
      const playlist = await api.createPlaylist({
        name: name.trim() || "My playlist",
        description: description.trim(),
        track_ids: seed ? [seed.id] : [],
      });
      addPlaylistLocally({ ...playlist, nb_tracks: playlist.tracks?.length || 0 });
      await refreshPlaylists();
      toast("Playlist created", "success");
      close();
      navigate(`/playlist/${playlist.id}`);
    } catch (error: any) {
      toast(error?.message || "Could not create the playlist.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create playlist</DialogTitle>
          <DialogDescription>
            {seed ? `"${seed.title}" will be added as the first song.` : "Give your new collection a name and a vibe."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-4 rounded-xl bg-white/[0.04] p-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-white/20 to-white/5">
              <Plus className="h-6 w-6 text-white/60" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name || "My playlist"}</p>
              <p className="text-xs text-white/50">{user?.name || "You"} · Playlist</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="playlist-name">Name</Label>
            <Input
              id="playlist-name"
              value={name}
              maxLength={140}
              onChange={(event) => setName(event.target.value)}
              placeholder="My playlist"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="playlist-description">Description (optional)</Label>
            <Textarea
              id="playlist-description"
              value={description}
              maxLength={400}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this playlist about?"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
