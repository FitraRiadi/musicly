import type { Track } from "./types";

/**
 * A tiny bridge between the player store and the Song Hub store.
 *
 * The player store cannot import the Song Hub store directly without creating a
 * circular module graph, so the Song Hub registers callbacks here whenever a
 * listener enters or leaves a room. The player then knows whether playback is
 * locked (member) or should be mirrored to the room (host).
 */
export interface SongHubGate {
  active: boolean;
  isHost: boolean;
  roomCode: string;
  roomName: string;
  applyingRemote: boolean;
  onBlocked: (() => void) | null;
  onTrackRequest: ((track: Track) => void) | null;
  onHostTrackStarted: ((track: Track) => void) | null;
  onHostPlaybackChanged: ((isPlaying: boolean, position: number) => void) | null;
}

export const songHubGate: SongHubGate = {
  active: false,
  isHost: false,
  roomCode: "",
  roomName: "",
  applyingRemote: false,
  onBlocked: null,
  onTrackRequest: null,
  onHostTrackStarted: null,
  onHostPlaybackChanged: null,
};

export function resetSongHubGate() {
  songHubGate.active = false;
  songHubGate.isHost = false;
  songHubGate.roomCode = "";
  songHubGate.roomName = "";
  songHubGate.applyingRemote = false;
  songHubGate.onBlocked = null;
  songHubGate.onTrackRequest = null;
  songHubGate.onHostTrackStarted = null;
  songHubGate.onHostPlaybackChanged = null;
}
