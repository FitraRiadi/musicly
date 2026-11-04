import type {
  AdminOverview,
  AdminTrack,
  AdminTrackList,
  AdminUserList,
  Album,
  Artist,
  Badge,
  FriendList,
  FriendshipState,
  Genre,
  HistoryItem,
  HomeSection,
  Insights,
  LibraryPayload,
  LikeItem,
  Lyrics,
  Playlist,
  PublicProfile,
  PublicUser,
  SearchResults,
  SearchSuggestions,
  SongHubInvite,
  SongHubLobby,
  SongHubMember,
  SongHubMessage,
  SongHubReaction,
  SongHubReactionKey,
  SongHubRequest,
  SongHubSignal,
  SongHubState,
  Track,
  User,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
const ACCESS_KEY = "musicly_access";
const REFRESH_KEY = "musicly_refresh";

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access?: string, refresh?: string) {
  if (access) localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    })
      .then(async (response) => {
        if (!response.ok) {
          clearTokens();
          return false;
        }
        const data = await response.json();
        setTokens(data.access, data.refresh);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  auth?: boolean;
  retry?: boolean;
}

function extractMessage(data: any, status: number): string {
  if (!data) return `Request failed (${status}).`;
  if (typeof data === "string") return data;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return data.detail.join(" ");
  const firstKey = Object.keys(data)[0];
  if (firstKey) {
    const value = data[firstKey];
    const text = Array.isArray(value) ? value.join(" ") : String(value);
    return `${firstKey === "non_field_errors" ? "" : `${firstKey}: `}${text}`;
  }
  return `Request failed (${status}).`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, auth = true, retry = true } = options;
  const headers: Record<string, string> = {};
  if (!form && body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: form ? form : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the Musicly server. Is the backend running?", 0);
  }

  if (response.status === 401 && auth && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, { ...options, retry: false });
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(extractMessage(data, response.status), response.status, data);
  }

  return data as T;
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function apiUrl(path?: string) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export const api = {
  // Auth
  register: (payload: { username: string; email: string; password: string; display_name?: string }) =>
    request<{ user: User; access: string; refresh: string }>("/auth/register/", {
      method: "POST",
      body: payload,
      auth: false,
    }),
  login: (payload: { username: string; password: string }) =>
    request<{ user: User; access: string; refresh: string }>("/auth/login/", {
      method: "POST",
      body: payload,
      auth: false,
    }),
  adminSession: () => request<{ ok: boolean }>("/auth/admin-session/", { method: "POST" }),
  adminLogout: () => request<void>("/auth/admin-session/", { method: "DELETE" }),
  me: () => request<User>("/auth/me/"),
  updateMe: (payload: Partial<Pick<User, "display_name" | "bio">> | FormData) => {
    const isForm = payload instanceof FormData;
    return request<User>("/auth/me/", {
      method: "PATCH",
      body: isForm ? undefined : payload,
      form: isForm ? payload : undefined,
    });
  },

  // People and social
  searchUsers: (q: string, limit = 20) =>
    request<{ items: PublicUser[]; count: number; query: string }>(
      `/auth/users/${query({ q, limit })}`,
    ),
  publicProfile: (username: string) =>
    request<PublicProfile>(`/auth/users/${encodeURIComponent(username)}/`),
  friends: () => request<FriendList>("/auth/friends/"),
  sendFriendRequest: (userId: number) =>
    request<FriendshipState>("/auth/friends/requests/", {
      method: "POST",
      body: { user_id: userId },
    }),
  acceptFriendRequest: (requestId: number) =>
    request<FriendshipState>(`/auth/friends/requests/${requestId}/accept/`, {
      method: "POST",
    }),
  declineFriendRequest: (requestId: number) =>
    request<FriendshipState>(`/auth/friends/requests/${requestId}/decline/`, {
      method: "POST",
    }),
  removeFriend: (userId: number) =>
    request<FriendshipState>(`/auth/friends/${userId}/`, { method: "DELETE" }),
  badges: () => request<{ items: Badge[] }>("/auth/badges/"),
  collectBadge: (slug: string) =>
    request<Badge>(`/auth/badges/${encodeURIComponent(slug)}/collect/`, {
      method: "POST",
    }),

  // Staff dashboard
  adminOverview: () => request<AdminOverview>("/admin/overview/"),
  adminTracks: (params: {
    q?: string;
    audio?: string;
    lyrics?: string;
    ordering?: string;
    limit?: number;
    offset?: number;
  } = {}) => request<AdminTrackList>(`/admin/tracks/${query(params)}`),
  adminTrack: (id: number) => request<AdminTrack>(`/admin/tracks/${id}/`),
  adminUpdateTrack: (id: number, payload: Partial<AdminTrack> | FormData) => {
    const isForm = payload instanceof FormData;
    return request<AdminTrack>(`/admin/tracks/${id}/`, {
      method: "PATCH",
      body: isForm ? undefined : payload,
      form: isForm ? payload : undefined,
    });
  },
  adminRemoveAudio: (id: number) =>
    request<AdminTrack>(`/admin/tracks/${id}/audio/`, { method: "DELETE" }),
  adminUsers: (params: { q?: string; limit?: number; offset?: number } = {}) =>
    request<AdminUserList>(`/admin/users/${query(params)}`),

  // Catalog
  home: () => request<{ sections: HomeSection[]; greeting: string; degraded?: string }>("/home/", { auth: false }),
  search: (q: string, type = "all", limit = 20, index = 0) =>
    request<SearchResults>(`/search/${query({ q, type, limit, index })}`, { auth: false }),
  searchSuggestions: (q: string, limit = 6) =>
    request<SearchSuggestions>(`/search/suggest/${query({ q, limit })}`, { auth: false }),
  recentSearches: () => request<{ items: { id: number; query: string; created_at: string }[] }>("/recent-searches/"),
  clearRecentSearches: () => request<void>("/recent-searches/", { method: "DELETE" }),
  track: (id: string) => request<Track>(`/tracks/${id}/`, { auth: false }),
  lyrics: (id: string) => request<Lyrics>(`/tracks/${id}/lyrics/`, { auth: false }),
  album: (id: string) => request<Album>(`/albums/${id}/`, { auth: false }),
  artist: (id: string) => request<Artist>(`/artists/${id}/`, { auth: false }),
  genres: () => request<{ items: Genre[] }>("/genres/", { auth: false }),
  genre: (id: string) => request<{ id: string; name: string; artists: Artist[] }>(`/genres/${id}/`, { auth: false }),
  deezerPlaylist: (id: string) => request<Playlist>(`/playlists/${id}/`, { auth: false }),

  // Library
  library: () => request<LibraryPayload>("/library/"),
  profile: () => request<{ user: User; stats: Record<string, number> }>("/profile/"),
  insights: () => request<Insights>("/insights/"),

  // Playlists
  playlists: () => request<{ items: Playlist[] }>("/playlists/"),
  playlist: (id: string | number) => request<Playlist>(`/playlists/${id}/`),
  createPlaylist: (payload: {
    name: string;
    description?: string;
    is_public?: boolean;
    is_collaborative?: boolean;
    track_ids?: string[];
  }) => request<Playlist>("/playlists/", { method: "POST", body: payload }),
  updatePlaylist: (id: string | number, payload: Partial<Playlist> | FormData) => {
    const isForm = payload instanceof FormData;
    return request<Playlist>(`/playlists/${id}/`, {
      method: "PATCH",
      body: isForm ? undefined : payload,
      form: isForm ? payload : undefined,
    });
  },
  deletePlaylist: (id: string | number) => request<void>(`/playlists/${id}/`, { method: "DELETE" }),
  savePlaylist: (id: string | number) =>
    request<{ saved: boolean; saves_count: number }>(`/playlists/${id}/save/`, {
      method: "POST",
    }),
  unsavePlaylist: (id: string | number) =>
    request<{ saved: boolean; saves_count: number }>(`/playlists/${id}/save/`, {
      method: "DELETE",
    }),
  publicPlaylists: (params: { q?: string; limit?: number } = {}) =>
    request<{ items: Playlist[] }>(`/playlists/public/${query(params)}`, { auth: false }),
  addTracks: (id: string | number, trackIds: string[]) =>
    request<{ added: number; playlist: Playlist }>(`/playlists/${id}/tracks/`, {
      method: "POST",
      body: { track_ids: trackIds },
    }),
  removeTrack: (id: string | number, trackId: string) =>
    request<Playlist>(`/playlists/${id}/tracks/${trackId}/`, { method: "DELETE" }),
  reorderTracks: (id: string | number, entryIds: number[]) =>
    request<Playlist>(`/playlists/${id}/tracks/`, { method: "PUT", body: { entry_ids: entryIds } }),

  // Likes
  likes: () => request<{ items: LikeItem[] }>("/likes/"),
  like: (trackId: string) => request<{ liked: boolean; track: Track }>("/likes/", {
    method: "POST",
    body: { track_id: trackId },
  }),
  unlike: (trackId: string) => request<{ liked: boolean }>(`/likes/${trackId}/`, { method: "DELETE" }),

  // History
  history: (limit = 30) => request<{ items: HistoryItem[] }>(`/history/${query({ limit })}`),
  addHistory: (trackId: string, context = "") =>
    request<{ id: number }>("/history/", { method: "POST", body: { track_id: trackId, context }, auth: true }),
  clearHistory: () => request<void>("/history/", { method: "DELETE" }),

  // Artists
  follows: () => request<{ items: { artist_id: number; name: string; picture_url: string }[] }>("/follows/"),
  follow: (artistId: string, name?: string, picture?: string) =>
    request<{ following: boolean }>("/follows/", {
      method: "POST",
      body: { artist_id: artistId, name, picture },
    }),
  unfollow: (artistId: string) =>
    request<{ following: boolean }>(`/follows/${artistId}/`, { method: "DELETE" }),

  // Song Hub
  songHubRooms: () => request<SongHubLobby>("/songhub/rooms/"),
  createSongHubRoom: (payload: { name: string; visibility: "public" | "private"; password?: string }) =>
    request<SongHubState>("/songhub/rooms/", { method: "POST", body: payload }),
  songHubInvitations: () =>
    request<{ items: SongHubInvite[] }>("/songhub/invitations/"),
  declineSongHubInvitation: (id: number) =>
    request<{ declined: boolean }>(`/songhub/invitations/${id}/decline/`, { method: "POST" }),
  joinSongHub: (code: string, password?: string) =>
    request<SongHubState>(`/songhub/rooms/${encodeURIComponent(code)}/join/`, {
      method: "POST",
      body: { password: password || "" },
    }),
  songHubState: (code: string) =>
    request<SongHubState>(`/songhub/rooms/${encodeURIComponent(code)}/state/`),
  leaveSongHub: (code: string) =>
    request<{ left: boolean; room_closed: boolean; promoted: any }>(
      `/songhub/rooms/${encodeURIComponent(code)}/leave/`,
      { method: "POST" },
    ),
  transferSongHubHost: (code: string, userId: number) =>
    request<SongHubState>(`/songhub/rooms/${encodeURIComponent(code)}/host/`, {
      method: "POST",
      body: { user_id: userId },
    }),
  updateSongHubSettings: (
    code: string,
    payload: { name?: string; visibility?: "public" | "private"; password?: string },
  ) =>
    request<SongHubState>(`/songhub/rooms/${encodeURIComponent(code)}/settings/`, {
      method: "PATCH",
      body: payload,
    }),
  songHubPlayback: (
    code: string,
    payload: { track?: Track; is_playing?: boolean; position_seconds?: number },
  ) =>
    request<SongHubState>(`/songhub/rooms/${encodeURIComponent(code)}/playback/`, {
      method: "POST",
      body: payload,
    }),
  songHubRequest: (code: string, track: Track, note = "") =>
    request<SongHubRequest>(`/songhub/rooms/${encodeURIComponent(code)}/requests/`, {
      method: "POST",
      body: { track, note },
    }),
  resolveSongHubRequest: (code: string, requestId: number, action: "accept" | "decline") =>
    request<SongHubState>(
      `/songhub/rooms/${encodeURIComponent(code)}/requests/${requestId}/resolve/`,
      { method: "POST", body: { action } },
    ),
  sendSongHubMessage: (
    code: string,
    payload: { kind: "text" | "sticker"; body?: string; sticker?: string },
  ) =>
    request<SongHubMessage>(`/songhub/rooms/${encodeURIComponent(code)}/messages/`, {
      method: "POST",
      body: payload,
    }),
  sendSongHubReaction: (code: string, emoji: SongHubReactionKey) =>
    request<SongHubReaction>(`/songhub/rooms/${encodeURIComponent(code)}/reactions/`, {
      method: "POST",
      body: { emoji },
    }),
  setSongHubMic: (code: string, micOn: boolean) =>
    request<SongHubMember>(`/songhub/rooms/${encodeURIComponent(code)}/mic/`, {
      method: "POST",
      body: { mic_on: micOn },
    }),
  inviteToSongHub: (code: string, userId: number) =>
    request<SongHubInvite>(`/songhub/rooms/${encodeURIComponent(code)}/invite/`, {
      method: "POST",
      body: { user_id: userId },
    }),
  songHubSignals: (code: string, after = 0) =>
    request<{ items: SongHubSignal[]; last_id: number }>(
      `/songhub/rooms/${encodeURIComponent(code)}/signals/${query({ after })}`,
    ),
  sendSongHubSignal: (
    code: string,
    payload: {
      target_user_id: number;
      kind: "offer" | "answer" | "candidate";
      payload: Record<string, any>;
    },
  ) =>
    request<{ id: number }>(`/songhub/rooms/${encodeURIComponent(code)}/signals/`, {
      method: "POST",
      body: payload,
    }),
};

export { BASE as API_BASE };
