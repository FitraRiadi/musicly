import { apiUrl } from "./api";
import { getOfflineAudio, getOfflineTrack } from "./offline";
import type { Track } from "./types";

function triggerDownload(href: string, fileName = "") {
  const link = document.createElement("a");
  link.href = href;
  // An empty download attribute lets the server's Content-Disposition
  // filename win while still forcing a download in the browser.
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function sanitizeFileName(value: string, fallback: string) {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 120)
    .trim();
  return cleaned || fallback;
}

function extensionForMimeType(mimeType?: string) {
  const type = (mimeType || "").toLowerCase();
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("wav")) return "wav";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("opus")) return "opus";
  if (type.includes("flac")) return "flac";
  if (type.includes("aac")) return "aac";
  if (type.includes("webm")) return "webm";
  return "m4a";
}

function offlineFileName(track: Track, mimeType?: string) {
  const artist = sanitizeFileName(track.artist?.name || "", "Unknown artist");
  const title = sanitizeFileName(track.title || "", "Audio");
  return `${artist} - ${title}.${extensionForMimeType(mimeType)}`;
}

/** Start a browser download directly from the server. */
export function downloadTrack(track: Track) {
  if (!track.has_full_audio || !track.stream_url) return false;

  const downloadPath = track.stream_url.replace(/\/stream\/?$/, "/download/");
  if (!downloadPath.includes("/download/")) return false;

  triggerDownload(apiUrl(downloadPath));
  return true;
}

/**
 * Save the audio file through the browser's download manager.
 * Tracks already stored offline reuse the IndexedDB blob, so saving them
 * again works without internet and never requests the file twice.
 */
export async function saveTrackAudioFile(track: Track): Promise<"offline" | "download" | false> {
  try {
    const [blob, entry] = await Promise.all([getOfflineAudio(track.id), getOfflineTrack(track.id)]);
    if (blob?.size) {
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, offlineFileName(track, entry?.mimeType || blob.type));
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return "offline";
    }
  } catch {
    // Fall through to the server if offline storage is unavailable.
  }

  return downloadTrack(track) ? "download" : false;
}
