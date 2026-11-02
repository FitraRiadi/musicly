import { Music2 } from "lucide-react";
import type { Playlist } from "@/lib/types";
import { cn, gradientFromString, initials } from "@/lib/utils";

export function PlaylistCover({
  playlist,
  className,
  iconClassName,
}: {
  playlist: Pick<Playlist, "id" | "name" | "cover">;
  className?: string;
  iconClassName?: string;
}) {
  if (playlist.cover) {
    return (
      <img
        src={playlist.cover}
        alt={playlist.name}
        loading="lazy"
        className={cn("aspect-square object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn("flex aspect-square items-center justify-center overflow-hidden", className)}
      style={{ background: gradientFromString(playlist.name || playlist.id) }}
    >
      <div className="flex flex-col items-center gap-1 text-white/85">
        <Music2 className={cn("h-6 w-6", iconClassName)} />
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
          {initials(playlist.name)}
        </span>
      </div>
    </div>
  );
}
