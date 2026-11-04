import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe2, ImagePlus, Loader2, Lock } from "lucide-react";
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
import { cn } from "@/lib/utils";

export function CreatePlaylistDialog() {
  const open = useUiStore((state) => state.createPlaylistOpen);
  const seed = useUiStore((state) => state.createPlaylistSeed);
  const close = useUiStore((state) => state.closeCreatePlaylist);
  const toast = useUiStore((state) => state.toast);
  const addPlaylistLocally = useLibraryStore((state) => state.addPlaylistLocally);
  const refreshPlaylists = useLibraryStore((state) => state.refreshPlaylists);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const coverRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("My playlist");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName("My playlist");
      setDescription("");
      setIsPublic(true);
      setCoverFile(null);
      setCoverPreview((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    }
  }, [open]);

  const pickCover = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      close();
      navigate("/login");
      return;
    }
    setLoading(true);
    try {
      let playlist = await api.createPlaylist({
        name: name.trim() || "My playlist",
        description: description.trim(),
        is_public: isPublic,
        track_ids: seed ? [seed.id] : [],
      });
      let coverFailed = false;
      if (coverFile) {
        try {
          const form = new FormData();
          form.append("cover", coverFile);
          const updated = await api.updatePlaylist(playlist.id, form);
          playlist = { ...playlist, ...updated };
        } catch {
          coverFailed = true;
        }
      }
      addPlaylistLocally({ ...playlist, nb_tracks: playlist.tracks?.length || 0 });
      await refreshPlaylists();
      toast(
        coverFailed ? "Playlist created, but the cover could not be uploaded." : "Playlist created",
        coverFailed ? "error" : "success",
      );
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
            <button
              type="button"
              onClick={() => coverRef.current?.click()}
              className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-white/20 to-white/5"
              aria-label="Choose playlist cover"
            >
              {coverPreview ? (
                <img src={coverPreview} alt="Playlist cover preview" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-6 w-6 text-white/60" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
                <ImagePlus className="h-5 w-5 text-white" />
              </span>
            </button>
            <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={pickCover} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name || "My playlist"}</p>
              <p className="text-xs text-white/50">{user?.name || "You"} · Playlist</p>
              <p className="mt-1 text-[10px] text-white/35">Click the artwork to upload a cover</p>
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

          <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div>
              <Label>Playlist visibility</Label>
              <p className="mt-0.5 text-[11px] text-white/40">
                {isPublic ? "Anyone can find and save this playlist." : "Only you can open this playlist."}
              </p>
            </div>
            <div className="flex shrink-0 rounded-full bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition",
                  isPublic ? "bg-white text-black" : "text-white/55 hover:text-white",
                )}
              >
                <Globe2 className="h-3 w-3" /> Public
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition",
                  !isPublic ? "bg-white text-black" : "text-white/55 hover:text-white",
                )}
              >
                <Lock className="h-3 w-3" /> Private
              </button>
            </div>
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
