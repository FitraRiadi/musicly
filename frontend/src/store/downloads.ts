import { create } from "zustand";
import {
  clearOfflineTracks,
  downloadTrackForOffline,
  listOfflineTracks,
  removeOfflineTrack,
  type OfflineTrack,
} from "@/lib/offline";
import type { Track } from "@/lib/types";

export interface ActiveDownload {
  track: Track;
  status: "downloading" | "error";
  progress: number | null;
  error?: string;
}

interface DownloadsState {
  items: OfflineTrack[];
  active: Record<string, ActiveDownload>;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  download: (track: Track) => Promise<boolean>;
  downloadMany: (tracks: Track[]) => Promise<{ downloaded: number; skipped: number; failed: number }>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  isDownloaded: (id: string) => boolean;
}

let loadPromise: Promise<void> | null = null;

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  items: [],
  active: {},
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      set({ loading: true });
      try {
        const items = await listOfflineTracks();
        set({ items, loaded: true, loading: false });
      } catch {
        set({ loaded: true, loading: false });
      }
    })();
    try {
      await loadPromise;
    } finally {
      loadPromise = null;
    }
  },

  download: async (track) => {
    if (!get().loaded) await get().load();
    if (get().items.some((item) => item.id === track.id)) return false;
    if (get().active[track.id]?.status === "downloading") return false;

    set((state) => ({
      active: {
        ...state.active,
        [track.id]: { track, status: "downloading", progress: 0 },
      },
    }));

    try {
      const entry = await downloadTrackForOffline(track, (progress) => {
        set((state) => {
          const active = state.active[track.id];
          if (!active) return state;
          return {
            active: {
              ...state.active,
              [track.id]: { ...active, progress },
            },
          };
        });
      });

      set((state) => {
        const active = { ...state.active };
        delete active[track.id];
        return {
          items: [entry, ...state.items.filter((item) => item.id !== entry.id)],
          active,
          loaded: true,
        };
      });
      return true;
    } catch (error) {
      set((state) => {
        const active = { ...state.active };
        delete active[track.id];
        return { active };
      });
      throw error;
    }
  },

  downloadMany: async (tracks) => {
    const result = { downloaded: 0, skipped: 0, failed: 0 };
    const seen = new Set<string>();
    if (!get().loaded) await get().load();

    for (const track of tracks) {
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      if (get().items.some((item) => item.id === track.id)) {
        result.skipped += 1;
        continue;
      }
      try {
        const didDownload = await get().download(track);
        if (didDownload) result.downloaded += 1;
        else result.skipped += 1;
      } catch {
        result.failed += 1;
      }
    }
    return result;
  },

  remove: async (id) => {
    await removeOfflineTrack(id);
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
  },

  clear: async () => {
    await clearOfflineTracks();
    set({ items: [], active: {} });
  },

  isDownloaded: (id) => get().items.some((item) => item.id === id),
}));
