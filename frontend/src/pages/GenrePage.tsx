import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Music4 } from "lucide-react";
import { api } from "@/lib/api";
import type { Artist } from "@/lib/types";
import { MediaCard } from "@/components/music/MediaCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { gradientFromString } from "@/lib/utils";

export function GenrePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("Genre");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    api
      .genre(id)
      .then((data) => {
        if (!alive) return;
        setName(data.name || "Genre");
        setArtists(data.artists || []);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="animate-fade-up pb-12">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px]"
        style={{ background: gradientFromString(name) }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink-850/60 to-ink-850" />
      </div>

      <div className="relative -mx-4 px-4 pt-10 md:-mx-7 md:px-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">Genre</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-6xl">{name}</h1>
        <p className="mt-2 text-sm text-white/55">The artists defining the sound of {name.toLowerCase()}.</p>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : artists.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {artists.map((artist) => (
              <MediaCard key={artist.id} item={artist} kind="artist" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-white/45">
            <Music4 className="h-10 w-10" />
            <p className="text-lg font-bold text-white/75">Nothing here yet</p>
            <Button variant="secondary" onClick={() => navigate("/search")}>
              Browse other genres
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
