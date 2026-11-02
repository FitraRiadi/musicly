import { cn } from "@/lib/utils";

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="musicly-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1fdf64" />
            <stop offset="100%" stopColor="#0f9d46" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="20" fill="url(#musicly-grad)" />
        <g fill="#04130a">
          <rect x="10.5" y="17" width="3.4" height="9" rx="1.7" />
          <rect x="16.1" y="11" width="3.4" height="18" rx="1.7" />
          <rect x="21.7" y="14.5" width="3.4" height="12" rx="1.7" />
          <rect x="27.1" y="19.5" width="2.6" height="6.5" rx="1.3" opacity="0.75" />
        </g>
      </svg>
      {showWordmark && <span className="text-[22px] font-extrabold tracking-tight text-white">Musicly</span>}
    </div>
  );
}
