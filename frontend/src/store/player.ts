import { create } from "zustand";
import { api, apiUrl, getAccessToken } from "@/lib/api";
import type { Track } from "@/lib/types";
import { shuffleArray } from "@/lib/utils";

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  queue: Track[];
  index: number;
  isPlaying: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  progress: number;
  duration: number;
  context: string;
  queueOpen: boolean;
  lyricsOpen: boolean;
  buffering: boolean;
  playContext: (tracks: Track[], startIndex: number, context?: string) => void;
  playTrack: (track: Track, context?: string) => void;
  togglePlay: () => void;
  next: (automatic?: boolean) => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  jumpTo: (index: number) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setQueueOpen: (open: boolean) => void;
  setLyricsOpen: (open: boolean) => void;
  toggleLyrics: () => void;
  setBuffering: (buffering: boolean) => void;
}

export const audio = typeof Audio !== "undefined" ? new Audio() : (null as unknown as HTMLAudioElement);
if (audio) {
  audio.preload = "metadata";
}

const storedVolume = Number(localStorage.getItem("musicly_volume") ?? "0.85");
const initialVolume = Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : 0.85;

function reportHistory(track: Track, context: string) {
  if (!getAccessToken()) return;
  api.addHistory(track.id, context).catch(() => undefined);
}

function syncMediaSession(track: Track) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist.name,
    album: track.album.title,
    artwork: track.album.cover
      ? [
          { src: track.album.cover, sizes: "500x500", type: "image/jpeg" },
          { src: track.album.cover_small || track.album.cover, sizes: "250x250", type: "image/jpeg" },
        ]
      : [],
  });
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const startTrack = (track: Track, autoplay = true) => {
    if (!audio) return;
    const source =
      track.has_full_audio && track.stream_url ? apiUrl(track.stream_url) : apiUrl(track.preview);
    if (!source) {
      set({ isPlaying: false, buffering: false });
      return;
    }
    audio.src = source;
    audio.currentTime = 0;
    set({ duration: track.duration || 30, progress: 0, buffering: true });
    if (autoplay) {
      audio
        .play()
        .then(() => set({ isPlaying: true }))
        .catch(() => set({ isPlaying: false, buffering: false }));
    }
    syncMediaSession(track);
    reportHistory(track, get().context);
  };

  return {
    queue: [],
    index: -1,
    isPlaying: false,
    volume: initialVolume,
    muted: false,
    shuffle: false,
    repeat: "off",
    progress: 0,
    duration: 0,
    context: "",
    queueOpen: false,
    lyricsOpen: false,
    buffering: false,

    playContext: (tracks, startIndex, context = "") => {
      const playable = tracks.filter(
        (track) => Boolean(track.preview || (track.has_full_audio && track.stream_url)),
      );
      if (!playable.length) return;
      const target = tracks[startIndex];
      let queue = playable;
      let index = target ? playable.findIndex((item) => item.id === target.id) : 0;
      if (index < 0) index = 0;

      if (get().shuffle) {
        const current = queue[index];
        const rest = queue.filter((_, i) => i !== index);
        queue = [current, ...shuffleArray(rest)];
        index = 0;
      }

      if (audio) {
        audio.volume = get().muted ? 0 : get().volume;
      }
      set({ queue, index, context, isPlaying: true });
      startTrack(queue[index]);
    },

    playTrack: (track, context = "") => {
      if (!track.preview && !(track.has_full_audio && track.stream_url)) return;
      const existing = get().queue.findIndex((item) => item.id === track.id);
      if (existing >= 0) {
        set({ index: existing, isPlaying: true });
        startTrack(get().queue[existing]);
      } else {
        const queue = [...get().queue];
        queue.splice(get().index + 1, 0, track);
        set({ queue, index: get().index + 1, isPlaying: true, context });
        startTrack(track);
      }
    },

    togglePlay: () => {
      if (!audio) return;
      if (!get().queue.length) return;
      if (audio.paused) {
        audio
          .play()
          .then(() => set({ isPlaying: true }))
          .catch(() => set({ isPlaying: false }));
      } else {
        audio.pause();
        set({ isPlaying: false });
      }
    },

    next: (automatic = false) => {
      const { queue, index, repeat } = get();
      if (!queue.length) return;
      if (automatic && repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => undefined);
        return;
      }
      if (index + 1 < queue.length) {
        const nextIndex = index + 1;
        set({ index: nextIndex });
        startTrack(queue[nextIndex]);
        return;
      }
      if (repeat === "all") {
        const nextIndex = 0;
        set({ index: nextIndex });
        startTrack(queue[nextIndex]);
        return;
      }
      audio.pause();
      audio.currentTime = 0;
      set({ isPlaying: false, progress: 0, index: 0 });
    },

    prev: () => {
      const { queue, index, progress } = get();
      if (!queue.length) return;
      if (progress > 3) {
        audio.currentTime = 0;
        set({ progress: 0 });
        return;
      }
      const prevIndex = index > 0 ? index - 1 : get().repeat === "all" ? queue.length - 1 : 0;
      set({ index: prevIndex });
      startTrack(queue[prevIndex]);
    },

    seek: (seconds) => {
      if (!audio) return;
      audio.currentTime = seconds;
      set({ progress: seconds });
    },

    setVolume: (volume) => {
      const clamped = Math.min(1, Math.max(0, volume));
      if (audio) audio.volume = get().muted ? 0 : clamped;
      localStorage.setItem("musicly_volume", String(clamped));
      set({ volume: clamped, muted: clamped === 0 });
    },

    toggleMute: () => {
      const muted = !get().muted;
      if (audio) audio.volume = muted ? 0 : get().volume;
      set({ muted });
    },

    toggleShuffle: () => {
      const { shuffle, queue, index } = get();
      if (!queue.length) {
        set({ shuffle: !shuffle });
        return;
      }
      if (!shuffle) {
        const current = queue[index];
        const rest = queue.filter((_, i) => i !== index);
        set({ shuffle: true, queue: [current, ...shuffleArray(rest)], index: 0 });
      } else {
        set({ shuffle: false });
      }
    },

    cycleRepeat: () => {
      const order: RepeatMode[] = ["off", "all", "one"];
      const nextMode = order[(order.indexOf(get().repeat) + 1) % order.length];
      set({ repeat: nextMode });
    },

    addToQueue: (track) => set({ queue: [...get().queue, track] }),

    playNext: (track) => {
      const queue = [...get().queue];
      queue.splice(get().index + 1, 0, track);
      set({ queue });
    },

    jumpTo: (targetIndex) => {
      const { queue } = get();
      const track = queue[targetIndex];
      if (!track) return;
      set({ index: targetIndex });
      startTrack(track);
    },

    removeFromQueue: (removeIndex) => {
      const { queue, index } = get();
      if (removeIndex === index) return;
      const next = queue.filter((_, i) => i !== removeIndex);
      set({ queue: next, index: removeIndex < index ? index - 1 : index });
    },

    clearQueue: () => {
      audio?.pause();
      set({ queue: [], index: -1, isPlaying: false, progress: 0, duration: 0, context: "", lyricsOpen: false });
    },

    setQueueOpen: (open) =>
      set(open ? { queueOpen: true, lyricsOpen: false } : { queueOpen: false }),
    setLyricsOpen: (open) =>
      set(open ? { lyricsOpen: true, queueOpen: false } : { lyricsOpen: false }),
    toggleLyrics: () => {
      if (!get().queue.length) return;
      const open = !get().lyricsOpen;
      set({ lyricsOpen: open, queueOpen: open ? false : get().queueOpen });
    },
    setBuffering: (buffering) => set({ buffering }),
  };
});

