import { Link } from "react-router-dom";
import { Radio, Users } from "lucide-react";
import { useSongHubStore } from "@/store/songhub";
import { cn } from "@/lib/utils";

export function SongHubIndicator({ compact = false }: { compact?: boolean }) {
  const room = useSongHubStore((state) => state.room);
  const me = useSongHubStore((state) => state.me);
  const members = useSongHubStore((state) => state.members);

  if (!room) return null;
  const isHost = me?.role === "host";

  return (
    <Link
      to={`/song-hub/${room.code}`}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20",
        compact && "px-2.5",
      )}
      title={`${room.name} · ${isHost ? "You are hosting" : "Listening together"}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <Radio className="h-3.5 w-3.5" />
      <span className={cn("max-w-[110px] truncate", compact && "hidden sm:inline")}>
        {isHost ? "Hosting" : "Listening"} · {room.code}
      </span>
      <span className="hidden items-center gap-1 text-primary/70 md:flex">
        <Users className="h-3 w-3" /> {members.length}
      </span>
    </Link>
  );
}
