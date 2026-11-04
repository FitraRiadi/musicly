import { Headphones, Lock, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSongHubStore } from "@/store/songhub";

export function SongHubRequestDialog() {
  const track = useSongHubStore((state) => state.pendingRequestTrack);
  const sending = useSongHubStore((state) => state.requestSending);
  const confirmRequest = useSongHubStore((state) => state.confirmRequest);
  const cancelRequest = useSongHubStore((state) => state.cancelRequest);

  return (
    <Dialog open={Boolean(track)} onOpenChange={(open) => !open && cancelRequest()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <DialogTitle>Request this song?</DialogTitle>
          <DialogDescription>
            Members can't change the room playback. Your request will go to the host for approval.
          </DialogDescription>
        </DialogHeader>
        {track && (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <img
              src={track.album.cover_small || track.album.cover}
              alt=""
              className="h-14 w-14 rounded-lg object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{track.title}</p>
              <p className="truncate text-xs text-white/50">{track.artist.name}</p>
            </div>
            <Headphones className="ml-auto h-4 w-4 shrink-0 text-primary" />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={cancelRequest}>
            Cancel
          </Button>
          <Button onClick={() => void confirmRequest()} disabled={sending} className="gap-2">
            <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
