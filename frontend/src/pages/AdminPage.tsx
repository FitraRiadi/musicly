import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Disc3,
  ExternalLink,
  FileAudio,
  FileText,
  HardDrive,
  LayoutDashboard,
  ListMusic,
  Loader2,
  LogOut,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  Badge as TremorBadge,
  BarList,
  Card as TremorCard,
  Metric,
  ProgressBar,
  Text,
  Title as TremorTitle,
} from "@tremor/react";
import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/Toaster";
import { useDebouncedValue } from "@/hooks/useUtils";
import { api, apiUrl } from "@/lib/api";
import type { AdminOverview, AdminTrack, AdminUser } from "@/lib/types";
import { cn, formatDuration, initials, timeAgo } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";

type AdminSection = "overview" | "tracks" | "users";

const PAGE_SIZE = 25;

const sectionMeta: Record<AdminSection, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Catalog health, listening activity and recent uploads at a glance.",
  },
  tracks: {
    title: "Tracks",
    description: "Search the catalog, attach licensed full audio and edit lyrics.",
  },
  users: {
    title: "Listeners",
    description: "Everyone with a Musicly account and their listening footprint.",
  },
};

const navItems = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "tracks" as const, label: "Tracks", icon: Disc3 },
  { id: "users" as const, label: "Listeners", icon: Users },
];

const kpiToneClasses = {
  emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  sky: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  violet: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  amber: "border-amber-400/20 bg-amber-400/10 text-amber-300",
};

type KpiTone = keyof typeof kpiToneClasses;

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  badge,
  tone,
  progress,
}: {
  icon: typeof Disc3;
  label: string;
  value: string | number;
  detail: string;
  badge: string;
  tone: KpiTone;
  progress?: number;
}) {
  return (
    <TremorCard
      decoration="top"
      decorationColor={tone}
      className="!group !relative !overflow-hidden !rounded-2xl !border-white/[0.08] !bg-gradient-to-br !from-white/[0.055] !to-white/[0.015] !p-0 !shadow-none transition duration-300 hover:!border-white/[0.16]"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Text className="!text-[10px] !font-bold !uppercase !tracking-[0.18em] !text-white/35">{label}</Text>
            <Metric className="!mt-2 !truncate !text-3xl !font-extrabold !tracking-tight !text-white">
              {value}
            </Metric>
          </div>
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition group-hover:scale-105",
              kpiToneClasses[tone],
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <TremorBadge className="!rounded-md !border-0 !bg-white/[0.06] !px-2 !py-0.5 !text-[10px] !font-semibold !text-white/60 !ring-0">
            {badge}
          </TremorBadge>
          <Text className="truncate !text-[11px] !text-white/35">{detail}</Text>
        </div>

        {typeof progress === "number" ? (
          <ProgressBar
            value={Math.max(0, Math.min(100, progress))}
            color={tone}
            showAnimation
            className="mt-3"
          />
        ) : (
          <div className="mt-3 h-2 rounded-full bg-white/[0.04]" />
        )}
      </div>
    </TremorCard>
  );
}

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TremorCard
      className={cn(
        "!overflow-hidden !rounded-2xl !border-white/[0.08] !bg-white/[0.025] !p-0 !shadow-none",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <TremorTitle className="!text-sm !font-bold !text-white">{title}</TremorTitle>
        {action}
      </div>
      {children}
    </TremorCard>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/80",
      )}
    >
      {children}
    </button>
  );
}

