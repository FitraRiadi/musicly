import { apiUrl } from "./api";
import type { Track } from "./types";

const DB_NAME = "musicly-offline";
const DB_VERSION = 1;
const TRACKS_STORE = "tracks";
const AUDIO_STORE = "audio";

export interface OfflineTrack {
  id: string;
  track: Track;
  downloadedAt: string;
  size: number;
  mimeType: string;
}

interface AudioRecord {
  id: string;
  blob: Blob;
}

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "webm"]);

const IMPORTED_COVER = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1ed760"/>
        <stop offset="0.55" stop-color="#0f9d58"/>
        <stop offset="1" stop-color="#053b26"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <path d="M330 118v190a58 58 0 1 1-26-48V170l-104 22v154a58 58 0 1 1-26-48V154z" fill="#fff" fill-opacity=".92"/>
  </svg>`,
)}`;

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Offline downloads are not supported in this browser."));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(TRACKS_STORE)) {
          database.createObjectStore(TRACKS_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(AUDIO_STORE)) {
          database.createObjectStore(AUDIO_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open offline storage."));
      request.onblocked = () => reject(new Error("Offline storage is open in another tab. Close it and try again."));
    });
  }
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Offline storage transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline storage transaction was aborted."));
  });
}

export async function listOfflineTracks(): Promise<OfflineTrack[]> {
  const database = await openDatabase();
  const transaction = database.transaction(TRACKS_STORE, "readonly");
  const items = await requestResult(
    transaction.objectStore(TRACKS_STORE).getAll() as IDBRequest<OfflineTrack[]>,
  );
  return items.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
}

export async function getOfflineTrack(id: string): Promise<OfflineTrack | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(TRACKS_STORE, "readonly");
  return requestResult(
    transaction.objectStore(TRACKS_STORE).get(id) as IDBRequest<OfflineTrack | undefined>,
  );
}

export async function getOfflineAudio(id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(AUDIO_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(AUDIO_STORE).get(id) as IDBRequest<AudioRecord | undefined>,
  );
  return record?.blob;
}

async function saveOfflineTrack(entry: OfflineTrack, blob: Blob) {
  const database = await openDatabase();
  const transaction = database.transaction([TRACKS_STORE, AUDIO_STORE], "readwrite");
  transaction.objectStore(TRACKS_STORE).put(entry);
  transaction.objectStore(AUDIO_STORE).put({ id: entry.id, blob } satisfies AudioRecord);
  await transactionComplete(transaction);
}

export async function removeOfflineTrack(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction([TRACKS_STORE, AUDIO_STORE], "readwrite");
  transaction.objectStore(TRACKS_STORE).delete(id);
  transaction.objectStore(AUDIO_STORE).delete(id);
  await transactionComplete(transaction);
}

export async function clearOfflineTracks() {
  const database = await openDatabase();
  const transaction = database.transaction([TRACKS_STORE, AUDIO_STORE], "readwrite");
  transaction.objectStore(TRACKS_STORE).clear();
  transaction.objectStore(AUDIO_STORE).clear();
  await transactionComplete(transaction);
}

export async function getOfflineStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read artwork."));
    reader.readAsDataURL(blob);
  });
}

async function withOfflineCover(track: Track): Promise<Track> {
  const coverUrl = track.album.cover_small || track.album.cover;
  if (!coverUrl || coverUrl.startsWith("data:")) return track;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(coverUrl, { mode: "cors", signal: controller.signal });
    if (!response.ok) return track;
    const blob = await response.blob();
    if (!blob.size || blob.size > 2 * 1024 * 1024) return track;
    const dataUrl = await blobToDataUrl(blob);
    return {
      ...track,
      album: { ...track.album, cover: dataUrl, cover_small: dataUrl },
    };
  } catch {
    return track;
  } finally {
    clearTimeout(timeout);
  }
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function isSupportedAudioFile(file: File) {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.has(fileExtension(file.name));
}

function audioMimeType(file: File) {
  if (file.type) return file.type;
  switch (fileExtension(file.name)) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    case "flac":
      return "audio/flac";
    case "aac":
      return "audio/aac";
    case "webm":
      return "audio/webm";
    default:
      return "audio/mpeg";
  }
}

