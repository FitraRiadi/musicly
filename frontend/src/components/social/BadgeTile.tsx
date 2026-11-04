import { Check, Lock, Sparkles } from "lucide-react";
import type { Badge } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BadgeTile({
  badge,
  onCollect,
  collecting = false,
  compact = false,
}: {
  badge: Badge;
  onCollect?: (badge: Badge) => void;
  collecting?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border p-4 transition",
        badge.earned
          ? "border-primary/25 bg-gradient-to-br from-primary/15 via-white/[0.04] to-transparent"
          : badge.rarity === "rare"
            ? "border-amber-300/20 bg-gradient-to-br from-amber-300/[0.08] via-white/[0.03] to-transparent"
            : "border-white/[0.07] bg-white/[0.03]",
        compact && "p-3",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-white/[0.06]",
            compact ? "h-11 w-11" : "h-14 w-14",
            !badge.earned && "grayscale",
          )}
        >
          <img
            src={badge.image_url}
            alt={badge.title}
            loading="lazy"
            className={cn(compact ? "h-7 w-7" : "h-9 w-9", !badge.earned && "opacity-65")}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold">{badge.title}</p>
            {badge.rarity === "rare" && (
              <span className="shrink-0 rounded-full bg-amber-300/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                Rare
              </span>
            )}
            {badge.earned && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-white/45">
            {badge.description}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn("h-full rounded-full", badge.earned ? "bg-primary" : "bg-white/45")}
            style={{ width: `${Math.min(100, badge.progress)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            {badge.earned ? "Collected" : `${Math.min(badge.value, badge.threshold)}/${badge.threshold}`}
          </span>
          {badge.earned ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-primary">
              <Sparkles className="h-3 w-3" /> On your profile
            </span>
          ) : onCollect ? (
            <Button
              size="sm"
              variant={badge.progress >= 100 ? "default" : "ghost"}
              className="h-6 gap-1 px-2 text-[10px]"
              disabled={badge.progress < 100 || collecting}
              onClick={() => onCollect(badge)}
            >
              {badge.progress >= 100 ? (collecting ? "Collecting…" : "Collect") : <><Lock className="h-2.5 w-2.5" /> Locked</>}
            </Button>
          ) : (
            <span className="text-[10px] text-white/25">Not collected</span>
          )}
        </div>
      </div>
    </div>
  );
}
