import { create } from "zustand";
import { api, clearTokens, getAccessToken, setTokens } from "@/lib/api";
import type { User } from "@/lib/types";

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
      set({ user: data.user, status: "authenticated" });
    } catch (error: any) {
      set({ status: "guest", error: error?.message || "Could not create your account." });
      throw error;
    }
  },

  logout: () => {
    if (get().user?.is_staff) void api.adminLogout().catch(() => undefined);
    clearTokens();
    set({ user: null, status: "guest", error: null });
  },

  bootstrap: async () => {
    if (!getAccessToken()) {
      set({ status: "guest", user: null });
      return;
    }
    set({ status: "loading" });
    try {
      const user = await api.me();
      set({ user, status: "authenticated" });
    } catch {
      set({ user: null, status: "guest" });
    }
  },

  setUser: (user) => set({ user }),
}));
