import { create } from "zustand";
import { api, apiUrl, getAccessToken } from "@/lib/api";
import { getOfflineAudio } from "@/lib/offline";
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
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setQueueOpen: (open: boolean) => void;
  setLyricsOpen: (open: boolean) => void;
  toggleLyrics: () => void;
  setBuffering: (buffering: boolean) => void;
}

const hasAudio = typeof Audio !== "undefined";
let audio = hasAudio ? new Audio() : (null as unknown as HTMLAudioElement);
let standby = hasAudio ? new Audio() : (null as unknown as HTMLAudioElement);
if (audio) audio.preload = "auto";
if (standby) standby.preload = "auto";

const storedVolume = Number(localStorage.getItem("musicly_volume") ?? "0.85");
const initialVolume = Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : 0.85;
if (audio) audio.volume = initialVolume;
if (standby) standby.volume = initialVolume;

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

let startRequest = 0;
let currentOfflineUrl: string | null = null;
let prefetchToken = 0;
let prefetchedTrackId = "";
let prefetchedSource = "";

function bindAudioElement(element: HTMLAudioElement) {
  element.preload = "auto";
  element.addEventListener("play", () => {
    if (element === audio) usePlayerStore.setState({ isPlaying: true });
  });
  element.addEventListener("pause", () => {
    if (element === audio) usePlayerStore.setState({ isPlaying: false });
  });
  element.addEventListener("waiting", () => {
    if (element === audio) usePlayerStore.setState({ buffering: true });
  });
  element.addEventListener("playing", () => {
    if (element === audio) usePlayerStore.setState({ buffering: false });
  });
  element.addEventListener("canplay", () => {
    if (element === audio) usePlayerStore.setState({ buffering: false });
  });
  element.addEventListener("timeupdate", () => {
    if (element !== audio) return;
    usePlayerStore.setState({
      progress: element.currentTime,
      duration:
        Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : usePlayerStore.getState().duration,
    });
  });
  element.addEventListener("ended", () => {
    if (element === audio) usePlayerStore.getState().next(true);
  });
  element.addEventListener("error", () => {
    if (element === audio) usePlayerStore.setState({ isPlaying: false, buffering: false });
  });
}

if (audio) bindAudioElement(audio);
if (standby && standby !== audio) bindAudioElement(standby);

