import { create } from "zustand";
import { api, apiUrl, getAccessToken } from "@/lib/api";
import { getOfflineAudio } from "@/lib/offline";
import { songHubGate } from "@/lib/songhub-gate";
import type { Track } from "@/lib/types";
import { shuffleArray } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

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
  /** Apply host playback to this device without mirroring it back to the room. */
  syncFromRoom: (track: Track, isPlaying: boolean, position: number) => void;
}

let suppressBroadcastFor: string | null = null;

function playbackLocked() {
  if (!songHubGate.active || songHubGate.isHost) return false;
  songHubGate.onBlocked?.();
  return true;
}

function syncHostPlayback(isPlaying: boolean, position: number) {
  if (!songHubGate.active || !songHubGate.isHost) return;
  songHubGate.onHostPlaybackChanged?.(isPlaying, position);
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
let activeSource = "";
let prefetchWhenPlaying: (() => void) | null = null;
let hasStartedSource = false;
let recoveryTimer: number | null = null;
let recoveryAttempt = 0;
let currentSourceKind: "full" | "preview" | "offline" = "full";
let currentAutoplay = true;
let recoverPlayback: ((reason: "error" | "timeout") => void) | null = null;

type StartOptions = { forcePreview?: boolean; refresh?: boolean; attempt?: number };

function clearRecoveryTimer() {
  if (recoveryTimer !== null) {
    window.clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
}

function withRefresh(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}refresh=1&retry=${Date.now()}`;
}

function bindAudioElement(element: HTMLAudioElement) {
  element.preload = "auto";
  // `play` only means playback was requested. `playing` is the event that
  // confirms the media clock is actually moving, so we never report progress
  // before that point.
  element.addEventListener("pause", () => {
    if (element !== audio) return;
    clearRecoveryTimer();
    usePlayerStore.setState({ isPlaying: false });
  });
  element.addEventListener("waiting", () => {
    if (element === audio) usePlayerStore.setState({ buffering: true });
  });
  element.addEventListener("stalled", () => {
    if (element === audio) usePlayerStore.setState({ buffering: true });
  });
  element.addEventListener("playing", () => {
    if (element !== audio) return;
    if (!activeSource || element.src !== activeSource) return;
    hasStartedSource = true;
    clearRecoveryTimer();
    usePlayerStore.setState({
      buffering: false,
      isPlaying: true,
      progress: element.currentTime,
      duration:
        Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : usePlayerStore.getState().duration,
    });
    prefetchWhenPlaying?.();
  });
  element.addEventListener("canplay", () => {
    if (element !== audio) return;
    if (!activeSource || element.src !== activeSource) return;
    // A paused element is ready but not autoplaying (for example a paused
    // Song Hub sync). Keep the spinner for autoplay until `playing` fires.
    if (element.paused) usePlayerStore.setState({ buffering: false });
  });
  element.addEventListener("loadedmetadata", () => {
    if (element !== audio) return;
    if (!activeSource || element.src !== activeSource) return;
    if (Number.isFinite(element.duration) && element.duration > 0) {
      usePlayerStore.setState({ duration: element.duration });
    }
  });
  element.addEventListener("timeupdate", () => {
    if (element !== audio) return;
    if (!activeSource || element.src !== activeSource) return;
    // Ignore the browser's pre-play clock updates. This is what made the
    // progress bar move while a stream was still being prepared.
    if (!hasStartedSource) return;
    usePlayerStore.setState({
      progress: element.currentTime,
      duration:
        Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : usePlayerStore.getState().duration,
    });
  });
  element.addEventListener("ended", () => {
    if (element !== audio) return;
    if (!activeSource || element.src !== activeSource) return;
    hasStartedSource = false;
    usePlayerStore.getState().next(true);
  });
  element.addEventListener("error", () => {
    if (element !== audio) return;
    if (!activeSource || element.src !== activeSource) return;
    hasStartedSource = false;
    usePlayerStore.setState({ isPlaying: false, buffering: false });
    recoverPlayback?.("error");
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

  const previewSourceFor = (track: Track) => {
    // Prefer the backend's preview endpoint. It follows a fresh Deezer redirect
    // because signed preview URLs embedded in catalog payloads expire.
    const previewEndpoint = track.stream_url?.replace(/\/stream\/?$/, "/preview/");
    if (previewEndpoint) return apiUrl(previewEndpoint);
    if (track.deezer_id) return apiUrl(`/tracks/dz-${track.deezer_id}/preview/`);
    if (/^\d+$/.test(track.id)) return apiUrl(`/tracks/dz-${track.id}/preview/`);
    return track.preview ? apiUrl(track.preview) : "";
  };

  const sourceFor = (track: Track, options: StartOptions = {}) => {
    if (!options.forcePreview && track.has_full_audio && track.stream_url) {
      const source = apiUrl(track.stream_url);
      return options.refresh ? withRefresh(source) : source;
    }
    const preview = previewSourceFor(track);
    return options.refresh && preview ? withRefresh(preview) : preview;
  };

  /**
   * Load the next queued track into a second audio element while the current
   * song plays. When the queue advances we swap the elements, so playback
   * starts from the already-buffered element instead of waiting for a new
   * network request (and, for YouTube-backed tracks, a fresh resolver call).
   */
  const prefetchNext = () => {
    if (!audio || !standby || standby === audio) return;
    // Never compete with the current track while it is still opening its
    // stream. Prefetching is triggered by the `playing` event once audio has
    // actually started.
    if (audio.paused || audio.readyState < 2) return;
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

  const startTrack = (track: Track, autoplay = true, startAt = 0, options: StartOptions = {}) => {
    if (!audio) return;
    const requestId = ++startRequest;
    const remoteSource = sourceFor(track, options);
    const isRecovery = Boolean(options.attempt);

    recoveryAttempt = options.attempt ?? 0;
    currentAutoplay = autoplay;
    currentSourceKind = options.forcePreview
      ? "preview"
      : track.has_full_audio && track.stream_url
        ? "full"
        : "preview";
    hasStartedSource = false;
    clearRecoveryTimer();

    // Stop the previous stream before resolving the new one. Leaving the old
    // request open lets it compete with the new stream in the proxy, which is
    // especially visible when a radio queue starts and immediately prefetches
    // its next track.
    audio.pause();
    if (activeSource) {
      audio.removeAttribute("src");
      audio.load();
    }
    activeSource = "";
    set({
      isPlaying: false,
      buffering: Boolean(remoteSource),
      progress: Math.max(0, startAt || 0),
      duration: track.duration || 30,
    });

    const armWatchdog = (kind: "full" | "preview" | "offline") => {
      clearRecoveryTimer();
      const timeout = kind === "full" ? 75000 : 20000;
      recoveryTimer = window.setTimeout(() => {
        if (requestId !== startRequest || hasStartedSource) return;
        recoverPlayback?.("timeout");
      }, timeout);
    };

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
        Boolean(standby) &&
        !standby.error;

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

      const kind = objectUrl ? "offline" : options.forcePreview ? "preview" : "full";
      currentSourceKind = kind;
      activeSource = audio.src || source;
      hasStartedSource = false;
      currentOfflineUrl = objectUrl;
      audio.volume = get().muted ? 0 : get().volume;
      const safeStart = Math.max(0, startAt || 0);
      audio.currentTime = safeStart;
      set({ duration: track.duration || 30, progress: safeStart, buffering: true, isPlaying: false });
      if (autoplay) {
        armWatchdog(kind);
        audio
          .play()
          .catch((error: unknown) => {
            if (requestId !== startRequest) return;
            const name = error instanceof DOMException ? error.name : "";
            // Switching tracks aborts the previous play() promise on purpose.
            if (name === "AbortError") return;
            // Autoplay policy is a user-gesture problem, not a broken stream.
            if (name === "NotAllowedError") {
              clearRecoveryTimer();
              set({ isPlaying: false, buffering: false });
              return;
            }
            recoverPlayback?.("error");
          });
      } else {
        set({ isPlaying: false, buffering: false });
      }
    };

    syncMediaSession(track);
    if (!isRecovery) {
      if (track.source !== "imported") reportHistory(track, get().context);
      if (songHubGate.active && songHubGate.isHost && !songHubGate.applyingRemote) {
        if (suppressBroadcastFor === track.id) {
          suppressBroadcastFor = null;
        } else if (track.source !== "imported") {
          songHubGate.onHostTrackStarted?.(track);
        }
      }
    }

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

  recoverPlayback = (reason) => {
    if (!audio) return;
    const state = get();
    const track = state.queue[state.index];
    if (!track || !currentAutoplay) {
      set({ isPlaying: false, buffering: false });
      return;
    }

    clearRecoveryTimer();
    const position = hasStartedSource ? Math.max(0, audio.currentTime || 0) : 0;

    // One quick retry for a broken resolver, then fall back to the preview.
    // A timeout means the resolver is too slow, so don't make the user wait
    // for a second full attempt.
    if (
      reason === "error" &&
      recoveryAttempt === 0 &&
      currentSourceKind === "full" &&
      track.has_full_audio &&
      track.stream_url
    ) {
      recoveryAttempt = 1;
      startTrack(track, true, position, { refresh: true, attempt: 1 });
      return;
    }

    if (currentSourceKind !== "preview" && previewSourceFor(track)) {
      recoveryAttempt = 2;
      useUiStore.getState().toast(
        reason === "timeout"
          ? "Full song is taking too long — playing a preview."
          : "Full song unavailable — playing a preview.",
        "error",
      );
      startTrack(track, true, 0, { forcePreview: true, attempt: 2 });
      return;
    }

    // A preview can fail transiently (CDN/network). Retry it once with a fresh
    // URL before giving up so one flaky request does not kill playback.
    if (currentSourceKind === "preview" && recoveryAttempt < 3 && previewSourceFor(track)) {
      recoveryAttempt = 3;
      startTrack(track, true, position, { forcePreview: true, attempt: 3, refresh: true });
      return;
    }

    set({ isPlaying: false, buffering: false });
    useUiStore.getState().toast("Couldn't play this song. Tap play to try again.", "error");
  };

  // The `playing` event is a module-level listener, so expose the prefetch
  // action to it without creating another store subscription.
  prefetchWhenPlaying = prefetchNext;

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
      if (songHubGate.active && !songHubGate.isHost) {
        const requested = tracks[startIndex] ?? tracks[0];
        if (requested) songHubGate.onTrackRequest?.(requested);
        return;
      }
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
      if (songHubGate.active && !songHubGate.isHost) {
        songHubGate.onTrackRequest?.(track);
        return;
      }
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
      if (playbackLocked()) return;
      const { queue, index, buffering, isPlaying, progress } = get();
      const track = queue[index];
      if (!track) return;

      // If a previous stream failed, tapping play must retry that same track
      // instead of silently doing nothing on a dead <audio> element.
      if (!activeSource || audio.error) {
        startTrack(track, true, Math.max(0, progress));
        return;
      }

      // Tapping play while the song is still opening acts as a manual retry.
      if (buffering && !isPlaying) {
        startTrack(track, true, Math.max(0, progress));
        return;
      }

      if (audio.paused) {
        currentAutoplay = true;
        set({ buffering: true });
        audio
          .play()
          .then(() => {
            syncHostPlayback(true, audio.currentTime);
          })
          .catch(() => recoverPlayback?.("error"));
      } else {
        currentAutoplay = false;
        audio.pause();
        set({ isPlaying: false, buffering: false });
        syncHostPlayback(false, audio.currentTime);
      }
    },

    next: (automatic = false) => {
      if (playbackLocked()) return;
      const { queue, index, repeat } = get();
      if (!queue.length) return;
      if (automatic && repeat === "one") {
        if (audio.error || !activeSource) {
          startTrack(queue[index], true, 0);
          return;
        }
        clearRecoveryTimer();
        audio.currentTime = 0;
        hasStartedSource = false;
        set({ progress: 0, buffering: true });
        audio.play().catch(() => recoverPlayback?.("error"));
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
      currentAutoplay = false;
      set({ isPlaying: false, buffering: false, progress: 0, index: 0 });
      syncHostPlayback(false, 0);
      resetStandby();
    },

    prev: () => {
      if (playbackLocked()) return;
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
      if (playbackLocked()) return;
      if (!activeSource) return;
      const duration = get().duration;
      const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
      audio.currentTime = target;
      set({ progress: target });
      syncHostPlayback(!audio.paused, target);
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
      if (playbackLocked()) return;
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
      if (playbackLocked()) return;
      const order: RepeatMode[] = ["off", "all", "one"];
      const nextMode = order[(order.indexOf(get().repeat) + 1) % order.length];
      set({ repeat: nextMode });
      prefetchNext();
    },

    addToQueue: (track) => {
      if (playbackLocked()) return;
      set({ queue: [...get().queue, track] });
      prefetchNext();
    },

    playNext: (track) => {
      if (playbackLocked()) return;
      const queue = [...get().queue];
      queue.splice(get().index + 1, 0, track);
      set({ queue });
      prefetchNext();
    },

    jumpTo: (targetIndex) => {
      if (playbackLocked()) return;
      const { queue } = get();
      const track = queue[targetIndex];
      if (!track) return;
      set({ index: targetIndex });
      startTrack(track);
    },

    reorderQueue: (fromIndex, toIndex) => {
      if (playbackLocked()) return;
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
      if (playbackLocked()) return;
      const { queue, index } = get();
      if (removeIndex === index) return;
      const next = queue.filter((_, i) => i !== removeIndex);
      set({ queue: next, index: removeIndex < index ? index - 1 : index });
      prefetchNext();
    },

    clearQueue: () => {
      if (playbackLocked()) return;
      startRequest += 1;
      prefetchToken += 1;
      prefetchedTrackId = "";
      prefetchedSource = "";
      clearRecoveryTimer();
      hasStartedSource = false;
      recoveryAttempt = 0;
      currentSourceKind = "full";
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      activeSource = "";
      if (standby && standby !== audio) {
        standby.pause();
        standby.removeAttribute("src");
        standby.load();
      }
      if (currentOfflineUrl) {
        URL.revokeObjectURL(currentOfflineUrl);
        currentOfflineUrl = null;
      }
      set({
        queue: [],
        index: -1,
        isPlaying: false,
        buffering: false,
        progress: 0,
        duration: 0,
        context: "",
        lyricsOpen: false,
      });
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

    syncFromRoom: (track, playing, position) => {
      if (!audio) return;
      const state = get();
      const current = state.queue[state.index];
      if (!current || current.id !== track.id) {
        suppressBroadcastFor = track.id;
        set({ queue: [track], index: 0, context: "Song Hub", isPlaying: playing });
        startTrack(track, playing, Math.max(0, position || 0));
        return;
      }
      if (playing && audio.paused) {
        currentAutoplay = true;
        set({ buffering: true });
        audio.play().catch(() => recoverPlayback?.("error"));
      } else if (!playing && !audio.paused) {
        currentAutoplay = false;
        audio.pause();
        set({ isPlaying: false, buffering: false });
      }
      if (Number.isFinite(position) && Math.abs(audio.currentTime - position) > 2.5) {
        audio.currentTime = Math.max(0, position);
        set({ progress: Math.max(0, position) });
      }
    },
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
