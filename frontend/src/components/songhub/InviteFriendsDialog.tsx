import { useEffect, useState } from "react";
import { Check, Copy, Link2, Share2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import type { PublicUser } from "@/lib/types";
import { initials } from "@/lib/utils";
import { useSongHubStore } from "@/store/songhub";
import { useUiStore } from "@/store/ui";

let cachedFriends: PublicUser[] | null = null;
let friendsRequest: Promise<PublicUser[]> | null = null;

function loadFriends(force = false) {
  if (!force && cachedFriends) return Promise.resolve(cachedFriends);
  if (!friendsRequest) {
    friendsRequest = api
      .friends()
      .then((data) => {
        cachedFriends = data.friends ?? [];
        return cachedFriends;
      })
      .catch(() => cachedFriends ?? [])
      .finally(() => {
        friendsRequest = null;
      });
  }
  return friendsRequest;
}

export function InviteFriendsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const room = useSongHubStore((state) => state.room);
  const members = useSongHubStore((state) => state.members);
  const inviteFriend = useSongHubStore((state) => state.inviteFriend);
  const roomLink = useSongHubStore((state) => state.roomLink);
  const toast = useUiStore((state) => state.toast);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [invited, setInvited] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Show a previously loaded list immediately, then refresh it in the
    // background. A slow refresh must never hide friends we already know.
    if (cachedFriends) {
      setFriends(cachedFriends);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void loadFriends(Boolean(cachedFriends))
      .then((rows) => {
        if (!cancelled) setFriends(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const link = room ? roomLink(room.code) : "";
  const memberIds = new Set(members.map((member) => member.user.id));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Invite link copied.", "success");
    } catch {
      toast("Could not copy the link.", "error");
    }
  };

  const share = async () => {
    if (!room) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${room.name} on Musicly`,
          text: room.is_private
            ? `Join my private Song Hub. Ask me for the password!`
            : `Listen together in my Song Hub.`,
          url: link,
        });
        return;
      } catch {
        // Fall back to copying when the share sheet is dismissed.
      }
    }
    await copy();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite friends</DialogTitle>
          <DialogDescription>
            Send a direct invite to a friend or share the room link.
            {room?.is_private ? " Private rooms still require the password unless a friend is invited here." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2">
          <Link2 className="ml-1 h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs text-white/65">{link}</span>
          <Button size="sm" variant="ghost" onClick={() => void copy()} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" onClick={() => void share()} className="gap-1.5">
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">
            <Users className="h-3.5 w-3.5" /> Your friends
          </p>
          <div className="thin-scrollbar max-h-[300px] space-y-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 p-2">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-white/10" />
                  <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
                </div>
              ))
            ) : friends.length ? (
              friends.map((friend) => {
                const alreadyHere = memberIds.has(friend.id);
                const wasInvited = invited.includes(friend.id);
                return (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-white/[0.05]"
                  >
                    <Avatar className="h-9 w-9">
                      {friend.avatar && <AvatarImage src={friend.avatar} alt={friend.name} />}
                      <AvatarFallback className="bg-primary/20 text-[11px] font-bold text-primary">
                        {initials(friend.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{friend.name}</p>
                      <p className="truncate text-xs text-white/45">@{friend.username}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={wasInvited ? "ghost" : "secondary"}
                      disabled={alreadyHere || wasInvited}
                      onClick={async () => {
                        const ok = await inviteFriend(friend.id);
                        if (ok) setInvited((current) => [...current, friend.id]);
                      }}
                      className="gap-1.5"
                    >
                      {alreadyHere ? (
                        "In room"
                      ) : wasInvited ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Invited
                        </>
                      ) : (
                        "Invite"
                      )}
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-white/40">
                Add friends first, or share the link above.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
