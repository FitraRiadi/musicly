import { Link } from "react-router-dom";
import { UserPlus, Users } from "lucide-react";
import type { PublicUser } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, initials } from "@/lib/utils";

export function UserCard({
  user,
  className,
  compact = false,
}: {
  user: PublicUser;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      to={`/user/${user.username}`}
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.035] p-3 transition hover:border-white/15 hover:bg-white/[0.08]",
        className,
      )}
    >
      <Avatar className={cn("shrink-0 ring-2 ring-white/5", compact ? "h-10 w-10" : "h-14 w-14")}>
        <AvatarImage src={user.avatar || undefined} alt={user.name} />
        <AvatarFallback className="bg-gradient-to-br from-primary to-emerald-800 text-sm font-black text-black">
          {initials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold group-hover:underline">{user.name}</p>
        <p className="truncate text-xs text-white/45">@{user.username}</p>
        {!compact && user.bio && <p className="mt-1 line-clamp-1 text-[11px] text-white/35">{user.bio}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-white/35">
        {user.friendship.status === "friends" ? (
          <span className="flex items-center gap-1 text-primary">
            <Users className="h-3 w-3" /> Friends
          </span>
        ) : user.friendship.status === "pending_incoming" ? (
          <Badge variant="secondary" className="gap-1 text-[9px]">
            <UserPlus className="h-2.5 w-2.5" /> Request
          </Badge>
        ) : (
          <span>{user.friends_count} friends</span>
        )}
      </div>
    </Link>
  );
}
