import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  User as UserIcon,
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
import { initials } from "@/lib/utils";

export function Topbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const resetLibrary = useLibraryStore((state) => state.reset);
  const toast = useUiStore((state) => state.toast);
  const { canInstall, promptInstall } = useInstallPrompt();

  const params = new URLSearchParams(location.search);
  const [query, setQuery] = useState(params.get("q") || "");
  const debounced = useDebouncedValue(query, 320);
  const isSearchPage = location.pathname === "/search";

  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get("q") || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.pathname]);

  useEffect(() => {
    if (!isSearchPage) return;
    const current = new URLSearchParams(location.search).get("q") || "";
    if (debounced === current) return;
    if (debounced.trim()) navigate(`/search?q=${encodeURIComponent(debounced.trim())}`, { replace: true });
    else navigate("/search", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, isSearchPage]);

  useEffect(() => {
    if (location.pathname !== "/search") setQuery("");
  }, [location.pathname]);

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

      <div className="relative flex-1 md:max-w-[420px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim()) {
              navigate(`/search?q=${encodeURIComponent(query.trim())}`);
              (event.target as HTMLInputElement).blur();
            }
          }}
          placeholder="What do you want to play?"
          aria-label="Search music"
          className="h-10 w-full rounded-full border border-white/10 bg-white/[0.08] pl-10 pr-9 text-sm text-white placeholder:text-white/45 focus:border-white/35 focus:bg-white/[0.12] focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/50 hover:text-white"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
