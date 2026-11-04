import { Disc3, Music2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const PALETTES = [
  {
    wash: "from-emerald-400/30 via-cyan-400/10 to-transparent",
    glow: "bg-emerald-400/30",
    accent: "bg-violet-500/25",
  },
  {
    wash: "from-violet-500/30 via-fuchsia-400/10 to-transparent",
    glow: "bg-violet-500/30",
    accent: "bg-sky-400/20",
  },
  {
    wash: "from-sky-400/30 via-indigo-500/10 to-transparent",
    glow: "bg-sky-400/30",
    accent: "bg-emerald-400/20",
  },
  {
    wash: "from-amber-400/25 via-orange-500/10 to-transparent",
    glow: "bg-amber-400/25",
    accent: "bg-rose-500/20",
  },
];

function paletteIndex(seed: string) {
  let hash = 0;
  for (let position = 0; position < seed.length; position += 1) {
    hash = (hash * 31 + seed.charCodeAt(position)) >>> 0;
  }
  return hash % PALETTES.length;
}

export function ProfileBanner({ seed = "musicly", className }: { seed?: string; className?: string }) {
  const palette = PALETTES[paletteIndex(seed || "musicly")];

  return (
    <div className={cn("relative h-36 w-full overflow-hidden bg-ink-800 sm:h-52", className)} aria-hidden="true">
      <div className={cn("absolute inset-0 bg-gradient-to-br", palette.wash)} />
      <div className={cn("absolute -left-16 -top-24 h-72 w-72 rounded-full blur-[90px]", palette.glow)} />
      <div className={cn("absolute -right-10 top-0 h-64 w-64 rounded-full blur-[80px]", palette.accent)} />
      <div className="absolute -bottom-28 left-1/3 h-60 w-60 rounded-full bg-primary/20 blur-[90px]" />

      <div
        className="absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />

      <Disc3 className="absolute -right-8 top-6 h-48 w-48 rotate-12 text-white opacity-[0.07] sm:h-64 sm:w-64" />
      <Music2 className="absolute bottom-4 left-[42%] h-12 w-12 -rotate-12 text-white opacity-[0.09]" />
      <div className="absolute right-6 top-5 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 backdrop-blur-md">
        <Sparkles className="h-3 w-3 text-primary" /> Musicly listener
      </div>

      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink-850 via-ink-850/65 to-transparent" />
    </div>
  );
}
