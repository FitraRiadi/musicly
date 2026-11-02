import type {
  AdminOverview,
  AdminTrack,
  AdminTrackList,
  AdminUserList,
  Album,
  Artist,
  Genre,
  HistoryItem,
  HomeSection,
  Insights,
  LibraryPayload,
  LikeItem,
  Lyrics,
  Playlist,
  SearchResults,
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
};

export { BASE as API_BASE };
