import { create } from "zustand";
import type { Track } from "@/lib/types";

export interface Toast {
  id: number;
  message: string;
  tone: "default" | "success" | "error";
}

interface UiState {
  toasts: Toast[];
  createPlaylistOpen: boolean;
  createPlaylistSeed: Track | null;
  addToPlaylistTrack: Track | null;
  mobilePlayerOpen: boolean;
  commandOpen: boolean;
  toast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  openCreatePlaylist: (seed?: Track | null) => void;
  closeCreatePlaylist: () => void;
  openAddToPlaylist: (track: Track) => void;
  closeAddToPlaylist: () => void;
  setMobilePlayerOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
}

let counter = 0;

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  createPlaylistOpen: false,
  createPlaylistSeed: null,
  addToPlaylistTrack: null,
  mobilePlayerOpen: false,
  commandOpen: false,

  toast: (message, tone = "default") => {
    const id = ++counter;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    window.setTimeout(() => get().dismissToast(id), 3200);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),

  openCreatePlaylist: (seed = null) => set({ createPlaylistOpen: true, createPlaylistSeed: seed }),
  closeCreatePlaylist: () => set({ createPlaylistOpen: false, createPlaylistSeed: null }),
  openAddToPlaylist: (track) => set({ addToPlaylistTrack: track }),
  closeAddToPlaylist: () => set({ addToPlaylistTrack: null }),
  setMobilePlayerOpen: (open) => set({ mobilePlayerOpen: open }),
  setCommandOpen: (open) => set({ commandOpen: open }),
}));
