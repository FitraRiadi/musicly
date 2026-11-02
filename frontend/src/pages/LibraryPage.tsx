import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, LayoutGrid, ListMusic, Plus, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaylistCover } from "@/components/music/PlaylistCover";
import { MediaCard } from "@/components/music/MediaCard";
import { useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";
import { cn } from "@/lib/utils";

type Filter = "all" | "playlists" | "artists";

export function LibraryPage() {
  const { playlists, followed, liked, loaded, load } = useLibraryStore();
  const openCreate = useUiStore((state) => state.openCreatePlaylist);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    void load();
  }, [load]);

  const artists = useMemo(() => Object.values(followed), [followed]);
  const likedTracks = useMemo(() => Object.values(liked), [liked]);

  return (
    <div className="animate-fade-up pb-12 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Your Library</h1>
          <p className="mt-1 text-sm text-white/50">
            {playlists.length} playlists · {artists.length} artists · {likedTracks.length} liked songs
          </p>
        </div>
        <Button onClick={() => openCreate()} className="gap-2">
          <Plus className="h-4 w-4" /> Create playlist
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "All", icon: LayoutGrid },
            { id: "playlists", label: "Playlists", icon: ListMusic },
            { id: "artists", label: "Artists", icon: UserCheck },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id as Filter)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
              filter === item.id ? "bg-white text-black" : "bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white",
            )}
          >
            <item.icon className="h-3.5 w-3.5" /> {item.label}
          </button>
        ))}
      </div>

      <div className="mt-8 space-y-10">
        {!loaded && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        )}

        {filter !== "artists" && (
          <section>
            <h2 className="mb-3 text-lg font-bold">Playlists</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              <Link
                to="/liked"
                className="group flex flex-col gap-3 rounded-xl bg-gradient-to-br from-[#3b1a8a]/70 to-white/[0.04] p-3 transition hover:from-[#4a22a8]/80"
              >
                <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-gradient-to-br from-[#5a2fd1] to-[#b9a7ff]">
                  <Heart className="h-10 w-10 fill-white text-white" />
                </div>
                <div>
                  <p className="truncate text-sm font-semibold">Liked Songs</p>
                  <p className="text-xs text-white/55">Playlist · {likedTracks.length} songs</p>
                </div>
              </Link>

              {playlists.map((playlist) => (
                <Link
                  key={playlist.id}
                  to={`/playlist/${playlist.id}`}
                  className="group flex flex-col gap-3 rounded-xl bg-white/[0.035] p-3 transition hover:bg-white/[0.09]"
                >
                  <PlaylistCover playlist={playlist} className="w-full rounded-lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{playlist.name}</p>
                    <p className="truncate text-xs text-white/55">
                      Playlist · {playlist.nb_tracks ?? playlist.tracks?.length ?? 0} songs
                    </p>
                  </div>
                </Link>
              ))}

              <button
                onClick={() => openCreate()}
                className="flex flex-col gap-3 rounded-xl border border-dashed border-white/15 p-3 text-left transition hover:border-white/30 hover:bg-white/[0.04]"
              >
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg bg-white/[0.04] text-white/50">
                  <Plus className="h-8 w-8" />
                  <span className="text-xs font-semibold">New playlist</span>
                </div>
                <p className="text-sm font-semibold text-white/60">Create playlist</p>
                <p className="text-xs text-white/35">Start from scratch</p>
              </button>
            </div>
          </section>
        )}

        {filter !== "playlists" && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
              Artists <Badge variant="secondary">{artists.length}</Badge>
            </h2>
            {artists.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] py-10 text-center">
                <UserCheck className="h-8 w-8 text-white/30" />
                <p className="text-sm font-medium text-white/70">No followed artists yet</p>
                <p className="text-xs text-white/40">Tap Follow on any artist page to see them here.</p>
                <Button asChild variant="secondary" size="sm" className="mt-2">
                  <Link to="/search">Find artists</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {artists.map((artist) => (
                  <MediaCard
                    key={artist.id}
                    kind="artist"
                    item={{ id: artist.id, name: artist.name, picture: artist.picture }}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {filter !== "artists" && likedTracks.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-bold">Recently liked</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {likedTracks.slice(0, 5).map((track) => (
                <MediaCard key={track.id} item={track} kind="track" />
              ))}
            </div>
          </section>
        )}

        {filter !== "artists" && playlists.length === 0 && likedTracks.length === 0 && loaded && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
              <Search className="h-6 w-6 text-white/40" />
            </div>
            <p className="text-lg font-bold">Your library is waiting</p>
            <p className="max-w-sm text-sm text-white/45">
              Save songs, follow artists and create playlists to build your personal collection.
            </p>
            <Button asChild className="mt-1">
              <Link to="/search">Discover music</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
