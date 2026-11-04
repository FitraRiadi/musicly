import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock, Play, Search as SearchIcon, TrendingUp, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Album, Artist, Genre, Playlist, PublicUser, SearchResults, Track } from "@/lib/types";
import { TrackList } from "@/components/music/TrackList";
import { MediaCard } from "@/components/music/MediaCard";
import { UserCard } from "@/components/social/UserCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth";
import { usePlayerStore } from "@/store/player";
import { useUiStore } from "@/store/ui";
import { cn, gradientFromString, timeAgo } from "@/lib/utils";

type SearchType = "all" | "track" | "artist" | "album" | "playlist" | "user";

const searchTabs: { id: SearchType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "track", label: "Songs" },
  { id: "artist", label: "Artists" },
  { id: "album", label: "Albums" },
  { id: "playlist", label: "Playlists" },
  { id: "user", label: "People" },
];

function normalizeTypedResults(data: SearchResults, type: Exclude<SearchType, "all">): SearchResults {
  const items = data.items || [];
  return {
    ...data,
    tracks: type === "track" ? (items as Track[]) : [],
    artists: type === "artist" ? (items as Artist[]) : [],
    albums: type === "album" ? (items as Album[]) : [],
    playlists: type === "playlist" ? (items as Playlist[]) : [],
    users: type === "user" ? ((data.users || items) as PublicUser[]) : [],
  };
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q")?.trim() || "";
  const requestedType = params.get("type") || "all";
  const type: SearchType = searchTabs.some((tab) => tab.id === requestedType)
    ? (requestedType as SearchType)
    : "all";
  const user = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);
  const playContext = usePlayerStore((state) => state.playContext);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [recent, setRecent] = useState<{ id: number; query: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.genres().then((data) => setGenres(data.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) {
      setRecent([]);
      return;
    }
    api.recentSearches().then((data) => setRecent(data.items)).catch(() => undefined);
  }, [user?.id, query]);

  useEffect(() => {
    if (!query) {
      setResults(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setResults(null);
    api
      .search(query, type, type === "all" ? 20 : 30)
      .then((data) => {
        if (!alive) return;
        setResults(type === "all" ? data : normalizeTypedResults(data, type));
      })
      .catch((error) => alive && toast(error?.message || "Search is unavailable right now.", "error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type]);

  const top = useMemo(() => {
    if (!results) return null;
    const artist = results.artists?.[0];
    if (artist) return { kind: "artist" as const, item: artist };
    const track = results.tracks?.[0];
    if (track) return { kind: "track" as const, item: track };
    return null;
  }, [results]);

  const hasResults = Boolean(
    results?.tracks?.length ||
      results?.artists?.length ||
      results?.albums?.length ||
      results?.playlists?.length ||
      results?.users?.length,
  );
  const topHref = top
    ? top.kind === "artist"
      ? `/artist/${(top.item as Artist).id}`
      : `/track/${(top.item as Track).id}`
    : "";

  const topPlay = async () => {
    if (!top) return;
    if (top.kind === "track") {
      playContext(results?.tracks || [], 0, `Search: ${query}`);
      return;
    }
    try {
      const artist = await api.artist(top.item.id);
      if (artist.top_tracks?.length) playContext(artist.top_tracks, 0, artist.name);
    } catch {
      toast("Could not start playback.", "error");
    }
  };

  const clearRecent = async () => {
    try {
      await api.clearRecentSearches();
      setRecent([]);
    } catch {
      toast("Could not clear recent searches.", "error");
    }
  };

  if (!query) {
    return (
      <div className="animate-fade-up pb-12 pt-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_at_top,rgba(30,215,96,0.12),transparent_65%)]" />
        {recent.length > 0 && (
          <div className="relative mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Recent searches</h2>
              <button onClick={clearRecent} className="text-xs font-semibold text-white/45 hover:text-white">
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((item) => (
                <Link
                  key={item.id}
                  to={`/search?q=${encodeURIComponent(item.query)}`}
                  className="group flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-2 text-sm transition hover:bg-white/[0.13]"
                >
                  <Clock className="h-3.5 w-3.5 text-white/40" />
                  {item.query}
                  <span className="text-[10px] text-white/30">{timeAgo(item.created_at)}</span>
                  <X className="h-3 w-3 text-white/30 group-hover:text-white" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <h2 className="text-2xl font-extrabold tracking-tight">Browse all</h2>
          <p className="mt-1 text-sm text-white/50">Explore genres, moods and scenes from around the world.</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {genres.length === 0
              ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-[16/10] w-full rounded-xl" />)
              : genres.slice(0, 20).map((genre) => (
                  <Link
                    key={genre.id}
                    to={`/genre/${genre.id}`}
                    className="group relative aspect-[16/10] overflow-hidden rounded-xl p-4 shadow-lg transition hover:scale-[1.015]"
                    style={{
                      background: genre.picture
                        ? `linear-gradient(160deg, rgba(0,0,0,0.05), rgba(0,0,0,0.55)), url(${genre.picture}) center/cover`
                        : gradientFromString(genre.name),
                    }}
                  >
                    <span className="relative z-10 text-lg font-extrabold drop-shadow">{genre.name}</span>
                    <span className="absolute -bottom-3 -right-3 h-20 w-20 rotate-[25deg] rounded-md bg-white/10 backdrop-blur-sm transition group-hover:rotate-[15deg]" />
                  </Link>
                ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up pb-12 pt-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[radial-gradient(ellipse_at_top,rgba(30,215,96,0.1),transparent_65%)]" />
      <div className="relative flex items-center gap-2 text-xs text-white/40">
        <SearchIcon className="h-3.5 w-3.5" />
        Results for <span className="font-semibold text-white/80">“{query}”</span>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        {searchTabs.map((tab) => {
          const active = type === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("q", query);
                if (tab.id === "all") next.delete("type");
                else next.set("type", tab.id);
                setParams(next);
              }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                active ? "bg-white text-black" : "bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="mt-6 space-y-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_1.4fr]">
            <Skeleton className="h-48 rounded-xl" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_1.3fr]">
            {top && (
              <section>
                <h2 className="mb-3 text-lg font-bold">Top result</h2>
                <div className="group relative overflow-hidden rounded-xl bg-white/[0.05] p-4 transition hover:bg-white/[0.09]">
                  <Link to={topHref} className="flex items-start gap-4 pr-12">
                    {top.kind === "artist" ? (
                      <img
                        src={(top.item as Artist).picture}
                        alt=""
                        className="h-24 w-24 rounded-full object-cover shadow-xl"
                      />
                    ) : (
                      <img
                        src={(top.item as Track).album.cover}
                        alt=""
                        className="h-24 w-24 rounded-lg object-cover shadow-xl"
                      />
                    )}
                    <div className="min-w-0 pt-1">
                      <p className="truncate text-2xl font-extrabold leading-tight hover:underline">
                        {top.kind === "artist" ? (top.item as Artist).name : (top.item as Track).title}
                      </p>
                      <p className="mt-1 text-xs text-white/55">
                        {top.kind === "artist" ? "Artist" : `${(top.item as Track).artist.name} · Song`}
                      </p>
                    </div>
                  </Link>
                  <button
                    onClick={() => void topPlay()}
                    className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-black opacity-0 shadow-glow transition hover:scale-105 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label="Play top result"
                  >
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </button>
                </div>
              </section>
            )}

            {results?.tracks && results.tracks.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold">Songs</h2>
                  <span className="text-[11px] text-white/40">{results.tracks.length} results</span>
                </div>
                <TrackList
                  tracks={type === "track" ? results.tracks : results.tracks.slice(0, 5)}
                  context={`Search: ${query}`}
                  showAlbum={false}
                  showHeader={false}
                />
              </section>
            )}
          </div>

          {results?.artists && results.artists.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-lg font-bold">Artists</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {(type === "artist" ? results.artists : results.artists.slice(0, 5)).map((artist) => (
                  <MediaCard key={artist.id} item={artist} kind="artist" />
                ))}
              </div>
            </section>
          )}

          {results?.albums && results.albums.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-lg font-bold">Albums</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {(type === "album" ? results.albums : results.albums.slice(0, 5)).map((album) => (
                  <MediaCard key={album.id} item={album} kind="album" />
                ))}
              </div>
            </section>
          )}

          {results?.playlists && results.playlists.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-lg font-bold">Playlists</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {(type === "playlist" ? results.playlists : results.playlists.slice(0, 5)).map((playlist) => (
                  <MediaCard key={playlist.id} item={playlist} kind="playlist" />
                ))}
              </div>
            </section>
          )}

          {results?.users && results.users.length > 0 && (
            <section className="mt-10">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">People</h2>
                <span className="text-[11px] text-white/40">{results.users.length} listeners</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(type === "user" ? results.users : results.users.slice(0, 6)).map((person) => (
                  <UserCard key={person.id} user={person} />
                ))}
              </div>
            </section>
          )}

          {results && !hasResults && (
            <div className="mt-20 flex flex-col items-center gap-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
                <SearchIcon className="h-7 w-7 text-white/40" />
              </div>
              <p className="text-lg font-bold">No results found for “{query}”</p>
              <p className="max-w-sm text-sm text-white/45">
                Please make sure your words are spelled correctly, or use fewer or different keywords.
              </p>
            </div>
          )}

          <div className="mt-12 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-xs text-white/40">
            <TrendingUp className="mr-1.5 inline h-3.5 w-3.5" />
            Search is powered by the public Deezer catalog. Full playback streams on demand through the local
            YouTube bridge; 30-second Deezer previews are the fallback.
          </div>
        </>
      )}
    </div>
  );
}
