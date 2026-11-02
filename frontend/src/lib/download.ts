import { apiUrl } from "./api";
import type { Track } from "./types";

export function downloadTrack(track: Track) {
  if (!track.has_full_audio || !track.stream_url) return false;

  const downloadPath = track.stream_url.replace(/\/stream\/?$/, "/download/");
  if (!downloadPath.includes("/download/")) return false;

  const link = document.createElement("a");
  link.href = apiUrl(downloadPath);
  // An empty download attribute lets the server's Content-Disposition
  // filename win while still forcing a download in the browser.
  link.download = "";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}
