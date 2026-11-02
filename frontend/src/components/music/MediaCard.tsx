import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import type { Album, Artist, Genre, Playlist, Track } from "@/lib/types";
import { api } from "@/lib/api";
import { usePlayerStore } from "@/store/player";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import { cn } from "@/lib/utils";

type EntityKind = "track" | "album" | "artist" | "playlist" | "genre";
type Entity = Track | Album | Artist | Playlist | Genre;

function entityMeta(item: any, kind: EntityKind) {
  switch (kind) {
    case "album":
      return {
        title: item.title,
        subtitle: item.artist?.name || "Album",
        image: item.cover,
        href: `/album/${item.id}`,
        round: false,
      };
    case "artist":
      return {
        title: item.name,
        subtitle: "Artist",
        image: item.picture,
        href: `/artist/${item.id}`,
        round: true,
      };
    case "playlist":
      return {
        title: item.name,
        subtitle: item.description || `Playlist · ${item.owner?.name || "Musicly"}`,
        image: item.cover,
        href: `/playlist/${item.id}`,
        round: false,
      };
    case "genre":
      return {
        title: item.name,
        subtitle: "Genre",
        image: item.picture,
        href: `/genre/${item.id}`,
        round: false,
      };
    default:
      return {
        title: item.title,
        subtitle: item.artist?.name || "Song",
        image: item.album?.cover || item.cover,
        href: `/track/${item.id}`,
        round: false,
      };
  }
}

export function MediaCard({
  item,
  kind,
  className,
}: {
  item: Entity;
  kind: EntityKind;
  className?: string;
}) {
  const navigate = useNavigate();
  const meta = entityMeta(item, kind);
  const { queue, index, isPlaying, playContext, playTrack, togglePlay } = usePlayerStore();
  const user = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);
  const [busy, setBusy] = useState(false);

  const currentId = queue[index]?.id;
  const isThisPlaying = kind === "track" && currentId === (item as Track).id;

  const playEntity = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (kind === "genre") {
      navigate(meta.href);
      return;
    }
    if (kind === "track") {
      const track = item as Track;
      if (currentId === track.id) togglePlay();
      else playTrack(track, "Musicly");
      return;
    }
    try {
      setBusy(true);
      if (kind === "album") {
        const album = await api.album((item as Album).id);
        if (album.tracks?.length) playContext(album.tracks, 0, album.title);
      } else if (kind === "artist") {
        const artist = await api.artist((item as Artist).id);
        if (artist.top_tracks?.length) playContext(artist.top_tracks, 0, artist.name);
      } else if (kind === "playlist") {
        const playlist = item as Playlist;
        if (playlist.source === "deezer" || String(playlist.id).startsWith("dz-")) {
          const full = await api.deezerPlaylist(playlist.id);
          if (full.tracks?.length) playContext(full.tracks.map((t) => t.track), 0, full.name);
        } else {
          if (!user) {
            toast("Log in to play your playlists.", "error");
            navigate("/login");
            return;
          }
          const full = await api.playlist(playlist.id);
          if (full.tracks?.length) playContext(full.tracks.map((t) => t.track), 0, full.name);
        }
      }
    } catch {
      toast("Could not start playback.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Link
      to={meta.href}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl bg-white/[0.035] p-3 transition-colors duration-200 hover:bg-white/[0.09]",
        className,
      )}
    >
      <div className="relative">
        <div className={cn("overflow-hidden", meta.round ? "rounded-full" : "rounded-lg")}>
          <img
            src={meta.image}
            alt={meta.title}
            loading="lazy"
            className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
        <button
          onClick={playEntity}
          aria-label={`Play ${meta.title}`}
          className={cn(
            "absolute bottom-2 right-2 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-primary text-black opacity-0 shadow-glow transition-all duration-200 hover:scale-105 hover:bg-spotify-bright group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100",
            (isThisPlaying || busy) && "translate-y-0 opacity-100",
          )}
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black" />
          ) : isThisPlaying && isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          )}
        </button>
      </div>
      <div className="min-w-0">
        <p className="title-clamp text-sm font-semibold text-white">{meta.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/55">{meta.subtitle}</p>
      </div>
    </Link>
  );
}
