import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Clock3,
  Disc3,
  Ellipsis,
  ExternalLink,
  Heart,
  ListPlus,
  ListStart,
  Music2,
  Pause,
  Play,
  Quote,
  Radio,
  Share2,
  Shuffle,
  UserCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Album, Artist, Lyrics, Track } from "@/lib/types";
import { TrackList } from "@/components/music/TrackList";
import { MediaCard } from "@/components/music/MediaCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayerStore } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import { cn, formatCount, formatDuration, shuffleArray, yearOf } from "@/lib/utils";

function uniqueTracks(tracks: Track[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!track || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function lyricLinesFrom(data: Lyrics | null) {
  if (!data) return [];
  const source = data.plain || data.synced.replace(/\[[^\]]+\]/g, "");
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function SectionHeading({
  title,
  subtitle,
  to,
  action,
}: {
  title: string;
  subtitle?: string;
  to?: string;
  action?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-white/45">{subtitle}</p>}
      </div>
      {to && (
        <Link to={to} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-white/55 hover:text-white">
          {action || "Show all"} <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export function TrackPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useUiStore((state) => state.toast);
  const openAddToPlaylist = useUiStore((state) => state.openAddToPlaylist);
  const user = useAuthStore((state) => state.user);

  const { queue, index, isPlaying, playContext, togglePlay, addToQueue, playNext } = usePlayerStore();
  const liked = useLibraryStore((state) => state.isLiked(id || ""));
  const toggleLike = useLibraryStore((state) => state.toggleLike);
  const toggleFollow = useLibraryStore((state) => state.toggleFollow);

  const [track, setTrack] = useState<Track | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [artist, setArtist] = useState<Artist | null>(null);
  const followed = useLibraryStore((state) => (artist?.id ? Boolean(state.followed[artist.id]) : false));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsExpanded, setLyricsExpanded] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;

    setLoading(true);
    setError(null);
    setTrack(null);
    setAlbum(null);
    setArtist(null);
    setLyrics(null);
    setLyricsExpanded(false);

    api
      .track(id)
      .then(async (data) => {
        if (!alive) return;
        setTrack(data);

        const tasks: Promise<void>[] = [];
        if (data.album?.id) {
          tasks.push(
            api
              .album(data.album.id)
              .then((value) => {
                if (alive) setAlbum(value);
              })
              .catch(() => undefined),
          );
        }
        if (data.artist?.id) {
          tasks.push(
            api
              .artist(data.artist.id)
              .then((value) => {
                if (alive) setArtist(value);
              })
              .catch(() => undefined),
          );
        }
        await Promise.all(tasks);
      })
      .catch((reason) => {
        if (alive) setError(reason?.message || "Song not found.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id]);

  const trackId = track?.id;
  useEffect(() => {
    if (!trackId) return;
    let alive = true;
    setLyricsLoading(true);
    api
      .lyrics(trackId)
      .then((value) => {
        if (alive) setLyrics(value);
      })
      .catch(() => {
        if (alive) setLyrics(null);
      })
      .finally(() => {
        if (alive) setLyricsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [trackId]);

  const isCurrent = Boolean(track && queue[index]?.id === track.id);
  const albumTracks = album?.tracks || [];
  const moreTracks = useMemo(
    () => (artist?.top_tracks || []).filter((item) => item.id !== track?.id).slice(0, 5),
    [artist?.top_tracks, track?.id],
  );
  const lyricLines = useMemo(() => lyricLinesFrom(lyrics), [lyrics]);
  const relatedArtists = artist?.related?.slice(0, 4) || [];
  const otherAlbums = (artist?.album_list || []).filter((item) => item.id !== album?.id).slice(0, 6);
  const totalSeconds = albumTracks.reduce((sum, item) => sum + item.duration, 0);

  if (loading) {
    return (
      <div className="space-y-8 pt-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <Skeleton className="h-48 w-48 rounded-xl sm:h-56 sm:w-56" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex gap-3 pt-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-12 w-12 rounded-full" />
            </div>
          </div>
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            <Skeleton className="h-56 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !track) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <Music2 className="h-10 w-10 text-white/30" />
        <p className="text-xl font-bold">Song not available</p>
        <p className="text-sm text-white/50">{error}</p>
        <Button variant="secondary" onClick={() => navigate("/search")}>
          Search for music
        </Button>
      </div>
    );
  }

  const playableForTrack = albumTracks.length ? albumTracks : [track];
  const startAt = Math.max(0, playableForTrack.findIndex((item) => item.id === track.id));

  const play = () => {
    if (isCurrent) {
      togglePlay();
      return;
    }
    playContext(playableForTrack, startAt, album?.title || track.title);
  };

  const shufflePlay = () => {
    playContext(shuffleArray(playableForTrack), 0, album?.title || track.title);
  };

  const startRadio = () => {
    const radioTracks = uniqueTracks([
      track,
      ...(artist?.top_tracks || []),
      ...albumTracks,
      ...(artist?.album_list || []).flatMap((item) => item.tracks || []),
    ]).slice(0, 50);
    playContext(shuffleArray(radioTracks), 0, `Song radio · ${track.artist.name}`);
    toast("Song radio started", "success");
  };

  const handleLike = async () => {
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

  const handleFollow = async () => {
    if (!artist) return;
    if (!user) {
      toast("Log in to follow artists.", "error");
      navigate("/login");
      return;
    }
    try {
      const nowFollowing = await toggleFollow(artist.id, artist.name, artist.picture);
      toast(nowFollowing ? `Following ${artist.name}` : `Unfollowed ${artist.name}`, "success");
    } catch {
      toast("Could not update your following list.", "error");
    }
  };

  const copySongLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/track/${track.id}`);
      toast("Song link copied", "success");
    } catch {
      toast("Could not copy the link.", "error");
    }
  };

  return (
    <div className="animate-fade-up pb-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-30 blur-3xl"
          style={{ backgroundImage: `url(${track.album.cover})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-ink-850/55 to-ink-850" />
      </div>

      <div className="relative -mx-4 px-4 pt-6 md:-mx-7 md:px-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <img
            src={track.album.cover}
            alt={track.album.title}
            className="h-48 w-48 rounded-xl object-cover shadow-2xl sm:h-56 sm:w-56 lg:h-60 lg:w-60"
          />
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Song</p>
            <h1 className="mt-2 text-balance text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {track.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-sm text-white/65">
              <Link to={`/artist/${track.artist.id}`} className="font-semibold text-white hover:underline">
                {track.artist.name}
              </Link>
              {track.album.title && (
                <>
                  <span>·</span>
                  <Link to={`/album/${track.album.id}`} className="hover:text-white hover:underline">
                    {track.album.title}
                  </Link>
                </>
              )}
              {yearOf(track.release_date) && <span>· {yearOf(track.release_date)}</span>}
              <span>· {formatDuration(track.duration)}</span>
              {track.explicit && (
                <span className="ml-1 rounded-sm bg-white/20 px-1 py-0.5 text-[9px] font-bold text-white/80" title="Explicit">
                  E
                </span>
              )}
            </div>
            {album && (
              <p className="mt-3 text-xs text-white/40">
                {album.nb_tracks || albumTracks.length} songs
                {totalSeconds > 0 && ` · ${Math.floor(totalSeconds / 60)} min`}
                {artist ? ` · ${formatCount(artist.fans)} monthly listeners` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={play}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black shadow-glow transition hover:scale-105 hover:bg-spotify-bright"
            aria-label={isCurrent && isPlaying ? "Pause" : "Play song"}
          >
            {isCurrent && isPlaying ? (
              <Pause className="h-6 w-6 fill-current" />
            ) : (
              <Play className="ml-1 h-6 w-6 fill-current" />
            )}
          </button>
          <button
            onClick={shufflePlay}
            className="rounded-full p-2.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Shuffle play"
            title="Shuffle play"
          >
            <Shuffle className="h-5 w-5" />
          </button>
          <button
            onClick={startRadio}
            className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 transition hover:border-white/35 hover:text-white"
            title="Start song radio"
          >
            <Radio className="h-4 w-4" /> <span className="hidden sm:inline">Song radio</span>
          </button>
          <button
            onClick={() => void handleLike()}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border transition hover:bg-white/10",
              liked ? "border-primary/60 text-primary" : "border-white/20 text-white/70 hover:text-white",
            )}
            aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
            title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
          >
            <Heart className={cn("h-5 w-5", liked && "fill-current")} />
          </button>
          <button
            onClick={() => openAddToPlaylist(track)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Add to playlist"
            title="Add to playlist"
          >
            <ListPlus className="h-5 w-5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="More song options"
                title="More options"
              >
                <Ellipsis className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuItem onClick={() => { playNext(track); toast("Playing next", "success"); }}>
                <ListStart className="h-4 w-4" /> Play next
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { addToQueue(track); toast("Added to queue", "success"); }}>
                <ListPlus className="h-4 w-4" /> Add to queue
              </DropdownMenuItem>
              <DropdownMenuItem onClick={startRadio}>
                <Radio className="h-4 w-4" /> Start song radio
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(`/artist/${track.artist.id}`)}>
                <UserRound className="h-4 w-4" /> Go to artist
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/album/${track.album.id}`)}>
                <Disc3 className="h-4 w-4" /> Go to album
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copySongLink}>
                <Share2 className="h-4 w-4" /> Copy song link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.08] via-white/[0.035] to-transparent p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Quote className="h-4 w-4 fill-current" />
                </span>
                <div>
                  <h2 className="text-sm font-bold">Lyrics</h2>
                  <p className="text-[11px] text-white/40">{track.title}</p>
                </div>
              </div>
              {lyricLines.length > 8 && (
                <button
                  onClick={() => setLyricsExpanded((value) => !value)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  {lyricsExpanded ? "Show less" : "Show all"}
                </button>
              )}
            </div>

            {lyricsLoading ? (
              <div className="mt-5 space-y-4">
                {[75, 55, 82, 62, 48].map((width, position) => (
                  <div
                    key={position}
                    className="h-4 animate-pulse rounded-full bg-white/10"
                    style={{ width: `${width}%`, animationDelay: `${position * 80}ms` }}
                  />
                ))}
              </div>
            ) : lyrics?.instrumental ? (
              <div className="mt-6 flex flex-col items-center gap-2 py-6 text-center">
                <Music2 className="h-7 w-7 text-white/25" />
                <p className="text-sm font-semibold text-white/70">Instrumental</p>
                <p className="text-xs text-white/40">This song has no lyrics.</p>
              </div>
            ) : lyricLines.length ? (
              <div
                className={cn(
                  "relative mt-5 space-y-3",
                  !lyricsExpanded && lyricLines.length > 8 && "max-h-52 overflow-hidden",
                  lyricsExpanded && "thin-scrollbar max-h-80 overflow-y-auto pr-2",
                )}
              >
                {lyricLines.slice(0, lyricsExpanded ? lyricLines.length : 9).map((line, position) => (
                  <p key={`${line}-${position}`} className="text-[15px] font-semibold leading-relaxed text-white/75">
                    {line}
                  </p>
                ))}
                {!lyricsExpanded && lyricLines.length > 8 && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink-850 to-transparent" />
                )}
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-center gap-2 py-6 text-center">
                <Quote className="h-7 w-7 text-white/20" />
                <p className="text-sm font-semibold text-white/70">Lyrics not available yet</p>
                <p className="text-xs text-white/40">Check back later for the words to this song.</p>
              </div>
            )}
          </section>

          {albumTracks.length > 0 && album && (
            <section>
              <SectionHeading
                title="From the album"
                subtitle={`${album.title} · ${album.release_date ? yearOf(album.release_date) : album.artist.name}`}
                to={`/album/${album.id}`}
                action="Open album"
              />
              <TrackList
                tracks={albumTracks}
                context={album.title}
                showHeader={false}
                showCover={false}
                showAlbum={false}
              />
            </section>
          )}

          {moreTracks.length > 0 && (
            <section>
              <SectionHeading
                title={`More by ${track.artist.name}`}
                subtitle="Popular songs from this artist"
                to={`/artist/${track.artist.id}`}
                action="Open artist"
              />
              <TrackList tracks={moreTracks} context={track.artist.name} showAlbum={false} showHeader={false} />
            </section>
          )}

          <section>
            <SectionHeading title="Song details" subtitle="Information from the Musicly catalog" />
            <div className="grid gap-x-8 gap-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/35">Artist</p>
                <Link to={`/artist/${track.artist.id}`} className="mt-1 block font-medium text-white/80 hover:underline">
                  {track.artist.name}
                </Link>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/35">Album</p>
                <Link to={`/album/${track.album.id}`} className="mt-1 block font-medium text-white/80 hover:underline">
                  {track.album.title}
                </Link>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/35">Duration</p>
                <p className="mt-1 flex items-center gap-1.5 text-white/70">
                  <Clock3 className="h-3.5 w-3.5 text-white/35" /> {formatDuration(track.duration)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/35">Released</p>
                <p className="mt-1 text-white/70">
                  {track.release_date
                    ? new Date(track.release_date).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "Unknown"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/35">About this track</p>
                <p className="mt-1 leading-relaxed text-white/55">
                  {track.title} by {track.artist.name}
                  {track.album.title ? `, from the album ${track.album.title}` : ""}. Metadata and artwork are provided by
                  the public Deezer catalog.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-5">
            <h2 className="text-sm font-bold">About the artist</h2>
            <Link to={`/artist/${track.artist.id}`} className="mt-4 flex items-center gap-3">
              <img
                src={artist?.picture || track.artist.picture || track.album.cover}
                alt={track.artist.name}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-white/10"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{track.artist.name}</p>
                <p className="mt-0.5 text-xs text-white/45">
                  {artist ? `${formatCount(artist.fans)} monthly listeners` : "Artist"}
                </p>
              </div>
            </Link>
            {artist && (
              <>
                <p className="mt-4 text-xs leading-relaxed text-white/45">
                  {formatCount(artist.albums)} releases · Explore popular songs, albums and related artists.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <Button variant={followed ? "secondary" : "outline"} size="sm" onClick={() => void handleFollow()} className="gap-1.5">
                    {followed ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                    {followed ? "Following" : "Follow"}
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="gap-1.5 text-white/60">
                    <Link to={`/artist/${artist.id}`}>
                      View artist <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </section>

          {relatedArtists.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Fans also like</h2>
                <Link to={`/artist/${track.artist.id}`} className="text-[11px] font-semibold text-white/45 hover:text-white">
                  See all
                </Link>
              </div>
              <div className="space-y-1">
                {relatedArtists.map((related) => (
                  <Link
                    key={related.id}
                    to={`/artist/${related.id}`}
                    className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-white/[0.06]"
                  >
                    <img src={related.picture} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{related.name}</p>
                      <p className="text-[11px] text-white/40">Artist</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {otherAlbums.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">More releases</h2>
                <Link to={`/artist/${track.artist.id}`} className="text-[11px] font-semibold text-white/45 hover:text-white">
                  See all
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {otherAlbums.slice(0, 4).map((item) => (
                  <MediaCard key={item.id} item={item} kind="album" className="p-2" />
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-white/60">
              <Radio className="h-4 w-4 text-primary" /> Keep the music going
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-white/40">
              Start a song radio to hear this track mixed with similar songs from the artist and album.
            </p>
            <Button variant="secondary" size="sm" className="mt-3 w-full gap-1.5" onClick={startRadio}>
              <Radio className="h-3.5 w-3.5" /> Start song radio
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