function TrackCover({ track, className }: { track: AdminTrack; className?: string }) {
  return (
    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.06]", className)}>
      {track.cover_url ? (
        <img src={track.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Music2 className="h-5 w-5 text-white/30" />
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Music2;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.05]">
        <Icon className="h-6 w-6 text-white/30" />
      </div>
      <p className="text-sm font-semibold text-white/80">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-white/40">{description}</p>
    </div>
  );
}

export function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const resetLibrary = useLibraryStore((state) => state.reset);
  const toast = useUiStore((state) => state.toast);

  const [section, setSection] = useState<AdminSection>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [djangoLoading, setDjangoLoading] = useState(false);

  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [trackCount, setTrackCount] = useState(0);
  const [trackQuery, setTrackQuery] = useState("");
  const [audioFilter, setAudioFilter] = useState("all");
  const [lyricsFilter, setLyricsFilter] = useState("all");
  const [trackOffset, setTrackOffset] = useState(0);
  const [trackLoading, setTrackLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const debouncedTrackQuery = useDebouncedValue(trackQuery, 320);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [userQuery, setUserQuery] = useState("");
  const [userOffset, setUserOffset] = useState(0);
  const [userLoading, setUserLoading] = useState(false);
  const debouncedUserQuery = useDebouncedValue(userQuery, 320);

  const [lyricsTrack, setLyricsTrack] = useState<AdminTrack | null>(null);
  const [lyricsPlain, setLyricsPlain] = useState("");
  const [lyricsSynced, setLyricsSynced] = useState("");
  const [lyricsInstrumental, setLyricsInstrumental] = useState(false);
  const [savingLyrics, setSavingLyrics] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlaybackErrorRef = useRef("");
  const [playingTrack, setPlayingTrack] = useState<AdminTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = "Admin · Musicly";
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const loadOverview = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setOverviewLoading(true);
      try {
        setOverview(await api.adminOverview());
      } catch (error: any) {
        toast(error?.message || "Could not load the admin overview.", "error");
      } finally {
        setOverviewLoading(false);
      }
    },
    [toast],
  );

  const loadTracks = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setTrackLoading(true);
      try {
        const data = await api.adminTracks({
          q: debouncedTrackQuery,
          audio: audioFilter,
          lyrics: lyricsFilter,
          ordering: "recent",
          limit: PAGE_SIZE,
          offset: trackOffset,
        });
        setTracks(data.items);
        setTrackCount(data.count);
      } catch (error: any) {
        toast(error?.message || "Could not load tracks.", "error");
      } finally {
        setTrackLoading(false);
      }
    },
    [audioFilter, debouncedTrackQuery, lyricsFilter, toast, trackOffset],
  );

  const loadUsers = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setUserLoading(true);
      try {
        const data = await api.adminUsers({
          q: debouncedUserQuery,
          limit: PAGE_SIZE,
          offset: userOffset,
        });
        setUsers(data.items);
        setUserCount(data.count);
      } catch (error: any) {
        toast(error?.message || "Could not load listeners.", "error");
      } finally {
        setUserLoading(false);
      }
    },
    [debouncedUserQuery, toast, userOffset],
  );

  useEffect(() => {
    if (section === "overview") void loadOverview(true);
  }, [loadOverview, section]);

  useEffect(() => {
    if (section === "tracks") void loadTracks(true);
  }, [loadTracks, section]);

  useEffect(() => {
    if (section === "users") void loadUsers(true);
  }, [loadUsers, section]);

  const handleLogout = () => {
    logout();
    resetLibrary();
    navigate("/login", { replace: true });
  };

  const openDjangoAdmin = async () => {
    setDjangoLoading(true);
    try {
      await api.adminSession();
      window.location.assign("/django-admin/");
    } catch {
      toast("Could not open the Django admin session.", "error");
      setDjangoLoading(false);
    }
  };

  const reportPlaybackError = (message: string) => {
    setPlayerError(message);
    setPlayerLoading(false);
    setIsPlaying(false);
    if (lastPlaybackErrorRef.current !== message) {
      lastPlaybackErrorRef.current = message;
      toast(message, "error");
    }
  };

  const toggleTrackPlayback = async (track: AdminTrack) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingTrack?.id === track.id) {
      if (audio.paused) {
        lastPlaybackErrorRef.current = "";
        setPlayerLoading(true);
        try {
          await audio.play();
        } catch {
          reportPlaybackError("This track has no playable audio right now.");
        }
      } else {
        audio.pause();
      }
      return;
    }

    lastPlaybackErrorRef.current = "";
    setPlayingTrack(track);
    setPlayerError(null);
    setPlayerTime(0);
    setPlayerDuration(track.duration || 0);
    setPlayerLoading(true);

    const source =
      track.has_audio && track.audio_url ? track.audio_url : `/tracks/${track.id}/preview/`;
    audio.src = apiUrl(source);
    audio.currentTime = 0;

    try {
      await audio.play();
    } catch {
      reportPlaybackError("This track has no playable audio right now.");
    }
  };

  const closePlayer = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlayingTrack(null);
    setIsPlaying(false);
    setPlayerLoading(false);
    setPlayerError(null);
    setPlayerTime(0);
    setPlayerDuration(0);
  };

  const seekPlayer = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setPlayerTime(value);
  };

  const handleUpload = async (track: AdminTrack, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingId(track.id);
    try {
      const form = new FormData();
      form.append("audio_file", file);
      const updated = await api.adminUpdateTrack(track.id, form);
      setTracks((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      toast(`Full audio attached to “${track.title}”.`, "success");
      void loadOverview();
      void loadTracks();
    } catch (error: any) {
      toast(error?.message || "Could not upload the audio file.", "error");
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoveAudio = async (track: AdminTrack) => {
    if (!window.confirm(`Remove the full audio file from “${track.title}”?`)) return;
    setRemovingId(track.id);
    try {
      const updated = await api.adminRemoveAudio(track.id);
      setTracks((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      toast(`Full audio removed from “${track.title}”.`, "success");
      void loadOverview();
      void loadTracks();
    } catch (error: any) {
      toast(error?.message || "Could not remove the audio file.", "error");
    } finally {
      setRemovingId(null);
    }
  };

  const openLyrics = (track: AdminTrack) => {
    setLyricsTrack(track);
    setLyricsPlain(track.lyrics_plain);
    setLyricsSynced(track.lyrics_synced);
    setLyricsInstrumental(track.lyrics_instrumental);
  };

  const saveLyrics = async (event: FormEvent) => {
    event.preventDefault();
    if (!lyricsTrack) return;
    setSavingLyrics(true);
    try {
      const updated = await api.adminUpdateTrack(lyricsTrack.id, {
        lyrics_plain: lyricsPlain,
        lyrics_synced: lyricsSynced,
        lyrics_instrumental: lyricsInstrumental,
      });
      setTracks((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setLyricsTrack(null);
      toast(`Lyrics saved for “${lyricsTrack.title}”.`, "success");
      void loadOverview();
      void loadTracks();
    } catch (error: any) {
      toast(error?.message || "Could not save lyrics.", "error");
    } finally {
      setSavingLyrics(false);
    }
  };

  const meta = sectionMeta[section];
  const lyricsCoverage =
    overview && overview.stats.tracks > 0
      ? Math.round((overview.stats.with_lyrics / overview.stats.tracks) * 100)
      : 0;
  const playerProgress =
    playerDuration > 0 ? Math.min(100, Math.max(0, (playerTime / playerDuration) * 100)) : 0;
  const trackStart = trackCount === 0 ? 0 : trackOffset + 1;
  const trackEnd = Math.min(trackOffset + PAGE_SIZE, trackCount);
  const userStart = userCount === 0 ? 0 : userOffset + 1;
  const userEnd = Math.min(userOffset + PAGE_SIZE, userCount);

  return (
    <div className="min-h-dvh bg-[#070707] text-white">
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[268px] shrink-0 flex-col border-r border-white/[0.07] bg-black/40 px-4 py-5 lg:flex">
          <Link to="/" className="flex items-center gap-3 px-2" aria-label="Musicly home">
            <Logo />
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-primary">
              Admin
            </span>
          </Link>

          <div className="mt-8 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">
            Workspace
          </div>
          <nav className="mt-2 space-y-1">
            {navItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-white/50 hover:bg-white/[0.04] hover:text-white/85",
                  )}
                >
                  <item.icon className={cn("h-[18px] w-[18px]", active && "text-primary")} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === "tracks" && overview ? (
                    <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] text-white/45">
                      {overview.stats.tracks}
                    </span>
                  ) : null}
                  {active ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.12] via-transparent to-transparent p-4">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Studio tip</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/50">
              Upload only audio you have the rights to host. Everything else keeps streaming as a 30-second Deezer preview.
            </p>
          </div>

          <div className="mt-auto space-y-2 pt-6">
            <Link
              to="/"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.04] hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Musicly
            </Link>
            <button
              type="button"
              onClick={() => void openDjangoAdmin()}
              disabled={djangoLoading}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
            >
              {djangoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Django admin
            </button>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-black text-black">
                  {initials(user?.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user?.name || "Admin"}</p>
                  <p className="truncate text-[11px] text-white/35">{user?.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg p-2 text-white/40 transition hover:bg-white/10 hover:text-white"
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#070707]/90 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4 py-3 md:px-7 lg:px-9">
              <div className="lg:hidden">
                <Logo showWordmark={false} />
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    section === "overview"
                      ? void loadOverview(true)
                      : section === "tracks"
                        ? void loadTracks(true)
                        : void loadUsers(true)
                  }
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button asChild variant="ghost" size="icon-sm" className="hidden sm:inline-flex" title="Open Musicly">
                  <Link to="/">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="lg:hidden"
                  onClick={handleLogout}
                  title="Log out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
                <div className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[10px] font-black text-black lg:hidden">
                  {initials(user?.name)}
                </div>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-4 pb-3 lg:hidden">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    section === item.id
                      ? "bg-white text-black"
                      : "bg-white/[0.05] text-white/50 hover:text-white/80",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </nav>
          </header>

          <main
            className={cn(
              "flex-1 px-4 py-5 md:px-7 md:py-6 lg:px-9",
              playingTrack ? "pb-28" : "pb-8",
            )}
          >
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white">{meta.title}</h2>
                <p className="mt-1 max-w-2xl text-sm text-white/40">{meta.description}</p>
              </div>
              <div className="hidden items-center gap-2 text-xs text-white/35 sm:flex">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Signed in as {user?.name || "admin"}
              </div>
            </div>

            {section === "overview" ? (
              overviewLoading && !overview ? (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="h-[154px] animate-pulse rounded-2xl bg-white/[0.04]" />
                    ))}
                  </div>
                  <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
                    <div className="h-80 animate-pulse rounded-2xl bg-white/[0.04]" />
                    <div className="space-y-4">
                      <div className="h-44 animate-pulse rounded-2xl bg-white/[0.04]" />
                      <div className="h-44 animate-pulse rounded-2xl bg-white/[0.04]" />
                    </div>
                  </div>
                </div>
              ) : overview ? (
                <div className="animate-fade-up space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                      icon={Disc3}
                      label="Catalog size"
                      value={overview.stats.tracks}
                      detail="Cached Deezer tracks"
                      badge="Live catalog"
                      tone="emerald"
                    />
                    <KpiCard
                      icon={HardDrive}
                      label="Licensed audio"
                      value={overview.stats.with_audio}
                      detail="Full-quality local files"
                      badge={`${overview.stats.audio_coverage}% coverage`}
                      tone="sky"
                      progress={overview.stats.audio_coverage}
                    />
                    <KpiCard
                      icon={FileText}
                      label="Lyrics ready"
                      value={overview.stats.with_lyrics}
                      detail="Plain, synced or LRC"
                      badge={`${lyricsCoverage}% coverage`}
                      tone="violet"
                      progress={lyricsCoverage}
                    />
                    <KpiCard
                      icon={Users}
                      label="Listeners"
                      value={overview.stats.users}
                      detail={`${overview.stats.playlists} playlists · ${overview.stats.likes} likes`}
                      badge={`${overview.stats.plays} plays`}
                      tone="amber"
                    />
                  </div>

                  <div className="grid items-start gap-4 xl:grid-cols-[1.5fr_1fr]">
                    <Panel
                      title="Recent full-audio uploads"
                      action={
                        <button
                          type="button"
                          onClick={() => setSection("tracks")}
                          className="text-xs font-semibold text-primary hover:text-white"
                        >
                          Manage tracks
                        </button>
                      }
                    >
                      {overview.recent_uploads.length === 0 ? (
                        <EmptyState
                          icon={FileAudio}
                          title="No full audio yet"
                          description="Open Tracks, find a song you have the rights to host, and attach its audio file."
                        />
                      ) : (
                        <div className="divide-y divide-white/[0.05]">
                          {overview.recent_uploads.map((track) => (
                            <div key={track.id} className="flex items-center gap-3 px-4 py-3">
                              <TrackCover track={track} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-white">{track.title}</p>
                                <p className="truncate text-xs text-white/40">{track.artist_name || "Unknown artist"}</p>
                              </div>
                              <Badge variant="success" className="shrink-0">Full audio</Badge>
                              <span className="hidden text-xs text-white/30 sm:block">{timeAgo(track.updated_at)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>

                    <div className="space-y-4">
                      <Panel
                        title="Most played"
                        action={<span className="text-[11px] font-medium text-white/30">All time</span>}
                      >
                        {overview.top_tracks.length === 0 ? (
                          <EmptyState icon={BarChart3} title="No plays yet" description="Listening activity will appear here." />
                        ) : (
                          <div className="px-4 py-3">
                            <BarList
                              data={overview.top_tracks.map((track) => ({
                                key: String(track.id),
                                name: track.title,
                                value: track.plays,
                              }))}
                              color="emerald"
                              valueFormatter={(value: number) => `${value} plays`}
                              sortOrder="none"
                              showAnimation
                            />
                          </div>
                        )}
                      </Panel>

                      <Panel title="Newest listeners">
                        {overview.recent_users.length === 0 ? (
                          <EmptyState icon={Users} title="No listeners yet" description="New accounts will appear here." />
                        ) : (
                          <div className="divide-y divide-white/[0.05]">
                            {overview.recent_users.map((listener) => (
                              <div key={listener.id} className="flex items-center gap-3 px-4 py-2.5">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-bold text-white/70">
                                  {initials(listener.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-white">{listener.name}</p>
                                  <p className="truncate text-[11px] text-white/35">{listener.email || listener.username}</p>
                                </div>
                                {listener.is_staff ? <Badge variant="default">Staff</Badge> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </Panel>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-primary/[0.09] via-white/[0.02] to-transparent p-5 sm:flex-row sm:items-center">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-black">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">Keep the catalog healthy</p>
                      <p className="mt-0.5 text-xs text-white/40">
                        {overview.stats.with_audio} of {overview.stats.tracks} tracks have a licensed full file. The rest automatically fall back to Deezer previews.
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setSection("tracks")}>
                      <Upload className="h-4 w-4" /> Add audio
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState icon={BarChart3} title="Overview unavailable" description="Refresh to try loading the dashboard again." />
              )
            ) : null}

            {section === "tracks" ? (
              <div className="animate-fade-up">
                <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                    <Input
                      value={trackQuery}
                      onChange={(event) => {
                        setTrackQuery(event.target.value);
                        setTrackOffset(0);
                      }}
                      placeholder="Search title, artist, album or Deezer ID…"
                      className="h-10 pl-10"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">Audio</span>
                      <FilterPill active={audioFilter === "all"} onClick={() => { setAudioFilter("all"); setTrackOffset(0); }}>
                        All
                      </FilterPill>
                      <FilterPill active={audioFilter === "yes"} onClick={() => { setAudioFilter("yes"); setTrackOffset(0); }}>
                        Full file
                      </FilterPill>
                      <FilterPill active={audioFilter === "no"} onClick={() => { setAudioFilter("no"); setTrackOffset(0); }}>
                        Missing
                      </FilterPill>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30">Lyrics</span>
                      <FilterPill active={lyricsFilter === "all"} onClick={() => { setLyricsFilter("all"); setTrackOffset(0); }}>
                        All
                      </FilterPill>
                      <FilterPill active={lyricsFilter === "yes"} onClick={() => { setLyricsFilter("yes"); setTrackOffset(0); }}>
                        Ready
                      </FilterPill>
                      <FilterPill active={lyricsFilter === "no"} onClick={() => { setLyricsFilter("no"); setTrackOffset(0); }}>
                        Missing
                      </FilterPill>
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4">Track</TableHead>
                        <TableHead className="w-20">Length</TableHead>
                        <TableHead className="w-28">Audio</TableHead>
                        <TableHead className="w-36">Lyrics</TableHead>
                        <TableHead className="hidden w-28 xl:table-cell">Updated</TableHead>
                        <TableHead className="w-[210px] pr-4 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trackLoading ? (
                        Array.from({ length: 6 }).map((_, index) => (
                          <TableRow key={index}>
                            <TableCell colSpan={6}>
                              <div className="h-11 animate-pulse rounded-lg bg-white/[0.04]" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : tracks.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6}>
                            <EmptyState
                              icon={Search}
                              title="No tracks match those filters"
                              description="Try clearing the search or switching the audio and lyrics filters."
                            />
                          </TableCell>
                        </TableRow>
                      ) : (
                        tracks.map((track) => {
                          const isCurrentTrack = playingTrack?.id === track.id;
                          const isCurrentPlaying = isCurrentTrack && isPlaying;

                          return (
                          <TableRow key={track.id}>
                            <TableCell className="pl-4">
                              <div className="flex min-w-[250px] items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => void toggleTrackPlayback(track)}
                                  className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition",
                                    isCurrentPlaying
                                      ? "border-primary bg-primary text-black shadow-glow"
                                      : "border-white/15 bg-white/[0.04] text-white/70 hover:border-white/35 hover:bg-white/[0.08] hover:text-white",
                                  )}
                                  aria-label={isCurrentPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                                  aria-pressed={isCurrentPlaying}
                                  title={track.has_audio ? "Play full track" : "Play 30-second preview"}
                                >
                                  {isCurrentTrack && playerLoading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : isCurrentPlaying ? (
                                    <Pause className="h-3.5 w-3.5 fill-current" />
                                  ) : (
                                    <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                                  )}
                                </button>
                                <TrackCover track={track} />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">{track.title}</p>
                                  <p className="truncate text-xs text-white/40">
                                    {track.artist_name || "Unknown artist"}
                                    {track.album_title ? ` · ${track.album_title}` : ""}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-white/45">{formatDuration(track.duration)}</TableCell>
                            <TableCell>
                              {track.has_audio ? (
                                <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Full</Badge>
                              ) : (
                                <Badge variant="outline">Preview</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {track.has_plain_lyrics ? <Badge variant="secondary">Plain</Badge> : null}
                                {track.has_synced_lyrics ? <Badge variant="secondary">Synced</Badge> : null}
                                {track.lyrics_instrumental ? <Badge variant="secondary">Inst.</Badge> : null}
                                {!track.has_lyrics ? <span className="text-xs text-white/30">None</span> : null}
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-xs text-white/35 xl:table-cell">{timeAgo(track.updated_at)}</TableCell>
                            <TableCell className="pr-4">
                              <div className="flex items-center justify-end gap-1">
                                <label
                                  className={cn(
                                    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-2.5 text-xs font-semibold text-white/75 transition hover:border-white/35 hover:bg-white/[0.06]",
                                    uploadingId === track.id && "pointer-events-none opacity-60",
                                  )}
                                  title={track.has_audio ? "Replace full audio" : "Upload full audio"}
                                >
                                  {uploadingId === track.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="h-3.5 w-3.5" />
                                  )}
                                  <span className="hidden xl:inline">{track.has_audio ? "Replace" : "Audio"}</span>
                                  <input
                                    type="file"
                                    accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.opus"
                                    className="hidden"
                                    onChange={(event) => void handleUpload(track, event)}
                                  />
                                </label>
                                <Button variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => openLyrics(track)} title="Edit lyrics">
                                  <FileText className="h-3.5 w-3.5" />
                                  <span className="hidden xl:inline">Lyrics</span>
                                </Button>
                                {track.has_audio ? (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-red-300/70 hover:text-red-200"
                                    onClick={() => void handleRemoveAudio(track)}
                                    disabled={removingId === track.id}
                                    title="Remove full audio"
                                  >
                                    {removingId === track.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
                    <p className="text-xs text-white/35">
                      {trackCount === 0 ? "No tracks" : `Showing ${trackStart}–${trackEnd} of ${trackCount}`}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={trackOffset === 0 || trackLoading}
                        onClick={() => setTrackOffset((value) => Math.max(0, value - PAGE_SIZE))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={trackOffset + PAGE_SIZE >= trackCount || trackLoading}
                        onClick={() => setTrackOffset((value) => value + PAGE_SIZE)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {section === "users" ? (
              <div className="animate-fade-up">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                  <div className="relative max-w-xl">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                    <Input
                      value={userQuery}
                      onChange={(event) => {
                        setUserQuery(event.target.value);
                        setUserOffset(0);
                      }}
                      placeholder="Search username, name or email…"
                      className="h-10 pl-10"
                    />
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4">Listener</TableHead>
                        <TableHead className="w-28">Role</TableHead>
                        <TableHead className="w-28">Playlists</TableHead>
                        <TableHead className="w-24">Likes</TableHead>
                        <TableHead className="w-24">Plays</TableHead>
                        <TableHead className="hidden w-32 lg:table-cell">Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userLoading ? (
                        Array.from({ length: 6 }).map((_, index) => (
                          <TableRow key={index}>
                            <TableCell colSpan={6}>
                              <div className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : users.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6}>
                            <EmptyState icon={Users} title="No listeners found" description="Try a different search term." />
                          </TableCell>
                        </TableRow>
                      ) : (
                        users.map((listener) => (
                          <TableRow key={listener.id}>
                            <TableCell className="pl-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-bold text-white/70">
                                  {initials(listener.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">{listener.name}</p>
                                  <p className="truncate text-xs text-white/40">
                                    @{listener.username}
                                    {listener.email ? ` · ${listener.email}` : ""}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {listener.is_superuser ? (
                                <Badge variant="default">Superuser</Badge>
                              ) : listener.is_staff ? (
                                <Badge variant="secondary">Staff</Badge>
                              ) : (
                                <Badge variant="outline">Listener</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-white/60">{listener.playlists_count}</TableCell>
                            <TableCell className="text-sm text-white/60">{listener.likes_count}</TableCell>
                            <TableCell className="text-sm text-white/60">{listener.plays_count}</TableCell>
                            <TableCell className="hidden text-xs text-white/35 lg:table-cell">
                              {new Date(listener.date_joined).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
                    <p className="text-xs text-white/35">
                      {userCount === 0 ? "No listeners" : `Showing ${userStart}–${userEnd} of ${userCount}`}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={userOffset === 0 || userLoading}
                        onClick={() => setUserOffset((value) => Math.max(0, value - PAGE_SIZE))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={userOffset + PAGE_SIZE >= userCount || userLoading}
                        onClick={() => setUserOffset((value) => value + PAGE_SIZE)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-[11px] text-white/25">
              <span className="flex items-center gap-1.5">
                <ListMusic className="h-3.5 w-3.5" /> Musicly admin studio
              </span>
              <span>Deezer metadata · licensed local audio · on-demand lyrics</span>
            </footer>
          </main>
        </div>
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPlaying={() => {
          setPlayerLoading(false);
          setPlayerError(null);
          lastPlaybackErrorRef.current = "";
        }}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setPlayerLoading(true)}
        onCanPlay={() => setPlayerLoading(false)}
        onTimeUpdate={(event) => setPlayerTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          setPlayerDuration(Number.isFinite(duration) ? duration : 0);
          setPlayerLoading(false);
        }}
        onEnded={(event) => {
          event.currentTarget.currentTime = 0;
          setIsPlaying(false);
          setPlayerTime(0);
        }}
        onError={() => reportPlaybackError("This track has no playable audio right now.")}
      />

      {playingTrack ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.09] bg-[#0a0a0a]/95 backdrop-blur-xl lg:left-[268px]">
          <div className="h-0.5 bg-white/[0.08] sm:hidden">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${playerProgress}%` }} />
          </div>
          <div className="flex items-center gap-3 px-4 py-3 md:px-7 lg:px-9">
            <TrackCover track={playingTrack} className="h-12 w-12" />

            <div className="min-w-0 flex-1 sm:max-w-[240px]">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-white">{playingTrack.title}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                    playingTrack.has_audio
                      ? "bg-primary/15 text-primary"
                      : "bg-white/[0.08] text-white/40",
                  )}
                >
                  {playingTrack.has_audio ? "Full" : "Preview"}
                </span>
              </div>
              <p className="truncate text-xs text-white/40">
                {playingTrack.artist_name || "Unknown artist"}
              </p>
              {playerError ? (
                <p className="truncate text-[11px] text-red-300/80" title={playerError}>
                  {playerError}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void toggleTrackPlayback(playingTrack)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 active:scale-95"
              aria-label={isPlaying ? "Pause track" : "Play track"}
            >
              {playerLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              )}
            </button>

            <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
              <span className="w-9 text-right text-[10px] tabular-nums text-white/35">
                {formatDuration(playerTime)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(playerDuration || playingTrack.duration || 0, 1)}
                step={0.1}
                value={Math.min(playerTime, playerDuration || playingTrack.duration || 1)}
                onChange={(event) => seekPlayer(Number(event.target.value))}
                className="musicly-range w-full"
                style={{ ["--range-progress" as string]: `${playerProgress}%` }}
                aria-label="Seek track"
              />
              <span className="w-9 text-[10px] tabular-nums text-white/35">
                {formatDuration(playerDuration || playingTrack.duration)}
              </span>
            </div>

            <button
              type="button"
              onClick={closePlayer}
              className="ml-auto rounded-full p-2 text-white/40 transition hover:bg-white/10 hover:text-white sm:ml-0"
              aria-label="Close player"
              title="Close player"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(lyricsTrack)} onOpenChange={(open) => !open && setLyricsTrack(null)}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 pr-8">
              {lyricsTrack ? <TrackCover track={lyricsTrack} /> : null}
              <div className="min-w-0">
                <DialogTitle className="truncate text-lg">{lyricsTrack?.title || "Edit lyrics"}</DialogTitle>
                <DialogDescription className="truncate">
                  {lyricsTrack?.artist_name || "Unknown artist"} · {lyricsTrack?.album_title || "Single"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={saveLyrics} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="admin-lyrics-plain">Plain lyrics</Label>
                <Textarea
                  id="admin-lyrics-plain"
                  value={lyricsPlain}
                  onChange={(event) => setLyricsPlain(event.target.value)}
                  placeholder="One line per lyric…"
                  className="min-h-[260px] resize-y font-mono text-xs leading-relaxed"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-lyrics-synced">Synced lyrics (LRC)</Label>
                <Textarea
                  id="admin-lyrics-synced"
                  value={lyricsSynced}
                  onChange={(event) => setLyricsSynced(event.target.value)}
                  placeholder="[00:12.40] First line…"
                  className="min-h-[260px] resize-y font-mono text-xs leading-relaxed"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
              <input
                type="checkbox"
                checked={lyricsInstrumental}
                onChange={(event) => setLyricsInstrumental(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-semibold text-white">Instrumental track</span>
                <span className="block text-xs text-white/40">Show an instrumental notice instead of lyric lines.</span>
              </span>
            </label>
            <div className="flex items-center gap-2 text-[11px] text-white/30">
              <ShieldCheck className="h-3.5 w-3.5" /> Saving marks this entry as manually curated by an admin.
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setLyricsTrack(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingLyrics}>
                {savingLyrics ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save lyrics
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Toaster />
    </div>
  );
}
