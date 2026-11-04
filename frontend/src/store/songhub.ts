import { create } from "zustand";
import { api } from "@/lib/api";
import { songHubGate, resetSongHubGate } from "@/lib/songhub-gate";
import type {
  SongHubInvite,
  SongHubMember,
  SongHubMessage,
  SongHubReaction,
  SongHubReactionKey,
  SongHubRequest,
  SongHubRoom,
  SongHubRoomSummary,
  SongHubState,
  Track,
} from "@/lib/types";
import { usePlayerStore } from "@/store/player";
import { useUiStore } from "@/store/ui";

type VoiceStatus = "idle" | "requesting" | "live" | "denied" | "unsupported";

interface SongHubStore {
  lobbyRooms: SongHubRoomSummary[];
  invitations: SongHubInvite[];
  room: SongHubRoom | null;
  members: SongHubMember[];
  me: SongHubState["me"];
  requests: SongHubRequest[];
  messages: SongHubMessage[];
  reactions: SongHubReaction[];
  loading: boolean;
  lobbyLoading: boolean;
  joining: boolean;
  hydrating: boolean;
  error: string | null;
  pendingRequestTrack: Track | null;
  requestSending: boolean;
  micOn: boolean;
  voiceStatus: VoiceStatus;
  voiceError: string | null;
  voiceVolume: number;
  remoteAudioBlocked: boolean;
  speaking: Record<number, boolean>;

  hydrate: () => Promise<void>;
  loadLobby: () => Promise<void>;
  createRoom: (name: string, visibility: "public" | "private", password?: string) => Promise<string>;
  joinRoom: (code: string, password?: string) => Promise<void>;
  refresh: () => Promise<void>;
  applyState: (data: SongHubState, options?: { fromHost?: boolean }) => void;
  leaveRoom: () => Promise<void>;
  reset: () => void;
  requestTrackSelection: (track: Track) => void;
  confirmRequest: () => Promise<void>;
  cancelRequest: () => void;
  sendMessage: (body: string) => Promise<void>;
  sendSticker: (sticker: string) => Promise<void>;
  react: (emoji: SongHubReactionKey) => Promise<void>;
  resolveRequest: (requestId: number, action: "accept" | "decline") => Promise<void>;
  transferHost: (userId: number) => Promise<void>;
  updateSettings: (payload: { name?: string; visibility?: "public" | "private"; password?: string }) => Promise<void>;
  inviteFriend: (userId: number) => Promise<boolean>;
  toggleMic: () => Promise<void>;
  setVoiceVolume: (volume: number) => void;
  enableRoomAudio: () => void;
  roomLink: (code?: string) => string;
}

const VOICE_VOLUME_KEY = "musicly_hub_voice_volume";
const INITIAL_VOLUME = (() => {
  const stored = Number(localStorage.getItem(VOICE_VOLUME_KEY) ?? "0.9");
  return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 0.9;
})();

let stateTimer: number | undefined;
let signalTimer: number | undefined;
let heartbeatTimer: number | undefined;
let speakingTimer: number | undefined;
let hydratePromise: Promise<void> | null = null;
let lastSignalId = 0;
let optimisticUntil = 0;
let refreshing = false;
let signalPolling = false;
let leavingCode: string | null = null;
const dismissedRooms = new Set<string>();
const seenSignals = new Set<number>();

let localStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
const peers = new Map<number, RTCPeerConnection>();
const senders = new Map<number, RTCRtpSender>();
const remoteAudio = new Map<number, HTMLAudioElement>();
const pendingCandidates = new Map<number, RTCIceCandidateInit[]>();
const analysers = new Map<number, { analyser: AnalyserNode; data: Uint8Array }>();
let voiceVolume = INITIAL_VOLUME;

function toast(message: string, tone: "default" | "success" | "error" = "default") {
  useUiStore.getState().toast(message, tone);
}

/** user ids keyed by room code, kept outside state to avoid re-renders. */
const currentUserIds = new Map<string, number>();

function setMyUserId(code: string, id: number | null) {
  if (id === null) currentUserIds.delete(code);
  else currentUserIds.set(code, id);
}

