import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Crown,
  Globe2,
  Headphones,
  Link2,
  Lock,
  LogOut,
  Mic,
  MicOff,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Send,
  Settings,
  SkipBack,
  SkipForward,
  Smile,
  Sparkles,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Input, Label } from "@/components/ui/input";
import { SongPickerDialog } from "@/components/songhub/SongPickerDialog";
import { InviteFriendsDialog } from "@/components/songhub/InviteFriendsDialog";
import { SONGHUB_REACTIONS, SONGHUB_STICKERS, reactionEmoji } from "@/lib/songhub";
import { cn, formatDuration, initials, timeAgo } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { useSongHubStore } from "@/store/songhub";
import { useUiStore } from "@/store/ui";
import type { SongHubMember } from "@/lib/types";

function FloatingReactions() {
  const reactions = useSongHubStore((state) => state.reactions);
  const [floating, setFloating] = useState<
    { key: number; emoji: string; left: number; bottom: number; size: number; rotate: number; drift: number }[]
  >([]);
  const seen = useRef(0);

  useEffect(() => {
    if (!reactions.length) return;
    if (seen.current === 0) {
      seen.current = reactions[reactions.length - 1].id;
      return;
    }
    const fresh = reactions.filter((row) => row.id > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].id;
    const next = fresh.map((row) => ({
      key: row.id,
      emoji: reactionEmoji(row.emoji),
      left: 7 + Math.random() * 82,
      bottom: 6 + Math.random() * 42,
      size: 24 + Math.round(Math.random() * 16),
      rotate: -18 + Math.round(Math.random() * 36),
      drift: -34 + Math.round(Math.random() * 68),
    }));
    setFloating((current) => [...current, ...next]);
    window.setTimeout(() => {
      setFloating((current) => current.filter((row) => !next.some((item) => item.key === row.key)));
    }, 2900);
  }, [reactions]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl">
      {floating.map((row) => (
        <span
          key={row.key}
          className="animate-reaction-float absolute select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
          style={{ left: `${row.left}%`, bottom: `${row.bottom}%`, marginLeft: row.drift }}
        >
          <span
            className="block leading-none"
            style={{ fontSize: `${row.size}px`, transform: `rotate(${row.rotate}deg)` }}
          >
            {row.emoji}
          </span>
        </span>
      ))}
    </div>
  );
}

