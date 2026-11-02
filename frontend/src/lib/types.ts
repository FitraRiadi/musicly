export interface Artist {
  id: string;
  source?: string;
  name: string;
  picture: string;
  picture_small?: string;
  fans?: number;
  albums?: number;
  radio?: boolean;
  following?: boolean;
  top_tracks?: Track[];
  related?: Artist[];
  album_list?: Album[];
}

export interface Album {
  id: string;
  source?: string;
  title: string;
  cover: string;
  cover_small?: string;
  release_date?: string;
  nb_tracks?: number;
  duration?: number;
  record_type?: string;
  artist: Pick<Artist, "id" | "name" | "picture">;
  tracks?: Track[];
}

export interface Track {
  id: string;
  deezer_id?: number;
  source?: string;
  title: string;
  title_short?: string;
  duration: number;
  preview: string;
  has_full_audio?: boolean;
  stream_url?: string;
  audio_source?: "local" | "preview" | string;
  explicit?: boolean;
  rank?: number;
  release_date?: string;
  liked?: boolean;
  artist: { id: string; name: string; picture?: string };
  album: { id: string; title: string; cover: string; cover_small?: string };
}

export interface PlaylistTrackEntry {
  entry_id?: number;
  position: number;
  added_at?: string;
  track: Track;
}

export interface Playlist {
  id: string;
  source: "local" | "deezer" | string;
  name: string;
  description: string;
  cover: string;
  is_public?: boolean;
  is_collaborative?: boolean;
  owner: { id: number; name: string; avatar: string | null };
  nb_tracks: number;
  duration?: number;
  tracks?: PlaylistTrackEntry[];
  created_at?: string;
  updated_at?: string;
}

export interface HomeSection {
  id: string;
  title: string;
  subtitle?: string;
  kind: "tracks" | "albums" | "artists" | "playlists" | "genres";
  items: any[];
}

export interface Genre {
  id: string;
  name: string;
  picture: string;
}

export interface SearchResults {
  query: string;
  kind?: string;
  tracks?: Track[];
  albums?: Album[];
  artists?: Artist[];
  playlists?: Playlist[];
  items?: Track[] | Album[] | Artist[] | Playlist[];
  total?: number;
  next?: string | null;
}

export interface SearchSuggestions {
  query: string;
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  display_name: string;
  bio: string;
  avatar: string | null;
  is_staff: boolean;
  created_at: string;
}

export interface HistoryItem {
  id: number;
  played_at: string;
  context: string;
  track: Track;
}

export interface LikeItem {
  id: number;
  created_at: string;
  track: Track;
}

export interface FollowedArtist {
  id: number;
  artist_id: number;
  name: string;
  picture_url: string;
  created_at: string;
}

export interface LibraryPayload {
  playlists: Playlist[];
  liked: { count: number; items: LikeItem[] };
  artists: FollowedArtist[];
}

export interface Insights {
  totals: {
    plays: number;
    minutes: number;
    unique_tracks: number;
    likes: number;
    playlists: number;
    following: number;
  };
  top_artists: { name: string; plays: number; minutes: number }[];
  top_tracks: { id: string; title: string; artist: string; cover: string; plays: number; album_id?: string }[];
  by_day: { date: string; plays: number }[];
  by_hour: { hour: string; plays: number }[];
}

export interface Lyrics {
  track_id: string;
  available: boolean;
  instrumental: boolean;
  plain: string;
  synced: string;
  source: string;
}

export interface AdminStats {
  tracks: number;
  with_audio: number;
  with_lyrics: number;
  users: number;
  playlists: number;
  plays: number;
  likes: number;
  audio_coverage: number;
}

export interface AdminTrack {
  id: number;
  deezer_id: number;
  title: string;
  artist_id: number | null;
  artist_name: string;
  album_id: number | null;
  album_title: string;
  cover_url: string;
  duration: number;
  explicit: boolean;
  release_date: string;
  has_audio: boolean;
  audio_url: string;
  has_lyrics: boolean;
  has_plain_lyrics: boolean;
  has_synced_lyrics: boolean;
  lyrics_instrumental: boolean;
  lyrics_plain: string;
  lyrics_synced: string;
  lyrics_source: string;
  lyrics_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  name: string;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  playlists_count: number;
  likes_count: number;
  plays_count: number;
}

export interface AdminOverview {
  stats: AdminStats;
  top_tracks: {
    id: number;
    deezer_id: number;
    title: string;
    artist_name: string;
    cover_url: string;
    plays: number;
  }[];
  recent_uploads: AdminTrack[];
  recent_users: AdminUser[];
}

export interface AdminTrackList {
  count: number;
  limit: number;
  offset: number;
  items: AdminTrack[];
}

export interface AdminUserList {
  count: number;
  limit: number;
  offset: number;
  items: AdminUser[];
}