function ensureAudioContext() {
  if (typeof AudioContext === "undefined") return null;
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function updateSpeaking() {
  const state = useSongHubStore.getState();
  if (!state.room) return;
  const meId = currentUserIds.get(state.room.code);
  const next: Record<number, boolean> = {};
  analysers.forEach(({ analyser, data }, key) => {
    analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
    let peak = 0;
    for (let index = 0; index < data.length; index += 1) {
      peak = Math.max(peak, Math.abs(data[index] - 128));
    }
    next[key] = peak > 14;
  });
  if (meId === undefined) delete next[meId ?? -1];
  const changed =
    Object.keys(next).length !== Object.keys(state.speaking).length ||
    Object.entries(next).some(([key, value]) => state.speaking[Number(key)] !== value);
  if (changed) useSongHubStore.setState({ speaking: next });
}

function startSpeakingLoop() {
  if (speakingTimer !== undefined) return;
  speakingTimer = window.setInterval(updateSpeaking, 240);
}

function stopSpeakingLoop() {
  if (speakingTimer !== undefined) {
    window.clearInterval(speakingTimer);
    speakingTimer = undefined;
  }
}

function attachAnalyser(key: number, stream: MediaStream) {
  const context = ensureAudioContext();
  if (!context) return;
  try {
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analysers.set(key, {
      analyser,
      data: new Uint8Array(analyser.frequencyBinCount),
    });
    startSpeakingLoop();
  } catch {
    // A browser may refuse an analyser for a muted/ended track.
  }
}

function detachAnalyser(key: number) {
  analysers.delete(key);
  useSongHubStore.setState((state) => {
    if (!(key in state.speaking)) return state;
    const speaking = { ...state.speaking };
    delete speaking[key];
    return { speaking };
  });
}

function removeRemoteAudio(peerId: number) {
  const audio = remoteAudio.get(peerId);
  if (audio) {
    audio.pause();
    audio.srcObject = null;
    remoteAudio.delete(peerId);
  }
  detachAnalyser(peerId);
}

function closePeer(peerId: number) {
  const pc = peers.get(peerId);
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    peers.delete(peerId);
  }
  senders.delete(peerId);
  pendingCandidates.delete(peerId);
  removeRemoteAudio(peerId);
}

function closeAllPeers() {
  Array.from(peers.keys()).forEach(closePeer);
}

function sendSignal(peerId: number, kind: "offer" | "answer" | "candidate", payload: Record<string, any>) {
  const code = useSongHubStore.getState().room?.code;
  if (!code) return;
  void api
    .sendSongHubSignal(code, { target_user_id: peerId, kind, payload })
    .catch(() => undefined);
}

function ensurePeer(peerId: number) {
  let pc = peers.get(peerId);
  if (pc) return pc;
  if (typeof RTCPeerConnection === "undefined") return null;
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ],
  });
  peers.set(peerId, pc);
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      const sender = pc!.addTrack(track, localStream!);
      if (localStream) senders.set(peerId, sender);
    });
  }
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal(peerId, "candidate", event.candidate.toJSON() as Record<string, any>);
    }
  };
  pc.ontrack = (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    let audio = remoteAudio.get(peerId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      remoteAudio.set(peerId, audio);
    }
    audio.srcObject = stream;
    audio.volume = voiceVolume;
    const member = useSongHubStore.getState().members.find((row) => row.user.id === peerId);
    audio.muted = Boolean(member && !member.mic_on);
    audio
      .play()
      .then(() => useSongHubStore.setState({ remoteAudioBlocked: false }))
      .catch(() => useSongHubStore.setState({ remoteAudioBlocked: true }));
    attachAnalyser(peerId, stream);
  };
  pc.onconnectionstatechange = () => {
    if (pc?.connectionState === "failed" || pc?.connectionState === "closed") {
      closePeer(peerId);
    }
  };
  return pc;
}

async function flushCandidates(peerId: number) {
  const pc = peers.get(peerId);
  if (!pc?.remoteDescription) return;
  const queued = pendingCandidates.get(peerId) || [];
  pendingCandidates.delete(peerId);
  for (const candidate of queued) {
    await pc.addIceCandidate(candidate).catch(() => undefined);
  }
}

const offering = new Set<number>();

async function createOffer(peerId: number) {
  // Never negotiate an empty offer: a microphone must be attached first.
  if (!localStream || offering.has(peerId)) return;
  const pc = ensurePeer(peerId);
  if (!pc || pc.signalingState !== "stable") return;
  offering.add(peerId);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(peerId, "offer", { sdp: pc.localDescription?.toJSON() });
  } finally {
    offering.delete(peerId);
  }
}

