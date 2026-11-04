import { create } from "zustand";
import { api, clearTokens, getAccessToken, setTokens } from "@/lib/api";
import type { User } from "@/lib/types";

const USER_KEY = "musicly_user";

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function cacheUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Ignore storage errors; auth still works for this session.
  }
}

interface AuthState {
  user: User | null;
  status: "idle" | "loading" | "authenticated" | "guest";
  error: string | null;
  login: (username: string, password: string) => Promise<User>;
  register: (payload: { username: string; email: string; password: string; display_name?: string }) => Promise<void>;
  logout: () => void;
  bootstrap: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",
  error: null,

  login: async (username, password) => {
    set({ status: "loading", error: null });
    try {
      const data = await api.login({ username, password });
      setTokens(data.access, data.refresh);
      cacheUser(data.user);
      set({ user: data.user, status: "authenticated" });
      return data.user;
    } catch (error: any) {
      set({ status: "guest", error: error?.message || "Could not sign in." });
      throw error;
    }
  },

  register: async (payload) => {
    set({ status: "loading", error: null });
    try {
      const data = await api.register(payload);
      setTokens(data.access, data.refresh);
      cacheUser(data.user);
      set({ user: data.user, status: "authenticated" });
    } catch (error: any) {
      set({ status: "guest", error: error?.message || "Could not create your account." });
      throw error;
    }
  },

  logout: () => {
    if (get().user?.is_staff) void api.adminLogout().catch(() => undefined);
    clearTokens();
    cacheUser(null);
    set({ user: null, status: "guest", error: null });
  },

  bootstrap: async () => {
    if (!getAccessToken()) {
      cacheUser(null);
      set({ status: "guest", user: null });
      return;
    }
    const cached = getCachedUser();
    if (!navigator.onLine) {
      set({ user: cached, status: cached ? "authenticated" : "guest" });
      return;
    }
    set({ status: cached ? "authenticated" : "loading", user: cached });
    try {
      const user = await api.me();
      cacheUser(user);
      set({ user, status: "authenticated" });
    } catch (error: any) {
      if (!navigator.onLine || error?.status === 0) {
        set({ user: cached, status: cached ? "authenticated" : "guest" });
        return;
      }
      cacheUser(null);
      set({ user: null, status: "guest" });
    }
  },

  setUser: (user) => {
    cacheUser(user);
    set({ user });
  },
}));
