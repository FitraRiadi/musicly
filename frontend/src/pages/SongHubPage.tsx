import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Crown,
  Globe2,
  Lock,
  LogIn,
  Music2,
  Plus,
  Radio,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { useSongHubStore } from "@/store/songhub";
import { useUiStore } from "@/store/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function SongHubPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useUiStore((state) => state.toast);
  const lobbyRooms = useSongHubStore((state) => state.lobbyRooms);
  const invitations = useSongHubStore((state) => state.invitations);
  const room = useSongHubStore((state) => state.room);
  const loading = useSongHubStore((state) => state.lobbyLoading);
  const joining = useSongHubStore((state) => state.joining);
  const error = useSongHubStore((state) => state.error);
  const loadLobby = useSongHubStore((state) => state.loadLobby);
  const createRoom = useSongHubStore((state) => state.createRoom);
  const joinRoom = useSongHubStore((state) => state.joinRoom);
  const leaveRoom = useSongHubStore((state) => state.leaveRoom);

  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState(params.get("code") || "");
  const [joinPassword, setJoinPassword] = useState("");

  useEffect(() => {
    void loadLobby();
  }, [loadLobby]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const code = await createRoom(name.trim(), visibility, visibility === "private" ? password : "");
      navigate(`/song-hub/${code}`);
    } catch (err: any) {
      toast(err?.message || "Could not create the room.", "error");
    }
  };

  const join = async (code: string, pass = joinPassword) => {
    if (!code.trim()) return;
    try {
      await joinRoom(code, pass);
      navigate(`/song-hub/${code.trim().toUpperCase()}`);
    } catch (err: any) {
      toast(err?.message || "Could not join the room.", "error");
    }
  };

  const decline = async (id: number) => {
    try {
      await api.declineSongHubInvitation(id);
      await loadLobby();
    } catch {
      toast("Could not decline that invite.", "error");
    }
  };

  return (
    <div className="animate-fade-up pb-12 pt-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[340px] bg-[radial-gradient(ellipse_at_top,rgba(30,215,96,0.16),transparent_65%)]" />

      <header className="relative">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Listen together</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">Song Hub</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">
          Create a room, invite friends and listen to the same song in sync. The host controls playback;
          everyone else can request songs, chat, react and sing along with live voice.
        </p>
      </header>

      {room && (
        <section className="relative mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/15 via-white/[0.03] to-transparent p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-black">
            <Radio className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">You're already in {room.name}</p>
            <p className="text-xs text-white/50">
              {room.is_private ? "Private room" : "Public room"} · Code {room.code}
            </p>
          </div>
          <Button asChild size="sm" className="gap-1.5">
            <Link to={`/song-hub/${room.code}`}>
              Return to room <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void leaveRoom()}>
            Leave
          </Button>
        </section>
      )}

      <div className="relative mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Plus className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold">Create a room</h2>
              <p className="text-xs text-white/45">You become the host with full playback control.</p>
            </div>
          </div>
          <form onSubmit={create} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hub-name">Room name</Label>
              <Input
                id="hub-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Friday night listening party"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label>Who can join?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility("public")}
                  className={cn(
                    "flex items-start gap-2 rounded-xl border p-3 text-left transition",
                    visibility === "public"
                      ? "border-primary/40 bg-primary/10"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                  )}
                >
                  <Globe2 className="mt-0.5 h-4 w-4 text-primary" />
                  <span>
                    <span className="block text-sm font-semibold">Public</span>
                    <span className="block text-[11px] text-white/45">Anyone can join from the lobby.</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("private")}
                  className={cn(
                    "flex items-start gap-2 rounded-xl border p-3 text-left transition",
                    visibility === "private"
                      ? "border-primary/40 bg-primary/10"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]",
                  )}
                >
                  <Lock className="mt-0.5 h-4 w-4 text-primary" />
                  <span>
                    <span className="block text-sm font-semibold">Private</span>
                    <span className="block text-[11px] text-white/45">Requires a password or invite.</span>
                  </span>
                </button>
              </div>
            </div>
            {visibility === "private" && (
              <div className="space-y-2">
                <Label htmlFor="hub-password">Room password</Label>
                <Input
                  id="hub-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 4 characters"
                  maxLength={64}
                />
              </div>
            )}
            {error && <p className="text-xs text-red-300">{error}</p>}
            <Button type="submit" disabled={joining || !name.trim()} className="w-full gap-2">
              <Radio className="h-4 w-4" /> {joining ? "Opening room…" : "Open Song Hub"}
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.07] text-white/70">
              <LogIn className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold">Join with a code</h2>
              <p className="text-xs text-white/45">Got an invite link? The code is in the URL.</p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void join(joinCode);
            }}
            className="mt-5 space-y-3"
          >
            <div className="flex gap-2">
              <Input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={8}
                className="font-mono tracking-[0.18em]"
              />
              <Button type="submit" disabled={joining || !joinCode.trim()} className="shrink-0 gap-1.5">
                Join <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <Input
              id="hub-password-input"
              type="password"
              value={joinPassword}
              onChange={(event) => setJoinPassword(event.target.value)}
              placeholder="Private room password (if needed)"
            />
          </form>

          <div className="mt-5 space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/35">
              <Crown className="h-3.5 w-3.5" /> Invitations
            </p>
            {invitations.length ? (
              invitations.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.06] p-2.5"
                >
                  <Avatar className="h-9 w-9">
                    {invite.inviter.avatar && (
                      <AvatarImage src={invite.inviter.avatar} alt={invite.inviter.name} />
                    )}
                    <AvatarFallback className="bg-primary/20 text-[10px] font-bold text-primary">
                      {initials(invite.inviter.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{invite.room.name}</p>
                    <p className="truncate text-[11px] text-white/45">
                      Invited by {invite.inviter.name} · {invite.room.member_count} listening
                    </p>
                  </div>
                  <Button size="sm" onClick={() => void join(invite.room.code)} className="shrink-0">
                    Join
                  </Button>
                  <button
                    onClick={() => void decline(invite.id)}
                    className="rounded-full p-1.5 text-white/35 transition hover:bg-white/10 hover:text-white"
                    aria-label="Decline invite"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/35">
                No pending invites. Ask a friend for their room link.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="relative mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Live rooms</h2>
            <p className="text-xs text-white/45">Public rooms you can join right now.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void loadLobby()} disabled={loading}>
            Refresh
          </Button>
        </div>
        {loading && !lobbyRooms.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        ) : lobbyRooms.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lobbyRooms.map((item) => (
              <div
                key={item.code}
                className="group flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 transition hover:border-white/15 hover:bg-white/[0.05]"
              >
                <div className="flex items-start gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.06]">
                    {item.current_track?.album.cover ? (
                      <img
                        src={item.current_track.album.cover_small || item.current_track.album.cover}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music2 className="h-5 w-5 text-white/35" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold">{item.name}</p>
                      {item.is_private && <Lock className="h-3 w-3 shrink-0 text-white/40" />}
                    </div>
                    <p className="truncate text-xs text-white/45">
                      Hosted by {item.host.name} · {item.member_count}/{item.max_members}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-primary/80">
                      {item.current_track
                        ? `${item.current_track.title} — ${item.current_track.artist.name}`
                        : "Waiting for the first song"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                    <Users className="h-3.5 w-3.5" /> {item.member_count} listening
                    {item.is_private && <Badge variant="secondary" className="ml-1">Private</Badge>}
                  </div>
                  <Button
                    size="sm"
                    variant={item.is_private ? "outline" : "secondary"}
                    onClick={() => {
                      setJoinCode(item.code);
                      if (item.is_private) {
                        document.getElementById("hub-password-input")?.focus();
                        toast("This room is private. Use the password field to join.", "default");
                      } else {
                        void join(item.code, "");
                      }
                    }}
                    className="gap-1.5"
                  >
                    {item.is_private ? <Lock className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
                    Join
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 py-12 text-center">
            <Radio className="h-8 w-8 text-white/25" />
            <p className="text-sm font-semibold text-white/70">No live rooms yet</p>
            <p className="text-xs text-white/40">Be the first to open a Song Hub and invite your friends.</p>
          </div>
        )}
      </section>
    </div>
  );
}