async function replaceLocalTracks() {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  const renegotiate: number[] = [];
  for (const [peerId, pc] of peers) {
    const sender = senders.get(peerId);
    if (sender) {
      await sender.replaceTrack(track).catch(() => undefined);
    } else {
      const nextSender = pc.addTrack(track, localStream!);
      senders.set(peerId, nextSender);
      // The peer may already have completed an empty negotiation before the
      // microphone was ready. Add the track and re-offer so ICE starts.
      if (pc.signalingState === "stable") renegotiate.push(peerId);
    }
  }
  for (const peerId of renegotiate) {
    void createOffer(peerId);
  }
}

function normalizeCandidate(payload: any): RTCIceCandidateInit | null {
  if (!payload) return null;
  // Current clients send the candidate object directly; older payloads may
  // wrap it under a `candidate` key.
  if (typeof payload.candidate === "string") return payload as RTCIceCandidateInit;
  if (payload.candidate && typeof payload.candidate === "object") {
    return payload.candidate as RTCIceCandidateInit;
  }
  if (typeof payload === "string") return { candidate: payload };
  return null;
}

async function handleSignal(signal: { kind: string; from: { id: number | null }; payload: Record<string, any> }) {
  const peerId = signal.from.id;
  if (!peerId) return;
  if (signal.kind === "offer") {
    const pc = ensurePeer(peerId);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp));
      await flushCandidates(peerId);
      if (localStream) {
        const sender = senders.get(peerId);
        if (!sender) {
          const track = localStream.getAudioTracks()[0];
          if (track) senders.set(peerId, pc.addTrack(track, localStream));
        }
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(peerId, "answer", { sdp: pc.localDescription?.toJSON() });
    } catch {
      closePeer(peerId);
    }
    return;
  }
  const pc = peers.get(peerId);
  const candidate = signal.kind === "candidate" ? normalizeCandidate(signal.payload) : null;
  if (!pc) {
    if (signal.kind === "candidate" && candidate) {
      pendingCandidates.set(peerId, [
        ...(pendingCandidates.get(peerId) || []),
        candidate,
      ]);
    }
    return;
  }
  if (signal.kind === "answer") {
    if (pc.signalingState === "have-local-offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp)).catch(() => undefined);
      await flushCandidates(peerId);
    }
    return;
  }
  if (signal.kind === "candidate" && candidate) {
    if (pc.remoteDescription) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    } else {
      pendingCandidates.set(peerId, [
        ...(pendingCandidates.get(peerId) || []),
        candidate,
      ]);
    }
  }
}

function stopLocalMic() {
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  const code = useSongHubStore.getState().room?.code;
  const meId = code ? currentUserIds.get(code) : undefined;
  if (meId !== undefined) {
    detachAnalyser(meId);
    useSongHubStore.setState((state) => {
      const speaking = { ...state.speaking };
      delete speaking[meId];
      return { speaking };
    });
  }
  for (const [peerId, pc] of peers) {
    const sender = senders.get(peerId);
    if (sender) void sender.replaceTrack(null).catch(() => undefined);
    else pc.getSenders().forEach((row) => void row.replaceTrack(null).catch(() => undefined));
  }
}

function teardownRoom() {
  if (stateTimer !== undefined) {
    window.clearInterval(stateTimer);
    stateTimer = undefined;
  }
  if (signalTimer !== undefined) {
    window.clearInterval(signalTimer);
    signalTimer = undefined;
  }
  if (heartbeatTimer !== undefined) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
  stopSpeakingLoop();
  stopLocalMic();
  closeAllPeers();
  analysers.clear();
  pendingCandidates.clear();
  localStream = null;
  optimisticUntil = 0;
  lastSignalId = 0;
  refreshing = false;
  signalPolling = false;
  seenSignals.clear();
  const code = useSongHubStore.getState().room?.code;
  if (code) setMyUserId(code, null);
  resetSongHubGate();
  useSongHubStore.setState({
    room: null,
    members: [],
    me: null,
    requests: [],
    messages: [],
    reactions: [],
    micOn: false,
    voiceStatus: "idle",
    voiceError: null,
    remoteAudioBlocked: false,
    speaking: {},
    pendingRequestTrack: null,
  });
}

