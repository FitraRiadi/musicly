import { create } from "zustand";
import { api } from "@/lib/api";
import type { Playlist, Track } from "@/lib/types";

interface LibraryState {
  liked: Record<string, Track>;
  followed: Record<string, { id: string; name: string; picture: string }>;
  playlists: Playlist[];
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => Promise<boolean>;
  isFollowing: (artistId: string) => boolean;
  toggleFollow: (artistId: string, name: string, picture?: string) => Promise<boolean>;
  refreshPlaylists: () => Promise<void>;
  addPlaylistLocally: (playlist: Playlist) => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  liked: {},
  followed: {},
  playlists: [],
  loaded: false,

  load: async () => {
    try {
      const data = await api.library();
      const liked: Record<string, Track> = {};
      data.liked.items.forEach((item) => {
        liked[item.track.id] = item.track;
      });
      const followed: Record<string, { id: string; name: string; picture: string }> = {};
      data.artists.forEach((artist) => {
        followed[String(artist.artist_id)] = {
          id: String(artist.artist_id),
          name: artist.name,
          picture: artist.picture_url,
        };
      });
      set({ liked, followed, playlists: data.playlists, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  reset: () => set({ liked: {}, followed: {}, playlists: [], loaded: false }),

  isLiked: (trackId) => Boolean(get().liked[trackId]),

  toggleLike: async (track) => {
    const alreadyLiked = Boolean(get().liked[track.id]);
    const next = { ...get().liked };
    if (alreadyLiked) {
      delete next[track.id];
    } else {
      next[track.id] = { ...track, liked: true };
    }
    set({ liked: next });
    try {
      if (alreadyLiked) await api.unlike(track.id);
      else await api.like(track.id);
      return !alreadyLiked;
    } catch (error) {
      set({ liked: get().liked });
      throw error;
    }
  },

  isFollowing: (artistId) => Boolean(get().followed[artistId]),

  toggleFollow: async (artistId, name, picture = "") => {
    const already = Boolean(get().followed[artistId]);
    const next = { ...get().followed };
    if (already) delete next[artistId];
    else next[artistId] = { id: artistId, name, picture };
    set({ followed: next });
    try {
      if (already) await api.unfollow(artistId);
      else await api.follow(artistId, name, picture);
      return !already;
    } catch (error) {
      set({ followed: get().followed });
      throw error;
    }
  },

  refreshPlaylists: async () => {
    try {
      const data = await api.playlists();
      set({ playlists: data.items });
    } catch {
      /* keep stale list */
    }
  },

  addPlaylistLocally: (playlist) => set({ playlists: [playlist, ...get().playlists] }),
}));
