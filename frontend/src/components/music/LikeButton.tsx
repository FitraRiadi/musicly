import { Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/types";
import { useLibraryStore } from "@/store/library";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";

export function LikeButton({
  track,
  className,
  size = "md",
  stopPropagation = true,
}: {
  track: Track;
  className?: string;
  size?: "sm" | "md";
  stopPropagation?: boolean;
}) {
  const liked = useLibraryStore((state) => state.isLiked(track.id));
  const toggleLike = useLibraryStore((state) => state.toggleLike);
  const user = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);
  const navigate = useNavigate();

  const onClick = async (event: React.MouseEvent) => {
    if (stopPropagation) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!user) {
      toast("Log in to save songs to your library.", "error");
      navigate("/login");
      return;
    }
    try {
      const nowLiked = await toggleLike(track);
      toast(nowLiked ? "Added to Liked Songs" : "Removed from Liked Songs", "success");
    } catch {
      toast("Could not update Liked Songs.", "error");
    }
  };

  return (
    <button
      onClick={onClick}
      aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
      className={cn(
        "rounded-full p-1.5 transition-transform hover:scale-110",
        liked ? "text-primary" : "text-white/55 hover:text-white",
        size === "sm" && "p-1",
        className,
      )}
    >
      <Heart className={cn("h-4 w-4", size === "sm" && "h-3.5 w-3.5", liked && "fill-current")} />
    </button>
  );
}