function parseImportedFileName(fileName: string) {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const parts = base.split(/\s+-\s+/).filter(Boolean);
  let artist = "Unknown artist";
  let title = base || "Imported audio";

  if (parts.length >= 2) {
    const first = parts[0].trim();
    if (/^\d{1,3}[.)]?$/.test(first)) {
      if (parts.length >= 3) {
        artist = parts[1].trim();
        title = parts.slice(2).join(" - ").trim();
      } else {
        title = parts.slice(1).join(" - ").trim();
      }
    } else {
      artist = first;
      title = parts.slice(1).join(" - ").trim();
    }
  }

  return { title: title || base || "Imported audio", artist: artist || "Unknown artist" };
}

function readImportedDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    let objectUrl = "";
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve(0);
      return;
    }
    const audio = document.createElement("audio");
    let settled = false;
    let timer = 0;
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
    };

    timer = window.setTimeout(() => finish(0), 10000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(0);
    audio.src = objectUrl;
  });
}

function createImportedId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `imported-${crypto.randomUUID()}`;
  }
  return `imported-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Add an audio file from the device to the offline library. */
export async function importAudioFile(file: File): Promise<OfflineTrack> {
  if (!isSupportedAudioFile(file)) {
    throw new Error(`"${file.name}" is not a supported audio file.`);
  }
  if (!file.size) {
    throw new Error(`"${file.name}" is empty.`);
  }

  const { title, artist } = parseImportedFileName(file.name);
  const duration = await readImportedDuration(file);
  const track: Track = {
    id: createImportedId(),
    source: "imported",
    title,
    title_short: title,
    duration,
    preview: "",
    has_full_audio: true,
    audio_source: "local",
    explicit: false,
    artist: { id: "imported-artist", name: artist, picture: "" },
    album: { id: "imported-album", title: "Imported", cover: IMPORTED_COVER, cover_small: IMPORTED_COVER },
  };
  const entry: OfflineTrack = {
    id: track.id,
    track,
    downloadedAt: new Date().toISOString(),
    size: file.size,
    mimeType: audioMimeType(file),
  };

  try {
    await saveOfflineTrack(entry, file);
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("Not enough browser storage for this import.");
    }
    throw error;
  }
  return entry;
}

async function readAudioResponse(
  response: Response,
  onProgress?: (progress: number | null) => void,
): Promise<Blob> {
  const total = Number(response.headers.get("Content-Length") || 0);
  const contentType = response.headers.get("Content-Type") || "audio/mp4";

  if (!response.body) {
    const blob = await response.blob();
    onProgress?.(1);
    return new Blob([blob], { type: contentType });
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(total > 0 ? Math.min(1, received / total) : null);
  }
  return new Blob(chunks, { type: contentType });
}

/** Fetch the full track and persist both metadata and audio in IndexedDB. */
export async function downloadTrackForOffline(
  track: Track,
  onProgress?: (progress: number | null) => void,
): Promise<OfflineTrack> {
  if (!track.has_full_audio || !track.stream_url) {
    throw new Error("Full audio is not available for this song.");
  }
  const downloadPath = track.stream_url.replace(/\/stream\/?$/, "/download/");
  if (!downloadPath.includes("/download/")) {
    throw new Error("Full audio is not available for this song.");
  }

  const existing = await getOfflineTrack(track.id);
  if (existing) {
    const existingAudio = await getOfflineAudio(track.id);
    if (existingAudio?.size) return existing;
    await removeOfflineTrack(track.id);
  }

  if (navigator.storage?.persist) {
    void navigator.storage.persist().catch(() => undefined);
  }

  const response = await fetch(apiUrl(downloadPath));
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}).`);
  }

  const [offlineTrack, blob] = await Promise.all([
    withOfflineCover(track),
    readAudioResponse(response, onProgress),
  ]);
  if (!blob.size) throw new Error("The downloaded file was empty.");

  const entry: OfflineTrack = {
    id: track.id,
    track: offlineTrack,
    downloadedAt: new Date().toISOString(),
    size: blob.size,
    mimeType: blob.type || "audio/mp4",
  };

  try {
    await saveOfflineTrack(entry, blob);
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("Not enough browser storage for this download.");
    }
    throw error;
  }
  return entry;
}