export const usePlayerStore = create<PlayerState>((set, get) => {
  const resetStandby = () => {
    prefetchToken += 1;
    prefetchedTrackId = "";
    prefetchedSource = "";
    if (!standby || standby === audio) return;
    standby.pause();
    standby.removeAttribute("src");
    standby.load();
  };

  const sourceFor = (track: Track) => {
    if (track.has_full_audio && track.stream_url) return apiUrl(track.stream_url);
    return track.preview ? apiUrl(track.preview) : "";
  };

  /**
   * Load the next queued track into a second audio element while the current
   * song plays. When the queue advances we swap the elements, so playback
   * starts from the already-buffered element instead of waiting for a new
   * network request (and, for YouTube-backed tracks, a fresh resolver call).
   */
  const prefetchNext = () => {
    if (!audio || !standby || standby === audio) return;
    const { queue, index, repeat } = get();
    const current = queue[index];
    if (!current) {
      resetStandby();
      return;
    }

    let nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      if (repeat === "all" && queue.length > 1) nextIndex = 0;
      else {
        resetStandby();
        return;
      }
    }

    const next = queue[nextIndex];
    if (!next || next.id === current.id || next.source === "imported") {
      resetStandby();
      return;
    }
    const source = sourceFor(next);
    if (!source) {
      resetStandby();
      return;
    }
    if (prefetchedTrackId === next.id && prefetchedSource === source) return;

    resetStandby();
    const token = prefetchToken;
    getOfflineAudio(next.id)
      .then((blob) => {
        if (token !== prefetchToken || !standby) return;
        // Offline tracks already start from IndexedDB; preloading them over
        // the network would waste bandwidth.
        if (blob) return;
        standby.src = source;
        standby.preload = "auto";
        standby.load();
        prefetchedTrackId = next.id;
        prefetchedSource = source;
      })
      .catch(() => undefined);
  };

  const startTrack = (track: Track, autoplay = true) => {
    if (!audio) return;
    const requestId = ++startRequest;
    const remoteSource = sourceFor(track);

    const activateSource = (source: string, objectUrl: string | null) => {
      if (requestId !== startRequest) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }

      const usePrefetched =
        !objectUrl &&
        Boolean(remoteSource) &&
        prefetchedTrackId === track.id &&
        prefetchedSource === remoteSource &&
        Boolean(standby);

      if (usePrefetched) {
        const previous = audio;
        audio = standby;
        standby = previous;
        prefetchedTrackId = "";
        prefetchedSource = "";
        prefetchToken += 1;
        if (currentOfflineUrl) {
          URL.revokeObjectURL(currentOfflineUrl);
          currentOfflineUrl = null;
        }
        previous.pause();
        previous.removeAttribute("src");
        previous.load();
      } else {
        resetStandby();
        if (currentOfflineUrl) {
          URL.revokeObjectURL(currentOfflineUrl);
          currentOfflineUrl = null;
        }
        audio.src = source;
      }

      currentOfflineUrl = objectUrl;
      audio.volume = get().muted ? 0 : get().volume;
      audio.currentTime = 0;
      set({ duration: track.duration || 30, progress: 0, buffering: true });
      if (autoplay) {
        audio
          .play()
          .then(() => set({ isPlaying: true }))
          .catch(() => set({ isPlaying: false, buffering: false }));
      } else {
        set({ isPlaying: false, buffering: false });
      }
      prefetchNext();
    };

    syncMediaSession(track);
    if (track.source !== "imported") reportHistory(track, get().context);

    getOfflineAudio(track.id)
      .then((blob) => {
        if (requestId !== startRequest) return;
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          activateSource(objectUrl, objectUrl);
          return;
        }
        if (remoteSource) activateSource(remoteSource, null);
        else set({ isPlaying: false, buffering: false });
      })
      .catch(() => {
        if (requestId !== startRequest) return;
        if (remoteSource) activateSource(remoteSource, null);
        else set({ isPlaying: false, buffering: false });
      });
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
        (track) =>
          track.source === "imported" ||
          Boolean(track.preview || (track.has_full_audio && track.stream_url)),
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

      set({ queue, index, context, isPlaying: true });
      startTrack(queue[index]);
    },

    playTrack: (track, context = "") => {
      if (track.source !== "imported" && !track.preview && !(track.has_full_audio && track.stream_url)) return;
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
      resetStandby();
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
      prefetchNext();
    },

    cycleRepeat: () => {
      const order: RepeatMode[] = ["off", "all", "one"];
      const nextMode = order[(order.indexOf(get().repeat) + 1) % order.length];
      set({ repeat: nextMode });
      prefetchNext();
    },

    addToQueue: (track) => {
      set({ queue: [...get().queue, track] });
      prefetchNext();
    },

    playNext: (track) => {
      const queue = [...get().queue];
      queue.splice(get().index + 1, 0, track);
      set({ queue });
      prefetchNext();
    },

    jumpTo: (targetIndex) => {
      const { queue } = get();
      const track = queue[targetIndex];
      if (!track) return;
      set({ index: targetIndex });
      startTrack(track);
    },

    reorderQueue: (fromIndex, toIndex) => {
      const { queue, index } = get();
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length) return;

      const next = [...queue];
      const [track] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, track);

      let nextIndex = index;
      if (fromIndex === index) nextIndex = toIndex;
      else if (fromIndex < index && toIndex >= index) nextIndex = index - 1;
      else if (fromIndex > index && toIndex <= index) nextIndex = index + 1;

      set({ queue: next, index: nextIndex });
      prefetchNext();
    },

    removeFromQueue: (removeIndex) => {
      const { queue, index } = get();
      if (removeIndex === index) return;
      const next = queue.filter((_, i) => i !== removeIndex);
      set({ queue: next, index: removeIndex < index ? index - 1 : index });
      prefetchNext();
    },

    clearQueue: () => {
      startRequest += 1;
      prefetchToken += 1;
      prefetchedTrackId = "";
      prefetchedSource = "";
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      if (standby && standby !== audio) {
        standby.pause();
        standby.removeAttribute("src");
        standby.load();
      }
      if (currentOfflineUrl) {
        URL.revokeObjectURL(currentOfflineUrl);
        currentOfflineUrl = null;
      }
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

if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("play", () => usePlayerStore.getState().togglePlay());
  navigator.mediaSession.setActionHandler("pause", () => usePlayerStore.getState().togglePlay());
  navigator.mediaSession.setActionHandler("nexttrack", () => usePlayerStore.getState().next());
  navigator.mediaSession.setActionHandler("previoustrack", () => usePlayerStore.getState().prev());
  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (typeof details.seekTime === "number") usePlayerStore.getState().seek(details.seekTime);
  });
}