if (audio) {
  audio.volume = initialVolume;
  audio.addEventListener("play", () => usePlayerStore.setState({ isPlaying: true }));
  audio.addEventListener("pause", () => usePlayerStore.setState({ isPlaying: false }));
  audio.addEventListener("waiting", () => usePlayerStore.setState({ buffering: true }));
  audio.addEventListener("playing", () => usePlayerStore.setState({ buffering: false }));
  audio.addEventListener("canplay", () => usePlayerStore.setState({ buffering: false }));
  audio.addEventListener("timeupdate", () => {
    usePlayerStore.setState({
      progress: audio.currentTime,
      duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : usePlayerStore.getState().duration,
    });
  });
  audio.addEventListener("ended", () => usePlayerStore.getState().next(true));
  audio.addEventListener("error", () => usePlayerStore.setState({ isPlaying: false, buffering: false }));

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => usePlayerStore.getState().togglePlay());
    navigator.mediaSession.setActionHandler("pause", () => usePlayerStore.getState().togglePlay());
    navigator.mediaSession.setActionHandler("nexttrack", () => usePlayerStore.getState().next());
    navigator.mediaSession.setActionHandler("previoustrack", () => usePlayerStore.getState().prev());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") usePlayerStore.getState().seek(details.seekTime);
    });
  }
}