export const useSongHubStore = create<SongHubStore>((set, get) => {
  const engage = (code: string, data: SongHubState) => {
    teardownRoom();
    const meId = data.me?.membership_id
      ? data.members.find((member) => member.id === data.me?.membership_id)?.user.id ?? null
      : null;
    if (meId !== null) setMyUserId(code, meId);
    songHubGate.active = true;
    songHubGate.roomCode = code;
    songHubGate.roomName = data.room.name;
    songHubGate.isHost = data.me?.role === "host";
    songHubGate.onBlocked = () => {
      toast("Only the host controls room playback. Request a song instead.", "default");
    };
    songHubGate.onTrackRequest = (track) => get().requestTrackSelection(track);
    songHubGate.onHostTrackStarted = (track) => {
      const activeCode = get().room?.code;
      if (!activeCode) return;
      optimisticUntil = Date.now() + 2600;
      const room = get().room;
      if (room) {
        set({
          room: {
            ...room,
            current_track: track,
            is_playing: true,
            position_seconds: 0,
            position_updated_at: new Date().toISOString(),
          },
        });
      }
      void api
        .songHubPlayback(activeCode, { track, is_playing: true, position_seconds: 0 })
        .then((next) => {
          optimisticUntil = 0;
          get().applyState(next, { fromHost: true });
        })
        .catch((error: any) => {
          optimisticUntil = 0;
          toast(error?.message || "Could not sync your song to the room.", "error");
        });
    };
    songHubGate.onHostPlaybackChanged = (isPlaying, position) => {
      const activeCode = get().room?.code;
      if (!activeCode) return;
      optimisticUntil = Date.now() + 1800;
      const room = get().room;
      if (room) {
        set({
          room: {
            ...room,
            is_playing: isPlaying,
            position_seconds: Math.max(0, position),
            position_updated_at: new Date().toISOString(),
          },
        });
      }
      void api
        .songHubPlayback(activeCode, { is_playing: isPlaying, position_seconds: position })
        .then((next) => {
          optimisticUntil = 0;
          get().applyState(next, { fromHost: true });
        })
        .catch(() => {
          optimisticUntil = 0;
        });
    };
    set({
      room: data.room,
      members: data.members,
      me: data.me,
      requests: data.requests,
      messages: data.messages,
      reactions: data.reactions,
      error: null,
      micOn: false,
      voiceStatus: "idle",
      remoteAudioBlocked: false,
    });
    get().applyState(data);

    const poll = () => {
      if (!get().room) return;
      void get().refresh();
    };
    stateTimer = window.setInterval(poll, 1600);
    signalTimer = window.setInterval(() => {
      const room = get().room;
      if (!room || signalPolling) return;
      signalPolling = true;
      const code = room.code;
      void api
        .songHubSignals(code, lastSignalId)
        .then((payload) => {
          if (get().room?.code !== code) return;
          if (payload.last_id) lastSignalId = Math.max(lastSignalId, payload.last_id);
          payload.items.forEach((signal) => {
            if (seenSignals.has(signal.id)) return;
            seenSignals.add(signal.id);
            void handleSignal(signal);
          });
        })
        .catch(() => undefined)
        .finally(() => {
          signalPolling = false;
        });
    }, 1100);
    heartbeatTimer = window.setInterval(() => {
      const { room, me: membership } = get();
      if (!room || membership?.role !== "host" || !room.current_track) return;
      const player = usePlayerStore.getState();
      if (!player.isPlaying) return;
      set({
        room: {
          ...room,
          is_playing: true,
          position_seconds: player.progress,
          position_updated_at: new Date().toISOString(),
        },
      });
      void api
        .songHubPlayback(room.code, {
          is_playing: true,
          position_seconds: player.progress,
        })
        .catch(() => undefined);
    }, 8000);
  };

  return {
    lobbyRooms: [],
    invitations: [],
    room: null,
    members: [],
    me: null,
    requests: [],
    messages: [],
    reactions: [],
    loading: false,
    lobbyLoading: false,
    joining: false,
    hydrating: false,
    error: null,
    pendingRequestTrack: null,
    requestSending: false,
    micOn: false,
    voiceStatus: "idle",
    voiceError: null,
    voiceVolume: INITIAL_VOLUME,
    remoteAudioBlocked: false,
    speaking: {},

    hydrate: async () => {
      if (get().room || hydratePromise) return hydratePromise ?? Promise.resolve();
      hydratePromise = (async () => {
        set({ hydrating: true });
        try {
          const lobby = await api.songHubRooms();
          const invitations = await api.songHubInvitations().catch(() => ({ items: [] }));
          set({
            lobbyRooms: lobby.rooms,
            invitations: invitations.items,
          });
          if (lobby.my_room) {
            const data = await api.songHubState(lobby.my_room.code);
            engage(lobby.my_room.code, data);
          }
        } catch {
          // The lobby is optional; the app keeps working if it is offline.
        } finally {
          set({ hydrating: false });
          hydratePromise = null;
        }
      })();
      return hydratePromise;
    },

    loadLobby: async () => {
      set({ lobbyLoading: true, error: null });
      const wasLeaving = leavingCode;
      try {
        const [lobby, invitations] = await Promise.all([
          api.songHubRooms(),
          api.songHubInvitations().catch(() => ({ items: [] })),
        ]);
        set({
          lobbyRooms: lobby.rooms,
          invitations: invitations.items,
        });
        if (
          !wasLeaving &&
          lobby.my_room &&
          lobby.my_room.code !== leavingCode &&
          !dismissedRooms.has(lobby.my_room.code) &&
          get().room?.code !== lobby.my_room.code
        ) {
          const data = await api.songHubState(lobby.my_room.code);
          engage(lobby.my_room.code, data);
        }
      } catch (error: any) {
        set({ error: error?.message || "Could not load Song Hubs." });
      } finally {
        set({ lobbyLoading: false });
      }
    },

    createRoom: async (name, visibility, password) => {
      set({ joining: true, error: null });
      try {
        const data = await api.createSongHubRoom({ name, visibility, password });
        dismissedRooms.delete(data.room.code);
        engage(data.room.code, data);
        set({ lobbyRooms: [data.room, ...get().lobbyRooms.filter((row) => row.code !== data.room.code)] });
        return data.room.code;
      } catch (error: any) {
        set({ error: error?.message || "Could not create the room." });
        throw error;
      } finally {
        set({ joining: false });
      }
    },

    joinRoom: async (code, password) => {
      set({ joining: true, error: null });
      try {
        const data = await api.joinSongHub(code.trim().toUpperCase(), password);
        dismissedRooms.delete(data.room.code);
        engage(data.room.code, data);
      } catch (error: any) {
        set({ error: error?.message || "Could not join the room." });
        throw error;
      } finally {
        set({ joining: false });
      }
    },

    refresh: async () => {
      const room = get().room;
      if (!room || refreshing) return;
      refreshing = true;
      try {
        const data = await api.songHubState(room.code);
        // A poll that started before the user left must not re-enter the room
        // after teardown.
        if (get().room?.code !== room.code || dismissedRooms.has(room.code)) return;
        get().applyState(data);
      } catch (error: any) {
        if (error?.status === 404 || error?.status === 403) {
          teardownRoom();
          toast("This Song Hub has ended.", "default");
          void get().loadLobby();
        }
      } finally {
        refreshing = false;
      }
    },

    applyState: (data, options = {}) => {
      if (dismissedRooms.has(data.room.code)) return;
      const previous = get();
      const roomCode = data.room.code;
      const meId = data.me
        ? data.members.find((member) => member.id === data.me?.membership_id)?.user.id ?? null
        : null;
      if (meId !== null) setMyUserId(roomCode, meId);
      songHubGate.active = true;
      songHubGate.isHost = data.me?.role === "host";
      songHubGate.roomCode = roomCode;
      songHubGate.roomName = data.room.name;

      let room = data.room;
      if (
        data.me?.role === "host" &&
        !options.fromHost &&
        Date.now() < optimisticUntil &&
        previous.room
      ) {
        room = {
          ...room,
          current_track: previous.room.current_track,
          is_playing: previous.room.is_playing,
          position_seconds: previous.room.position_seconds,
          position_updated_at: previous.room.position_updated_at,
        };
      }

      const remoteIds = new Set(
        data.members
          .filter((member) => member.user.id !== meId)
          .map((member) => member.user.id as number),
      );
      Array.from(peers.keys()).forEach((peerId) => {
        if (!remoteIds.has(peerId)) closePeer(peerId);
      });
      data.members.forEach((member) => {
        const id = member.user.id;
        if (!id || id === meId) return;
        const audio = remoteAudio.get(id);
        if (audio) audio.muted = !member.mic_on;
        if (member.mic_on && get().micOn && meId !== null && meId < id && !peers.has(id)) {
          void createOffer(id);
        }
      });

      set({
        room,
        members: data.members,
        me: data.me,
        requests: data.requests,
        messages: data.messages,
        reactions: data.reactions,
      });

      if (room.current_track) {
        const player = usePlayerStore.getState();
        const current = player.queue[player.index];
        const base = new Date(room.position_updated_at || data.server_time).getTime();
        const serverNow = new Date(data.server_time).getTime();
        const elapsed = room.is_playing ? Math.max(0, (serverNow - base) / 1000) : 0;
        const position = Math.min(
          room.current_track.duration || 0,
          Math.max(0, room.position_seconds + elapsed),
        );
        const drift = Math.abs(player.progress - position);
        if (
          !current ||
          current.id !== room.current_track.id ||
          player.isPlaying !== room.is_playing ||
          (room.is_playing && drift > 2.5)
        ) {
          player.syncFromRoom(room.current_track, room.is_playing, position);
        }
      }
    },

    leaveRoom: async () => {
      const room = get().room;
      // Tear down immediately so the UI can leave the room without waiting on
      // a slow HTTP request. The backend call and lobby refresh follow.
      teardownRoom();
      if (!room) {
        await get().loadLobby();
        return;
      }
      // A stale lobby response (or a failed leave request) must never bounce
      // the user straight back into the room they intentionally left.
      dismissedRooms.add(room.code);
      leavingCode = room.code;
      try {
        const result = await api.leaveSongHub(room.code);
        if (result.promoted) {
          toast(`${result.promoted.name} is now the host.`, "default");
        }
      } catch {
        // Local teardown still restores normal playback controls.
      } finally {
        leavingCode = null;
        await get().loadLobby();
      }
    },

    reset: () => {
      teardownRoom();
      dismissedRooms.clear();
      leavingCode = null;
      hydratePromise = null;
      set({
        lobbyRooms: [],
        invitations: [],
        room: null,
        members: [],
        me: null,
        requests: [],
        messages: [],
        reactions: [],
        loading: false,
        lobbyLoading: false,
        joining: false,
        hydrating: false,
        error: null,
        pendingRequestTrack: null,
        requestSending: false,
        micOn: false,
        voiceStatus: "idle",
        voiceError: null,
        remoteAudioBlocked: false,
        speaking: {},
      });
    },

    requestTrackSelection: (track) => {
      const room = get().room;
      if (!room) return;
      if (room.current_track?.id === track.id) {
        toast("That song is already playing in the room.", "default");
        return;
      }
      if (get().me?.role === "host") return;
      set({ pendingRequestTrack: track });
    },

    confirmRequest: async () => {
      const track = get().pendingRequestTrack;
      const room = get().room;
      if (!track || !room) return;
      set({ requestSending: true });
      try {
        const row = await api.songHubRequest(room.code, track);
        set((state) => ({
          requests: [row, ...state.requests.filter((item) => item.id !== row.id)],
          pendingRequestTrack: null,
        }));
        toast(`Request sent: ${track.title}`, "success");
      } catch (error: any) {
        toast(error?.message || "Could not send your request.", "error");
      } finally {
        set({ requestSending: false });
      }
    },

    cancelRequest: () => set({ pendingRequestTrack: null }),

    sendMessage: async (body) => {
      const room = get().room;
      if (!room || !body.trim()) return;
      try {
        const row = await api.sendSongHubMessage(room.code, { kind: "text", body: body.trim() });
        set((state) => ({
          messages: state.messages.some((item) => item.id === row.id)
            ? state.messages
            : [...state.messages, row],
        }));
      } catch (error: any) {
        toast(error?.message || "Message could not be sent.", "error");
      }
    },

    sendSticker: async (sticker) => {
      const room = get().room;
      if (!room) return;
      try {
        const row = await api.sendSongHubMessage(room.code, { kind: "sticker", sticker });
        set((state) => ({
          messages: state.messages.some((item) => item.id === row.id)
            ? state.messages
            : [...state.messages, row],
        }));
      } catch (error: any) {
        toast(error?.message || "Sticker could not be sent.", "error");
      }
    },

    react: async (emoji) => {
      const room = get().room;
      if (!room) return;
      try {
        const row = await api.sendSongHubReaction(room.code, emoji);
        set((state) => ({
          reactions: state.reactions.some((item) => item.id === row.id)
            ? state.reactions
            : [...state.reactions.slice(-59), row],
        }));
      } catch (error: any) {
        toast(error?.message || "Could not send that reaction.", "error");
      }
    },

    resolveRequest: async (requestId, action) => {
      const room = get().room;
      if (!room) return;
      try {
        const data = await api.resolveSongHubRequest(room.code, requestId, action);
        optimisticUntil = 0;
        get().applyState(data, { fromHost: true });
        toast(action === "accept" ? "Request added to the room" : "Request declined", "success");
      } catch (error: any) {
        toast(error?.message || "Could not answer the request.", "error");
      }
    },

    transferHost: async (userId) => {
      const room = get().room;
      if (!room) return;
      try {
        const data = await api.transferSongHubHost(room.code, userId);
        get().applyState(data);
        toast("Host ownership transferred.", "success");
      } catch (error: any) {
        toast(error?.message || "Could not transfer host.", "error");
      }
    },

    updateSettings: async (payload) => {
      const room = get().room;
      if (!room) return;
      try {
        const data = await api.updateSongHubSettings(room.code, payload);
        get().applyState(data);
        toast("Room settings updated.", "success");
      } catch (error: any) {
        toast(error?.message || "Could not update room settings.", "error");
        throw error;
      }
    },

    inviteFriend: async (userId) => {
      const room = get().room;
      if (!room) return false;
      try {
        await api.inviteToSongHub(room.code, userId);
        toast("Invite sent.", "success");
        return true;
      } catch (error: any) {
        toast(error?.message || "Could not send the invite.", "error");
        return false;
      }
    },

    toggleMic: async () => {
      const room = get().room;
      if (!room) return;
      if (get().micOn) {
        stopLocalMic();
        set({ micOn: false, voiceStatus: "idle", voiceError: null });
        void api.setSongHubMic(room.code, false).catch(() => undefined);
        return;
      }
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        set({
          voiceStatus: "unsupported",
          voiceError: "This browser does not expose a microphone.",
        });
        return;
      }
      set({ voiceStatus: "requesting", voiceError: null });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
          },
          video: false,
        });
        localStream = stream;
        const meId = currentUserIds.get(room.code);
        if (meId !== undefined) attachAnalyser(meId, stream);
        set({ micOn: true, voiceStatus: "live" });
        void api.setSongHubMic(room.code, true).catch(() => undefined);
        await replaceLocalTracks();
        const state = get();
        state.members.forEach((member) => {
          const id = member.user.id;
          if (!id || id === meId || !member.mic_on) return;
          if (meId !== undefined && meId < id && !peers.has(id)) void createOffer(id);
        });
        const context = ensureAudioContext();
        if (context?.state === "suspended") void context.resume();
      } catch (error: any) {
        set({
          voiceStatus: "denied",
          voiceError:
            error?.name === "NotAllowedError"
              ? "Microphone access was blocked. Allow it in your browser settings."
              : "Could not start your microphone.",
        });
      }
    },

    setVoiceVolume: (volume) => {
      const clamped = Math.min(1, Math.max(0, volume));
      voiceVolume = clamped;
      localStorage.setItem(VOICE_VOLUME_KEY, String(clamped));
      remoteAudio.forEach((audio) => {
        audio.volume = clamped;
      });
      set({ voiceVolume: clamped });
    },

    enableRoomAudio: () => {
      const context = ensureAudioContext();
      if (context?.state === "suspended") void context.resume();
      let blocked = false;
      remoteAudio.forEach((audio) => {
        audio.muted = false;
        audio.play().catch(() => {
          blocked = true;
        });
      });
      set({ remoteAudioBlocked: blocked });
    },

    roomLink: (code) => {
      const target = code || get().room?.code || "";
      return `${window.location.origin}/song-hub/${target}`;
    },
  };
});

// Keep the room's voice volume consistent if the store is re-created by HMR.
useSongHubStore.setState({ voiceVolume });
