import { Link, NavLink } from "react-router-dom";
import {
  BarChart3,
  Download,
  Heart,
  Home,
  Library,
  ListMusic,
  Plus,
  Radio,
  Search,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";
import { useDownloadsStore } from "@/store/downloads";
import { useLibraryStore } from "@/store/library";
import { useSongHubStore } from "@/store/songhub";
import { useUiStore } from "@/store/ui";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { cn } from "@/lib/utils";
import { PlaylistCover } from "@/components/music/PlaylistCover";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/song-hub", label: "Song Hub", icon: Radio },
  { to: "/library", label: "Your Library", icon: Library },
  { to: "/downloads", label: "Downloads", icon: Download },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
];

export function Sidebar() {
  const user = useAuthStore((state) => state.user);
  const playlists = useLibraryStore((state) => state.playlists);
  const downloadCount = useDownloadsStore((state) => state.items.length);
  const hubRoom = useSongHubStore((state) => state.room);
  const hubInvites = useSongHubStore((state) => state.invitations.length);
  const openCreatePlaylist = useUiStore((state) => state.openCreatePlaylist);
  const { canInstall, promptInstall } = useInstallPrompt();

  return (
    <aside className="hidden w-[286px] shrink-0 flex-col gap-2 md:flex xl:w-[320px]">
      <div className="rounded-2xl bg-ink-850 px-5 pb-4 pt-5">
        <Link to="/" className="inline-flex" aria-label="Musicly home">
          <Logo />
        </Link>
        <nav className="mt-7 flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-4 rounded-lg px-2 py-2.5 text-[15px] font-semibold transition-colors",
                  isActive ? "text-white" : "text-white/65 hover:text-white",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn("h-6 w-6 transition-transform group-hover:scale-105", isActive && "text-white")}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  {item.label}
                  {item.to === "/downloads" && downloadCount > 0 && (
                    <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                      {downloadCount}
                    </span>
                  )}
                  {item.to === "/song-hub" && (hubRoom || hubInvites > 0) && (
                    <span
                      className="ml-auto flex max-w-[90px] items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary"
                      title={hubRoom ? `Live in ${hubRoom.name}` : `${hubInvites} pending invite(s)`}
                    >
                      {hubRoom ? (
                        <>
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                          {hubRoom.code}
                        </>
                      ) : (
                        hubInvites
                      )}
                    </span>
                  )}
                  {item.to === "/dashboard" && !user && (
                    <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                      soon
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-ink-850">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="flex items-center gap-3 text-[15px] font-semibold text-white/70">
            <ListMusic className="h-5 w-5" />
            Your Library
          </div>
          {user && (
            <button
              onClick={() => openCreatePlaylist()}
              className="rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Create playlist"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1 px-2">
          <div className="flex flex-col gap-1 pb-4">
            <Link
              to="/liked"
              className="group flex items-center gap-3 rounded-lg p-2 transition hover:bg-white/[0.06]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-[#4a1fd6] to-[#b9a7ff]">
                <Heart className="h-5 w-5 fill-white text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Liked Songs</p>
                <p className="truncate text-xs text-white/55">Playlist</p>
              </div>
            </Link>

            <Link
              to="/downloads"
              className="group flex items-center gap-3 rounded-lg p-2 transition hover:bg-white/[0.06]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-[#1ed760] to-[#0a5634]">
                <Download className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Downloads</p>
                <p className="truncate text-xs text-white/55">
                  Playlist · {downloadCount > 0 ? `${downloadCount} songs` : "Available offline"}
                </p>
              </div>
            </Link>

            {playlists.map((playlist) => (
              <Link
                key={playlist.id}
                to={`/playlist/${playlist.id}`}
                className="group flex items-center gap-3 rounded-lg p-2 transition hover:bg-white/[0.06]"
              >
                <PlaylistCover playlist={playlist} className="h-12 w-12 rounded-lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{playlist.name}</p>
                  <p className="truncate text-xs text-white/55">
                    Playlist · {playlist.owner?.name || (user?.name ?? "You")}
                  </p>
                </div>
              </Link>
            ))}

            {!user && (
              <div className="mx-2 mt-3 rounded-xl border border-white/10 p-4">
                <p className="text-sm font-semibold">Create your first playlist</p>
                <p className="mt-1 text-xs text-white/55">It's easy, we'll help you.</p>
                <Button asChild size="sm" variant="secondary" className="mt-3">
                  <Link to="/register">Sign up free</Link>
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {canInstall && (
          <div className="m-3 rounded-xl bg-gradient-to-br from-primary/20 to-transparent p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Download className="h-4 w-4 text-primary" /> Install Musicly
            </div>
            <p className="mt-1 text-[11px] leading-snug text-white/55">
              Add the app to your device for instant access and offline playback.
            </p>
            <Button size="sm" className="mt-2 w-full" onClick={() => void promptInstall()}>
              Install app
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
