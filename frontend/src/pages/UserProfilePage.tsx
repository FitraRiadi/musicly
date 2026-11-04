import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Check, Loader2, Search, Trophy, UserPlus, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import type { PublicProfile } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaylistCover } from "@/components/music/PlaylistCover";
import { BadgeTile } from "@/components/social/BadgeTile";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";
import { initials } from "@/lib/utils";

export function UserProfilePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);
  const [data, setData] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!username) return;
    setLoading(true);
    setError(null);
    api
      .publicProfile(username)
      .then(setData)
      .catch((err) => setError(err?.message || "Profile not found."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [username]);

  const addFriend = async () => {
    if (!data) return;
    if (!currentUser) {
      navigate("/login");
      return;
    }
    setBusy(true);
    try {
      const friendship = await api.sendFriendRequest(data.user.id);
      setData({ ...data, friendship });
      toast(
        friendship.status === "friends" ? "You are now friends" : "Friend request sent",
        "success",
      );
    } catch (err: any) {
      toast(err?.message || "Could not send the friend request.", "error");
    } finally {
      setBusy(false);
    }
  };

  const acceptFriend = async () => {
    if (!data?.friendship.request_id) return;
    setBusy(true);
    try {
      const friendship = await api.acceptFriendRequest(data.friendship.request_id);
      setData({
        ...data,
        friendship,
        stats: { ...data.stats, friends: data.stats.friends + 1 },
      });
      toast("You are now friends", "success");
    } catch (err: any) {
      toast(err?.message || "Could not accept the request.", "error");
    } finally {
      setBusy(false);
    }
  };

  const declineFriend = async () => {
    if (!data?.friendship.request_id) return;
    setBusy(true);
    try {
      const friendship = await api.declineFriendRequest(data.friendship.request_id);
      setData({ ...data, friendship });
      toast("Friend request declined", "success");
    } catch (err: any) {
      toast(err?.message || "Could not decline the request.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeFriend = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const friendship = await api.removeFriend(data.user.id);
      setData({
        ...data,
        friendship,
        stats: { ...data.stats, friends: Math.max(0, data.stats.friends - 1) },
      });
      toast("Removed from friends", "success");
    } catch (err: any) {
      toast(err?.message || "Could not remove this friend.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pt-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <Skeleton className="h-36 w-36 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-14 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
          <Users className="h-7 w-7 text-white/40" />
        </div>
        <p className="text-xl font-bold">Couldn't find this listener</p>
        <p className="max-w-sm text-sm text-white/50">{error}</p>
        <Button variant="secondary" onClick={() => navigate("/search?type=user")}>
          Browse people
        </Button>
      </div>
    );
  }

  const { user, stats, friendship } = data;

  return (
    <div className="animate-fade-up pb-12 pt-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-white/45 transition hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_at_top,rgba(30,215,96,0.12),transparent_65%)]" />

      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-ink-850 shadow-2xl">
        <ProfileBanner seed={user.username} />
        <div className="relative -mt-16 px-4 pb-5 sm:-mt-20 sm:px-6">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-end">
            <Avatar className="h-32 w-32 shadow-2xl ring-4 ring-[#0b0b0b] sm:h-40 sm:w-40">
              <AvatarImage src={user.avatar || undefined} alt={user.name} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-emerald-700 text-4xl font-black text-black">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Listener</p>
              <h1 className="mt-1 truncate text-4xl font-extrabold tracking-tight sm:text-5xl">{user.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/50">
                <span>@{user.username}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Member since {new Date(user.created_at).getFullYear()}
                </span>
                {user.friendship.status === "friends" && (
                  <Badge variant="success" className="gap-1">
                    <Check className="h-3 w-3" /> Friends
                  </Badge>
                )}
              </div>
              {user.bio && <p className="mt-3 max-w-2xl text-sm text-white/60">{user.bio}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              {data.is_self ? (
                <Button asChild variant="secondary" className="gap-2">
                  <Link to="/profile">Edit your profile</Link>
                </Button>
              ) : !currentUser ? (
                <Button onClick={() => navigate("/login")} className="gap-2">
                  <UserPlus className="h-4 w-4" /> Log in to connect
                </Button>
              ) : friendship.status === "friends" ? (
                <>
                  <Button variant="secondary" className="gap-2" disabled>
                    <Check className="h-4 w-4" /> Friends
                  </Button>
                  <Button variant="ghost" className="text-white/50" onClick={() => void removeFriend()} disabled={busy}>
                    Remove
                  </Button>
                </>
              ) : friendship.status === "pending_outgoing" ? (
                <Button variant="outline" className="gap-2" disabled>
                  <Loader2 className="h-4 w-4" /> Request sent
                </Button>
              ) : friendship.status === "pending_incoming" ? (
                <>
                  <Button className="gap-2" onClick={() => void acceptFriend()} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Accept request
                  </Button>
                  <Button variant="ghost" className="gap-1.5 text-white/50" onClick={() => void declineFriend()} disabled={busy}>
                    <X className="h-4 w-4" /> Decline
                  </Button>
                </>
              ) : (
                <Button className="gap-2" onClick={() => void addFriend()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Add friend
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Friends", value: stats.friends },
          { label: "Public playlists", value: stats.public_playlists },
          { label: "Badges", value: stats.badges },
          { label: "Tracks played", value: stats.plays },
        ].map((stat) => (
          <Card key={stat.label} className="border-white/[0.07] bg-white/[0.035]">
            <CardContent className="p-4">
              <p className="text-2xl font-extrabold leading-none">{stat.value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-white/45">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Trophy className="h-4 w-4 text-primary" /> Badges
            <Badge variant="secondary">{data.badges.length}</Badge>
          </h2>
        </div>
        {data.badges.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.badges.map((badge) => (
              <BadgeTile key={badge.slug} badge={badge} compact />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] py-10 text-center text-sm text-white/40">
            No badges collected yet.
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Public playlists</h2>
          <Badge variant="secondary">{data.playlists.length}</Badge>
        </div>
        {data.playlists.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {data.playlists.map((playlist) => (
              <Link
                key={playlist.id}
                to={`/playlist/${playlist.id}`}
                className="group flex flex-col gap-3 rounded-xl bg-white/[0.035] p-3 transition hover:bg-white/[0.09]"
              >
                <PlaylistCover playlist={playlist} className="w-full rounded-lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold group-hover:underline">{playlist.name}</p>
                  <p className="truncate text-xs text-white/50">
                    {playlist.nb_tracks ?? playlist.tracks?.length ?? 0} songs · {playlist.saves_count ?? 0} saves
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] py-10 text-center">
            <Search className="h-7 w-7 text-white/30" />
            <p className="text-sm font-medium text-white/60">No public playlists yet</p>
            <p className="text-xs text-white/35">When this listener publishes a playlist it will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
