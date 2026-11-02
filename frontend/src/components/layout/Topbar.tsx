import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Disc3,
  Download,
  Heart,
  Loader2,
  LogOut,
  Music2,
  Search,
  Settings,
  ShieldCheck,
  User as UserIcon,
  UserRound,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/store/auth";
import { useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useDebouncedValue } from "@/hooks/useUtils";
import { api } from "@/lib/api";
import type { SearchSuggestions } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

type SuggestKind = "track" | "artist" | "album" | "playlist" | "recent" | "all";

interface SuggestItem {
  key: string;
  label: string;
  meta: string;
  image?: string;
  href: string;
  kind: SuggestKind;
  round?: boolean;
}

interface SuggestGroup {
  title: string;
  items: SuggestItem[];
}

function SuggestIcon({ kind }: { kind: SuggestKind }) {
  if (kind === "recent") return <Clock className="h-4 w-4" />;
  if (kind === "artist") return <UserRound className="h-4 w-4" />;
  if (kind === "album") return <Disc3 className="h-4 w-4" />;
  if (kind === "playlist") return <Music2 className="h-4 w-4" />;
  return <Search className="h-4 w-4" />;
}

export function Topbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const logout = useAuthStore((state) => state.logout);
  const resetLibrary = useLibraryStore((state) => state.reset);
  const toast = useUiStore((state) => state.toast);
  const { canInstall, promptInstall } = useInstallPrompt();

  const [query, setQuery] = useState(new URLSearchParams(location.search).get("q") || "");
  const [recent, setRecent] = useState<{ id: number; query: string; created_at: string }[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounced = useDebouncedValue(query, 260);
  const trimmedQuery = query.trim();

  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get("q") || "");
    setSuggestOpen(false);
    setActiveIndex(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.pathname]);

  useEffect(() => {
    if (!userId) {
      setRecent([]);
      return;
    }
    if (!suggestOpen || trimmedQuery) return;
    let alive = true;
    api
      .recentSearches()
      .then((data) => {
        if (alive) setRecent(data.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [suggestOpen, trimmedQuery, userId]);

  useEffect(() => {
    if (!suggestOpen || debounced.trim().length < 2) {
      setSuggestions(null);
      setSuggestLoading(false);
      return;
    }
    let alive = true;
    setSuggestLoading(true);
    setSuggestions(null);
    api
      .searchSuggestions(debounced.trim(), 6)
      .then((data) => {
        if (alive) setSuggestions(data);
      })
      .catch(() => {
        if (alive) setSuggestions(null);
      })
      .finally(() => {
        if (alive) setSuggestLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [debounced, suggestOpen]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query, suggestions]);

  const groups = useMemo<SuggestGroup[]>(() => {
    if (!trimmedQuery && recent.length) {
      return [
        {
          title: "Recent searches",
          items: recent.map((item) => ({
            key: `recent-${item.id}`,
            label: item.query,
            meta: "Recent search",
            href: `/search?q=${encodeURIComponent(item.query)}`,
            kind: "recent",
          })),
        },
      ];
    }
    if (!trimmedQuery) return [];

    const next: SuggestGroup[] = [];
    if (suggestions?.tracks?.length) {
      next.push({
        title: "Songs",
        items: suggestions.tracks.map((track) => ({
          key: `track-${track.id}`,
          label: track.title,
          meta: `${track.artist.name} · ${track.album.title}`,
          image: track.album.cover_small || track.album.cover,
          href: `/track/${track.id}`,
          kind: "track",
        })),
      });
    }
    if (suggestions?.artists?.length) {
      next.push({
        title: "Artists",
        items: suggestions.artists.map((artist) => ({
          key: `artist-${artist.id}`,
          label: artist.name,
          meta: "Artist",
          image: artist.picture,
          href: `/artist/${artist.id}`,
          kind: "artist",
          round: true,
        })),
      });
    }
    if (suggestions?.albums?.length) {
      next.push({
        title: "Albums",
        items: suggestions.albums.map((album) => ({
          key: `album-${album.id}`,
          label: album.title,
          meta: album.artist?.name || "Album",
          image: album.cover_small || album.cover,
          href: `/album/${album.id}`,
          kind: "album",
        })),
      });
    }
    if (suggestions?.playlists?.length) {
      next.push({
        title: "Playlists",
        items: suggestions.playlists.map((playlist) => ({
          key: `playlist-${playlist.id}`,
          label: playlist.name,
          meta: playlist.owner?.name ? `Playlist · ${playlist.owner.name}` : "Playlist",
          image: playlist.cover,
          href: `/playlist/${playlist.id}`,
          kind: "playlist",
        })),
      });
    }
    return next;
  }, [trimmedQuery, suggestions, recent]);

  const seeAllItem = useMemo<SuggestItem | null>(
    () =>
      trimmedQuery
        ? {
            key: "search-all",
            label: `See all results for “${trimmedQuery}”`,
            meta: "Search the full catalog",
            href: `/search?q=${encodeURIComponent(trimmedQuery)}`,
            kind: "all",
          }
        : null,
    [trimmedQuery],
  );
  const flatItems = useMemo(
    () => [...groups.flatMap((group) => group.items), ...(seeAllItem ? [seeAllItem] : [])],
    [groups, seeAllItem],
  );
  const hasMatches = Boolean(
    suggestions?.tracks?.length ||
      suggestions?.artists?.length ||
      suggestions?.albums?.length ||
      suggestions?.playlists?.length,
  );
  const showPanel = suggestOpen && (trimmedQuery.length >= 2 || (!trimmedQuery && recent.length > 0));

  const selectItem = (item: SuggestItem) => {
    setSuggestOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    navigate(item.href);
  };

  const runSearch = () => {
    if (!trimmedQuery) return;
    setSuggestOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSuggestOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      if (!showPanel) {
        setSuggestOpen(true);
        return;
      }
      event.preventDefault();
      if (!flatItems.length) return;
      setActiveIndex((index) => (index + 1 >= flatItems.length ? 0 : index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      if (!showPanel) return;
      event.preventDefault();
      if (!flatItems.length) return;
      setActiveIndex((index) => (index <= 0 ? flatItems.length - 1 : index - 1));
      return;
    }
    if (event.key === "Enter") {
      if (activeIndex >= 0 && flatItems[activeIndex]) {
        event.preventDefault();
        selectItem(flatItems[activeIndex]);
        return;
      }
      event.preventDefault();
      runSearch();
    }
  };

  const handleLogout = () => {
    logout();
    resetLibrary();
    toast("You're signed out. See you soon!", "success");
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-gradient-to-b from-ink-850/95 via-ink-850/80 to-transparent px-4 backdrop-blur-xl md:h-[72px] md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <Link to="/" aria-label="Musicly home">
          <Logo showWordmark={false} />
        </Link>
      </div>

      <div className="hidden items-center gap-2 md:flex">
        <button
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/80 transition hover:bg-black/80 hover:text-white"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => navigate(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/80 transition hover:bg-black/80 hover:text-white"
          aria-label="Go forward"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div ref={wrapperRef} className="relative flex-1 md:max-w-[440px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
        <input
          ref={inputRef}
          id="global-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSuggestOpen(true);
          }}
          onFocus={() => {
            setSuggestOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={onSearchKeyDown}
          placeholder="Search songs, artists, albums"
          aria-label="Search music"
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full rounded-full border border-white/10 bg-white/[0.08] pl-10 pr-14 text-sm text-white placeholder:text-white/45 focus:border-white/35 focus:bg-white/[0.12] focus:outline-none"
        />
        {query ? (
          <button
            onClick={() => {
              setQuery("");
              setSuggestions(null);
              setSuggestOpen(true);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/50 hover:text-white"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/35 sm:block">
            /
          </kbd>
        )}

        {showPanel && (
          <div className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-white/10 bg-[#171717] shadow-2xl shadow-black/60">
            <div className="thin-scrollbar max-h-[min(68vh,460px)] overflow-y-auto p-1.5">
              {suggestLoading ? (
                <div className="space-y-1 p-1">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3 rounded-lg p-2">
                      <div className="h-10 w-10 animate-pulse rounded bg-white/10" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                        <div className="h-2.5 w-1/3 animate-pulse rounded bg-white/[0.07]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {trimmedQuery.length >= 2 && !hasMatches && (
                    <div className="px-3 py-3 text-xs text-white/45">
                      No quick matches. Press Enter to search the full catalog.
                    </div>
                  )}
                  {groups.map((group, groupIndex) => (
                    <div key={`${group.title}-${groupIndex}`}>
                      {group.title && (
                        <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                          {group.title}
                        </p>
                      )}
                      {group.items.map((item) => {
                        const index = flatItems.indexOf(item);
                        return (
                          <button
                            key={item.key}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => selectItem(item)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg p-2 text-left transition",
                              index === activeIndex ? "bg-white/[0.11]" : "hover:bg-white/[0.06]",
                            )}
                          >
                            {item.image ? (
                              <img
                                src={item.image}
                                alt=""
                                loading="lazy"
                                className={cn("h-10 w-10 shrink-0 object-cover", item.round ? "rounded-full" : "rounded")}
                              />
                            ) : (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white/[0.07] text-white/45">
                                {item.kind === "recent" ? (
                                  <Clock className="h-4 w-4" />
                                ) : item.kind === "all" ? (
                                  <Search className="h-4 w-4" />
                                ) : (
                                  <SuggestIcon kind={item.kind} />
                                )}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-white/90">{item.label}</span>
                              <span className="block truncate text-xs text-white/45">{item.meta}</span>
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/25" />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>
            {seeAllItem && (
              <button
                onMouseEnter={() => setActiveIndex(flatItems.length - 1)}
                onClick={() => selectItem(seeAllItem)}
                className={cn(
                  "flex w-full items-center gap-3 border-t border-white/[0.07] px-3 py-2.5 text-left transition",
                  activeIndex === flatItems.length - 1 ? "bg-white/[0.11]" : "hover:bg-white/[0.06]",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/[0.07] text-white/45">
                  <Search className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white/90">{seeAllItem.label}</span>
                  <span className="block text-xs text-white/45">{seeAllItem.meta}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/25" />
              </button>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-3 py-2 text-[10px] text-white/30">
              <span className="flex items-center gap-1.5">
                <span className="rounded border border-white/10 px-1 py-0.5">↑</span>
                <span className="rounded border border-white/10 px-1 py-0.5">↓</span>
                navigate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="rounded border border-white/10 px-1.5 py-0.5">Enter</span> select
              </span>
              <span className="flex items-center gap-1.5">
                {suggestLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="rounded border border-white/10 px-1.5 py-0.5">Esc</span>}
                close
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {user?.is_staff && (
          <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex" title="Admin dashboard">
            <Link to="/admin">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex" title="Dashboard">
          <Link to="/dashboard">
            <BarChart3 className="h-5 w-5" />
          </Link>
        </Button>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-full bg-black/50 p-1 pr-2 transition hover:bg-black/70"
                aria-label="Account menu"
              >
                <Avatar className="h-7 w-7">
                  {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                  <AvatarFallback className="bg-primary text-[11px] font-black text-black">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[120px] truncate text-sm font-semibold text-white/85 sm:block">
                  {user.name}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="normal-case tracking-normal text-white/90">
                <span className="block truncate text-sm">{user.name}</span>
                <span className="block truncate text-xs font-normal text-white/45">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user.is_staff && (
                <DropdownMenuItem onClick={() => navigate("/admin")}>
                  <ShieldCheck className="h-4 w-4 text-primary" /> Admin dashboard
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <UserIcon className="h-4 w-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                <BarChart3 className="h-4 w-4" /> Listening dashboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/liked")}>
                <Heart className="h-4 w-4" /> Liked songs
              </DropdownMenuItem>
              {canInstall && (
                <DropdownMenuItem onClick={() => void promptInstall()}>
                  <Download className="h-4 w-4" /> Install app
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <Settings className="h-4 w-4" /> Account settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-red-300 focus:text-red-200">
                <LogOut className="h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/register">Sign up free</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
