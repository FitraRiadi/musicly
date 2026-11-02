import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/layout/MobileNav";
import { PlayerBar } from "@/components/player/PlayerBar";
import { QueuePanel } from "@/components/player/QueuePanel";
import { LyricsPanel } from "@/components/player/LyricsPanel";
import { MobileNowPlaying } from "@/components/player/MobileNowPlaying";
import { CreatePlaylistDialog } from "@/components/dialogs/CreatePlaylistDialog";
import { AddToPlaylistDialog } from "@/components/dialogs/AddToPlaylistDialog";
import { Toaster } from "@/components/ui/Toaster";
import { useAuthStore } from "@/store/auth";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { useUiStore } from "@/store/ui";

export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const user = useAuthStore((state) => state.user);
  const loadLibrary = useLibraryStore((state) => state.load);
  const resetLibrary = useLibraryStore((state) => state.reset);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const prev = usePlayerStore((state) => state.prev);
  const toggleMute = usePlayerStore((state) => state.toggleMute);
  const toggleLyrics = usePlayerStore((state) => state.toggleLyrics);
  const setLyricsOpen = usePlayerStore((state) => state.setLyricsOpen);
  const mobileOpen = useUiStore((state) => state.mobilePlayerOpen);
  const setMobilePlayerOpen = useUiStore((state) => state.setMobilePlayerOpen);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (user) void loadLibrary();
    else resetLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!mobileOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        document.getElementById("global-search")?.focus();
      } else if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowRight" && event.altKey) {
        next();
      } else if (event.key === "ArrowLeft" && event.altKey) {
        prev();
      } else if (event.key.toLowerCase() === "m") {
        toggleMute();
      } else if (event.key.toLowerCase() === "l") {
        toggleLyrics();
      } else if (event.key === "Escape") {
        setMobilePlayerOpen(false);
        setLyricsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, next, prev, toggleMute, toggleLyrics, setLyricsOpen, setMobilePlayerOpen]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black">
      <div className="flex min-h-0 flex-1 gap-2 p-0 md:p-2 md:pb-0">
        <Sidebar />
        <main
          ref={mainRef}
          className="thin-scrollbar relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-ink-850 md:rounded-xl"
        >
          <Topbar />
          <div className="relative min-h-[calc(100%-4rem)] px-4 pb-10 md:px-7">
            <Outlet />
          </div>
        </main>
      </div>
      <QueuePanel />
      <LyricsPanel />
      <PlayerBar />
      <MobileNav />
      <MobileNowPlaying />
      <CreatePlaylistDialog />
      <AddToPlaylistDialog />
      <Toaster />
    </div>
  );
}
