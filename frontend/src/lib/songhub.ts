import type { SongHubReactionKey } from "./types";

export const SONGHUB_REACTIONS: {
  key: SongHubReactionKey;
  emoji: string;
  label: string;
}[] = [
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "laugh", emoji: "😂", label: "Laugh" },
  { key: "party", emoji: "🎉", label: "Party" },
  { key: "drum", emoji: "🥁", label: "Drum" },
];

export const SONGHUB_STICKERS = ["🎵", "🔥", "💜", "🎉", "😎", "🥳", "👏", "🎤", "🕺", "✨"];

export function reactionEmoji(key: string) {
  return SONGHUB_REACTIONS.find((item) => item.key === key)?.emoji ?? "✨";
}