export function SongHubRoomPage() {
  const { code = "" } = useParams();
  const roomCode = code.toUpperCase();
  const navigate = useNavigate();
  const room = useSongHubStore((state) => state.room);
  const members = useSongHubStore((state) => state.members);
  const me = useSongHubStore((state) => state.me);
  const requests = useSongHubStore((state) => state.requests);
  const messages = useSongHubStore((state) => state.messages);
  const micOn = useSongHubStore((state) => state.micOn);
  const voiceStatus = useSongHubStore((state) => state.voiceStatus);
  const voiceError = useSongHubStore((state) => state.voiceError);
  const voiceVolume = useSongHubStore((state) => state.voiceVolume);
  const remoteAudioBlocked = useSongHubStore((state) => state.remoteAudioBlocked);
  const speaking = useSongHubStore((state) => state.speaking);
  const joining = useSongHubStore((state) => state.joining);
  const error = useSongHubStore((state) => state.error);
  const joinRoom = useSongHubStore((state) => state.joinRoom);
  const loadLobby = useSongHubStore((state) => state.loadLobby);
  const leaveRoom = useSongHubStore((state) => state.leaveRoom);
  const sendMessage = useSongHubStore((state) => state.sendMessage);
  const sendSticker = useSongHubStore((state) => state.sendSticker);
  const react = useSongHubStore((state) => state.react);
  const resolveRequest = useSongHubStore((state) => state.resolveRequest);
  const transferHost = useSongHubStore((state) => state.transferHost);
  const updateSettings = useSongHubStore((state) => state.updateSettings);
  const toggleMic = useSongHubStore((state) => state.toggleMic);
  const setVoiceVolume = useSongHubStore((state) => state.setVoiceVolume);
  const enableRoomAudio = useSongHubStore((state) => state.enableRoomAudio);
  const requestTrackSelection = useSongHubStore((state) => state.requestTrackSelection);

  const progress = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const prev = usePlayerStore((state) => state.prev);
  const seek = usePlayerStore((state) => state.seek);

  const toast = useUiStore((state) => state.toast);
  const [password, setPassword] = useState("");
  const [needsJoin, setNeedsJoin] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<SongHubMember | null>(null);
  const [chatText, setChatText] = useState("");
  const [stickersOpen, setStickersOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsVisibility, setSettingsVisibility] = useState<"public" | "private">("public");
  const [settingsPassword, setSettingsPassword] = useState("");
  const attempted = useRef("");
  const chatEnd = useRef<HTMLDivElement | null>(null);

  const active = room?.code === roomCode;
  const isHost = me?.role === "host";
  const myUserId = members.find((member) => member.id === me?.membership_id)?.user.id;
  const track = active ? room?.current_track : null;
  const pendingRequests = requests.filter((row) => row.status === "pending");
  const recentRequests = requests.filter((row) => row.status !== "pending").slice(0, 5);

  useEffect(() => {
    if (active || attempted.current === roomCode) return;
    attempted.current = roomCode;
    setNeedsJoin(true);
    // Discover the room through the lobby before auto-joining. Public rooms
    // can be opened straight from a shared link, while private rooms without
    // an invite stay on the password form instead of flashing an error.
    void loadLobby()
      .then(() => {
        const state = useSongHubStore.getState();
        if (state.room?.code === roomCode) return;
        if (!state.lobbyRooms.some((item) => item.code === roomCode)) return;
        return joinRoom(roomCode).catch(() => setNeedsJoin(true));
      })
      .catch(() => setNeedsJoin(true));
  }, [active, joinRoom, loadLobby, roomCode]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!settingsOpen || !room) return;
    setSettingsName(room.name);
    setSettingsVisibility(room.is_private ? "private" : "public");
    setSettingsPassword("");
    // Only reset the form when the dialog opens or the room changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, room?.code]);

  if (!active || !room) {
    return (
      <div className="animate-fade-up pb-12 pt-10">
        <div className="mx-auto max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            {error?.toLowerCase().includes("private") ? <Lock className="h-6 w-6" /> : <Radio className="h-6 w-6" />}
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">Join {roomCode}</h1>
          <p className="mt-1 text-sm text-white/50">
            {needsJoin || error
              ? error || "This room needs a password before you can listen in."
              : "Connecting to the Song Hub…"}
          </p>
          {(needsJoin || error) && (
            <form
              className="mt-5 space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                try {
                  await joinRoom(roomCode, password);
                } catch (err: any) {
                  toast(err?.message || "Could not join this room.", "error");
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="room-password">Password</Label>
                <Input
                  id="room-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Room password"
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={joining} className="w-full">
                {joining ? "Joining…" : "Join room"}
              </Button>
            </form>
          )}
          <div className="mt-4 flex items-center justify-between text-xs">
            <Link to="/song-hub" className="text-white/50 hover:text-white">
              ← Back to Song Hub
            </Link>
            {room && room.code !== roomCode && (
              <button
                className="text-white/50 hover:text-white"
                onClick={async () => {
                  await leaveRoom();
                  setNeedsJoin(false);
                  attempted.current = "";
                  void joinRoom(roomCode).catch(() => setNeedsJoin(true));
                }}
              >
                Leave {room.code} and retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/song-hub/${roomCode}`);
      toast("Room link copied.", "success");
    } catch {
      toast("Could not copy the link.", "error");
    }
  };

  const submitChat = (event: React.FormEvent) => {
    event.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    setChatText("");
    void sendMessage(text);
  };

  return (
    <div className="animate-fade-up pb-14 pt-4">
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-white/[0.06] bg-ink-850/90 px-4 py-3 backdrop-blur-xl md:-mx-7 md:px-7">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Back to home">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Radio className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-extrabold">{room.name}</h1>
              <Badge variant={room.is_private ? "secondary" : "success"} className="shrink-0">
                {room.is_private ? (
                  <>
                    <Lock className="mr-1 h-3 w-3" /> Private
                  </>
                ) : (
                  <>
                    <Globe2 className="mr-1 h-3 w-3" /> Public
                  </>
                )}
              </Badge>
              {isHost && (
                <Badge variant="success" className="shrink-0">
                  <Crown className="mr-1 h-3 w-3" /> Host
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-white/45">
              Code <span className="font-mono tracking-[0.15em] text-white/70">{room.code}</span> ·{" "}
              {members.length}/{room.max_members} listening · Host {room.host.name}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => void copyLink()} className="gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Copy link</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Invite</span>
            </Button>
            {isHost && (
              <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)} aria-label="Room settings">
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-red-300 hover:text-red-200"
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Leave</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
        <div className="space-y-4">
          <section className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent p-5">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
            </div>
            <div className="relative flex flex-col gap-5 sm:flex-row">
              <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-white/[0.06] shadow-2xl">
                {track?.album.cover ? (
                  <img
                    src={track.album.cover_small || track.album.cover}
                    alt={track.album.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music2 className="h-10 w-10 text-white/20" />
                  </div>
                )}
                {isPlaying && (
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Live
                  </span>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                  {isHost ? "You control the room" : "Synced with the host"}
                </p>
                <h2 className="mt-1 truncate text-2xl font-extrabold">
                  {track?.title || "Waiting for the first song"}
                </h2>
                <p className="mt-1 truncate text-sm text-white/50">
                  {track ? `${track.artist.name} · ${track.album.title}` : "The host will pick something soon."}
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <span className="w-9 text-right text-[11px] tabular-nums text-white/40">
                    {formatDuration(progress)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(duration, track?.duration || 1)}
                    step={0.5}
                    value={Math.min(progress, duration || 1)}
                    onChange={(event) => seek(Number(event.target.value))}
                    disabled={!isHost || !track}
                    className="musicly-range w-full disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      ["--range-progress" as string]: `${
                        duration > 0 ? Math.min(100, (progress / duration) * 100) : 0
                      }%`,
                    }}
                    aria-label="Room playback position"
                  />
                  <span className="w-9 text-[11px] tabular-nums text-white/40">
                    {formatDuration(duration || track?.duration || 0)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {isHost ? (
                    <>
                      <Button size="icon" onClick={togglePlay} disabled={!track} aria-label={isPlaying ? "Pause" : "Play"}>
                        {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={prev}
                        disabled={!track}
                        aria-label="Previous track"
                      >
                        <SkipBack className="h-4 w-4 fill-current" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => next()}
                        disabled={!track}
                        aria-label="Next track"
                      >
                        <SkipForward className="h-4 w-4 fill-current" />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)} className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> Play a song
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => setPickerOpen(true)} className="gap-1.5">
                        <Send className="h-3.5 w-3.5" /> Request a song
                      </Button>
                      <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/50">
                        <Lock className="h-3 w-3" /> Listen-only
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <FloatingReactions />
            <div className="absolute -bottom-4 right-5 z-30">
              <button
                type="button"
                onClick={() => setReactionsOpen((open) => !open)}
                aria-label="Send a reaction"
                aria-expanded={reactionsOpen}
                className={cn(
                  "flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-xl backdrop-blur transition",
                  reactionsOpen
                    ? "border-primary/50 bg-primary text-black"
                    : "border-white/15 bg-ink-850/95 text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                <Smile className="h-4 w-4" />
                <span className="hidden sm:inline">React</span>
              </button>
              {reactionsOpen && (
                <div className="absolute bottom-full right-0 mb-3 flex origin-bottom-right items-center gap-1 rounded-2xl border border-white/10 bg-ink-850/95 p-1.5 shadow-2xl backdrop-blur-xl animate-scale-in xl:bottom-1/2 xl:left-full xl:right-auto xl:mb-0 xl:ml-3 xl:-translate-y-1/2 xl:origin-left">
                  {SONGHUB_REACTIONS.map((reaction) => (
                    <button
                      key={reaction.key}
                      type="button"
                      onClick={() => {
                        setReactionsOpen(false);
                        void react(reaction.key);
                      }}
                      title={`Send ${reaction.label}`}
                      aria-label={`Send ${reaction.label}`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-xl transition hover:-translate-y-0.5 hover:bg-white/10 active:scale-95"
                    >
                      {reaction.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Sparkles className="h-4 w-4 text-primary" /> Song requests
                  {pendingRequests.length > 0 && <Badge variant="secondary">{pendingRequests.length}</Badge>}
                </h2>
                <p className="mt-0.5 text-[11px] text-white/40">
                  {isHost ? "Accept a request to put it on immediately." : "The host decides what plays next."}
                </p>
              </div>
              {!isHost && (
                <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)} className="gap-1.5">
                  <Send className="h-3.5 w-3.5" /> New request
                </Button>
              )}
            </div>
            {pendingRequests.length ? (
              <div className="space-y-1.5">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-2.5"
                  >
                    <img
                      src={request.track.album.cover_small || request.track.album.cover}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{request.track.title}</p>
                      <p className="truncate text-[11px] text-white/45">
                        {request.user.name} · {request.track.artist.name} · {timeAgo(request.created_at)}
                      </p>
                    </div>
                    {isHost ? (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-8 gap-1 px-3 text-[11px]"
                          onClick={() => void resolveRequest(request.id, "accept")}
                        >
                          <Check className="h-3.5 w-3.5" /> Play
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 px-3 text-[11px]"
                          onClick={() => void resolveRequest(request.id, "decline")}
                        >
                          <X className="h-3.5 w-3.5" /> Decline
                        </Button>
                      </div>
                    ) : request.user.id === myUserId ? (
                      <Badge variant="secondary">Pending</Badge>
                    ) : (
                      <Badge variant="secondary">{request.user.name}</Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-white/35">
                No pending requests. Pick a favourite and send it to the host.
              </p>
            )}
            {recentRequests.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recentRequests.map((request) => (
                  <span
                    key={request.id}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
                      request.status === "accepted"
                        ? "bg-primary/10 text-primary/80"
                        : "bg-white/[0.05] text-white/35",
                    )}
                  >
                    {request.status === "accepted" ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                    <span className="truncate">{request.track.title}</span>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Users className="h-4 w-4 text-primary" /> In the room
                <Badge variant="secondary">{members.length}</Badge>
              </h2>
              <span className="text-[11px] text-white/35">
                {members.filter((member) => member.mic_on).length} mic on
              </span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {members.map((member) => {
                const memberId = member.user.id;
                const isSpeaking = memberId ? speaking[memberId] : false;
                return (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border p-2.5 transition",
                      isSpeaking
                        ? "border-primary/40 bg-primary/[0.08]"
                        : "border-white/[0.05] bg-black/20",
                    )}
                  >
                    <div className="relative">
                      <Avatar className={cn("h-9 w-9 ring-2", isSpeaking ? "ring-primary" : "ring-transparent")}>
                        {member.user.avatar && <AvatarImage src={member.user.avatar} alt={member.user.name} />}
                        <AvatarFallback className="bg-white/10 text-[10px] font-bold">
                          {initials(member.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-ink-850",
                          member.mic_on ? "bg-primary text-black" : "bg-white/20 text-white/60",
                        )}
                      >
                        {member.mic_on ? <Mic className="h-2.5 w-2.5" /> : <MicOff className="h-2.5 w-2.5" />}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-sm font-medium">
                        {member.user.name}
                        {member.role === "host" && <Crown className="h-3 w-3 shrink-0 text-primary" />}
                      </p>
                      <p className="truncate text-[11px] text-white/40">
                        {member.role === "host" ? "Host" : "Member"}
                        {isSpeaking ? " · singing" : member.mic_on ? " · mic live" : ""}
                      </p>
                    </div>
                    {isHost && member.role !== "host" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => setTransferTarget(member)}
                      >
                        Make host
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="flex min-h-[300px] flex-col rounded-2xl border border-white/[0.07] bg-white/[0.03]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Smile className="h-4 w-4 text-primary" /> Room chat
                </h2>
                <p className="text-[11px] text-white/40">Talk, drop stickers, sing along.</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={toggleMic}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition",
                    micOn ? "bg-primary text-black" : "bg-white/[0.07] text-white/60 hover:bg-white/10",
                  )}
                  disabled={voiceStatus === "requesting"}
                  title={micOn ? "Turn microphone off" : "Turn microphone on"}
                >
                  {micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  {voiceStatus === "requesting" ? "Connecting…" : micOn ? "Mic on" : "Mic off"}
                </button>
              </div>
            </div>

            <div className="thin-scrollbar flex-1 space-y-2 overflow-y-auto px-4 py-3" style={{ maxHeight: 420 }}>
              {messages.length === 0 && (
                <p className="py-10 text-center text-xs text-white/30">The room is quiet. Say hello!</p>
              )}
              {messages.map((message) => {
                if (message.kind === "system") {
                  return (
                    <p key={message.id} className="py-0.5 text-center text-[10px] text-white/30">
                      {message.body}
                    </p>
                  );
                }
                const mine = message.user?.id === myUserId;
                return (
                  <div key={message.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                    <Avatar className="mb-0.5 h-7 w-7 shrink-0">
                      {message.user?.avatar && <AvatarImage src={message.user.avatar} alt="" />}
                      <AvatarFallback className="bg-white/10 text-[9px] font-bold">
                        {initials(message.user?.name || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn("max-w-[80%]", mine && "text-right")}>
                      <p className="mb-0.5 text-[10px] text-white/35">
                        {mine ? "You" : message.user?.name} · {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {message.kind === "sticker" ? (
                        <span className="inline-block text-4xl leading-none">{message.sticker}</span>
                      ) : (
                        <span
                          className={cn(
                            "inline-block rounded-2xl px-3 py-2 text-sm",
                            mine ? "bg-primary text-black" : "bg-white/[0.08] text-white/90",
                          )}
                        >
                          {message.body}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEnd} />
            </div>

            <div className="border-t border-white/[0.06] p-3">
              {voiceError && <p className="mb-2 text-[11px] text-amber-300">{voiceError}</p>}
              {remoteAudioBlocked && (
                <button
                  onClick={enableRoomAudio}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-[11px] font-semibold text-primary"
                >
                  <Volume2 className="h-3.5 w-3.5" /> Tap to hear room voices
                </button>
              )}
              {micOn && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-primary/[0.08] px-2 py-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <Mic className="h-3 w-3" />
                  </span>
                  <span className="text-[10px] text-white/50">Your mic is live</span>
                  <Volume2 className="ml-auto h-3 w-3 text-white/35" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={voiceVolume}
                    onChange={(event) => setVoiceVolume(Number(event.target.value))}
                    className="musicly-range w-20"
                    style={{ ["--range-progress" as string]: `${voiceVolume * 100}%` }}
                    aria-label="Voice volume"
                  />
                </div>
              )}

              <form onSubmit={submitChat} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStickersOpen((open) => !open)}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
                    stickersOpen ? "bg-primary/20 text-primary" : "text-white/45 hover:bg-white/10 hover:text-white",
                  )}
                  aria-label="Open stickers"
                >
                  <Smile className="h-4 w-4" />
                </button>
                <Input
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  placeholder="Message the room…"
                  maxLength={500}
                  className="h-9 rounded-full bg-white/[0.06]"
                />
                <Button type="submit" size="icon-sm" disabled={!chatText.trim()} aria-label="Send message">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
              {stickersOpen && (
                <div className="mt-2 grid grid-cols-5 gap-1 rounded-xl border border-white/[0.07] bg-black/25 p-2">
                  {SONGHUB_STICKERS.map((sticker) => (
                    <button
                      key={sticker}
                      onClick={() => {
                        void sendSticker(sticker);
                        setStickersOpen(false);
                      }}
                      className="flex h-9 items-center justify-center rounded-lg text-xl transition hover:bg-white/10"
                    >
                      {sticker}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Headphones className="h-4 w-4 text-primary" /> Voice room
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">
              Turn your mic on to sing together. Everyone in the room can hear live voices through WebRTC.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant={micOn ? "default" : "secondary"}
                onClick={() => void toggleMic()}
                className="gap-1.5"
              >
                {micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                {micOn ? "Mic live" : "Join voice"}
              </Button>
              <span className="text-[11px] text-white/35">
                {voiceStatus === "live" ? "Connected" : voiceStatus === "denied" ? "Permission blocked" : "Not connected"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5 text-white/40" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={voiceVolume}
                onChange={(event) => setVoiceVolume(Number(event.target.value))}
                className="musicly-range w-full"
                style={{ ["--range-progress" as string]: `${voiceVolume * 100}%` }}
                aria-label="Room voice output volume"
              />
            </div>
          </section>
        </div>
      </div>

      <SongPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(picked) => {
          if (isHost) {
            usePlayerStore.getState().playTrack(picked, "Song Hub");
          } else {
            requestTrackSelection(picked);
          }
        }}
        title={isHost ? "Play a song in the room" : "Request a song"}
        description={
          isHost
            ? "Everyone will switch to this song together."
            : "The host will receive your request and can play it for everyone."
        }
      />

      <InviteFriendsDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave {room.name}?</DialogTitle>
            <DialogDescription>
              {isHost
                ? "You're the host. The first person who joined will become the new host."
                : "You can rejoin later with the room code or an invite link."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
              Stay
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setLeaveOpen(false);
                // Prevent the room effect from rejoining after the room state is
                // cleared but before this route navigates away.
                attempted.current = roomCode;
                void leaveRoom();
                navigate("/song-hub");
              }}
            >
              Leave room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(transferTarget)} onOpenChange={(open) => !open && setTransferTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Make {transferTarget?.user.name} the host?</DialogTitle>
            <DialogDescription>
              They will control playback for everyone. You will stay in the room as a member.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTransferTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const targetId = transferTarget?.user.id;
                if (!targetId) return;
                setTransferTarget(null);
                await transferHost(targetId);
              }}
            >
              Transfer host
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Room settings</DialogTitle>
            <DialogDescription>Change the room name, visibility or password.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await updateSettings({
                  name: settingsName,
                  visibility: settingsVisibility,
                  password: settingsPassword || undefined,
                });
                setSettingsOpen(false);
              } catch {
                // The store already surfaced the error.
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="settings-name">Room name</Label>
              <Input
                id="settings-name"
                value={settingsName}
                onChange={(event) => setSettingsName(event.target.value)}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={settingsVisibility === "public" ? "secondary" : "outline"}
                  onClick={() => setSettingsVisibility("public")}
                  className="gap-1.5"
                >
                  <Globe2 className="h-3.5 w-3.5" /> Public
                </Button>
                <Button
                  type="button"
                  variant={settingsVisibility === "private" ? "secondary" : "outline"}
                  onClick={() => setSettingsVisibility("private")}
                  className="gap-1.5"
                >
                  <Lock className="h-3.5 w-3.5" /> Private
                </Button>
              </div>
            </div>
            {settingsVisibility === "private" && (
              <div className="space-y-2">
                <Label htmlFor="settings-password">New password (optional)</Label>
                <Input
                  id="settings-password"
                  type="password"
                  value={settingsPassword}
                  onChange={(event) => setSettingsPassword(event.target.value)}
                  placeholder={room.has_password ? "Leave blank to keep the current password" : "At least 4 characters"}
                  maxLength={64}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save settings</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
