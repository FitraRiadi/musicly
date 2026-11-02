import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { MediaCard } from "@/components/music/MediaCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { HomeSection } from "@/lib/types";

export function Section({ section, loading = false }: { section: HomeSection; loading?: boolean }) {
  const items = section.items.slice(0, section.id === "top-tracks" ? 8 : 6);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">{section.title}</h2>
          {section.subtitle && <p className="mt-0.5 text-xs text-white/50">{section.subtitle}</p>}
        </div>
        <Link
          to={section.kind === "genres" ? "/search" : "/search"}
          className="hidden items-center gap-0.5 text-xs font-semibold text-white/55 transition hover:text-white sm:flex"
        >
          Show all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl bg-white/[0.03] p-3">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((item: any, index: number) => (
            <MediaCard
              key={`${section.id}-${item.id}-${index}`}
              item={item}
              kind={section.kind === "genres" ? "genre" : section.kind === "playlists" ? "playlist" : section.kind === "albums" ? "album" : section.kind === "artists" ? "artist" : "track"}
            />
          ))}
        </div>
      )}
    </section>
  );
}
