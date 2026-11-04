import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Camera,
  Check,
  Download,
  Heart,
  ImagePlus,
  ListMusic,
  Loader2,
  LogOut,
  Music2,
  Search,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Badge as BadgeModel, FriendList, User } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserCard } from "@/components/social/UserCard";
import { BadgeTile } from "@/components/social/BadgeTile";
import { AvatarCropDialog } from "@/components/profile/AvatarCropDialog";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { useAuthStore } from "@/store/auth";
import { useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { initials, timeAgo } from "@/lib/utils";

export function ProfilePage() {
  const currentUser = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const resetLibrary = useLibraryStore((state) => state.reset);
  const toast = useUiStore((state) => state.toast);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);
  const { canInstall, promptInstall } = useInstallPrompt();

  const [profile, setProfile] = useState<User | null>(currentUser);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [displayName, setDisplayName] = useState(currentUser?.display_name || "");
  const [bio, setBio] = useState(currentUser?.bio || "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const textRef = useRef({ display_name: currentUser?.display_name || "", bio: currentUser?.bio || "" });
  const textDirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const mutationRef = useRef(0);
  const [friendsData, setFriendsData] = useState<FriendList | null>(null);
  const [badges, setBadges] = useState<BadgeModel[]>([]);
  const [collecting, setCollecting] = useState<string | null>(null);
  const [badgesLoading, setBadgesLoading] = useState(true);

  const loadSocial = () => {
    // Load badges independently from friends. A slow social request must not
    // keep the badge catalogue in its skeleton state.
    setBadgesLoading(true);
    api
      .badges()
      .then((data) => setBadges(data.items))
      .catch(() => undefined)
      .finally(() => setBadgesLoading(false));
    api
      .friends()
      .then((data) => setFriendsData(data))
      .catch(() => undefined);
  };

  const applyTextUpdate = (updated: User) => {
    mutationRef.current += 1;
    setProfile((current) =>
      current
        ? { ...current, display_name: updated.display_name, bio: updated.bio, name: updated.name }
        : updated,
    );
    const stateUser = useAuthStore.getState().user;
    if (stateUser) {
      setUser({ ...stateUser, display_name: updated.display_name, bio: updated.bio, name: updated.name });
    } else {
      setUser(updated);
    }
  };

  const persistText = async () => {
    if (!textDirtyRef.current) return;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    const payload = { ...textRef.current };
    saveInFlightRef.current = true;
    setSaveState("saving");
    try {
      const updated = await api.updateMe(payload);
      const saved = { display_name: updated.display_name || "", bio: updated.bio || "" };
      applyTextUpdate(updated);
      const current = textRef.current;
      const changedDuringRequest =
        current.display_name !== payload.display_name || current.bio !== payload.bio;
      if (!changedDuringRequest) {
        textRef.current = saved;
        setDisplayName(saved.display_name);
        setBio(saved.bio);
        textDirtyRef.current = false;
        setSaveState("saved");
      } else {
        saveQueuedRef.current = true;
      }
    } catch (error: any) {
      setSaveState("error");
      toast(error?.message || "Could not save your profile.", "error");
    } finally {
      saveInFlightRef.current = false;
      if (saveQueuedRef.current) {
        saveQueuedRef.current = false;
        void persistText();
      }
    }
  };

  const flushTextSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (textDirtyRef.current) void persistText();
  };

  const updateField = (field: "display_name" | "bio", value: string) => {
    textRef.current = { ...textRef.current, [field]: value };
    if (field === "display_name") setDisplayName(value);
    else setBio(value);
    textDirtyRef.current = true;
    mutationRef.current += 1;
    setSaveState("saving");
  };

  const applyMediaUpdate = (updated: User, field: "avatar" | "banner") => {
    mutationRef.current += 1;
    const patch = field === "avatar" ? { avatar: updated.avatar } : { banner: updated.banner };
    setProfile((current) => (current ? { ...current, ...patch } : updated));
    const stateUser = useAuthStore.getState().user;
    if (stateUser) setUser({ ...stateUser, ...patch });
    else setUser(updated);
  };

  useEffect(() => {
    const loadVersion = mutationRef.current;
    api
      .profile()
      .then((data) => {
        setStats(data.stats);
        if (mutationRef.current !== loadVersion) return;
        setProfile(data.user);
        if (!textDirtyRef.current) {
          const text = {
            display_name: data.user.display_name || "",
            bio: data.user.bio || "",
          };
          textRef.current = text;
          setDisplayName(text.display_name);
          setBio(text.bio);
          setSaveState("saved");
        }
        setUser(data.user);
      })
      .catch(() => toast("Could not load your profile.", "error"));
    loadSocial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!textDirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persistText();
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, bio]);

  useEffect(() => {
    return () => {
      if (!textDirtyRef.current) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void persistText();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setCropFile(file);
  };

  const confirmCrop = async (file: File, previewUrl: string) => {
    setCropFile(null);
    setAvatarPreview(previewUrl);
    setAvatarSaving(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const updated = await api.updateMe(form);
      applyMediaUpdate(updated, "avatar");
      setAvatarPreview(null);
      toast("Profile photo updated", "success");
    } catch (error: any) {
      setAvatarPreview(null);
      toast(error?.message || "Could not update your profile photo.", "error");
    } finally {
      setAvatarSaving(false);
    }
  };

  const uploadBanner = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setBannerPreview(previewUrl);
    setBannerSaving(true);
    try {
      const form = new FormData();
      form.append("banner", file);
      const updated = await api.updateMe(form);
      applyMediaUpdate(updated, "banner");
      setBannerPreview(null);
      toast("Profile banner updated", "success");
    } catch (error: any) {
      setBannerPreview(null);
      toast(error?.message || "Could not update your profile banner.", "error");
    } finally {
      setBannerSaving(false);
    }
  };

  const pickBanner = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadBanner(file);
  };

  const removeBanner = async () => {
    setBannerSaving(true);
    try {
      const updated = await api.updateMe({ banner: null });
      applyMediaUpdate(updated, "banner");
      toast("Profile banner removed", "success");
    } catch (error: any) {
      toast(error?.message || "Could not remove your profile banner.", "error");
    } finally {
      setBannerSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [bannerPreview]);

  const handleLogout = () => {
    logout();
    resetLibrary();
    navigate("/");
  };

  const collectBadge = async (badge: BadgeModel) => {
    setCollecting(badge.slug);
    try {
      const updated = await api.collectBadge(badge.slug);
      setBadges((current) => current.map((item) => (item.slug === updated.slug ? updated : item)));
      setStats((current) => ({ ...current, badges: (current.badges ?? 0) + (badge.earned ? 0 : 1) }));
      toast(`${updated.title} collected`, "success");
    } catch (error: any) {
      toast(error?.message || "Keep listening to unlock this badge.", "error");
    } finally {
      setCollecting(null);
    }
  };

  const acceptRequest = async (requestId: number) => {
    try {
      await api.acceptFriendRequest(requestId);
      loadSocial();
      toast("Friend request accepted", "success");
    } catch (error: any) {
      toast(error?.message || "Could not accept the request.", "error");
    }
  };

  const declineRequest = async (requestId: number) => {
    try {
      await api.declineFriendRequest(requestId);
      loadSocial();
      toast("Friend request declined", "success");
    } catch (error: any) {
      toast(error?.message || "Could not decline the request.", "error");
    }
  };

  const removeFriend = async (userId: number) => {
    try {
      await api.removeFriend(userId);
      loadSocial();
      toast("Removed from friends", "success");
    } catch (error: any) {
      toast(error?.message || "Could not remove this friend.", "error");
    }
  };

  const user = profile || currentUser;

  return (
    <div className="animate-fade-up pb-12 pt-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(ellipse_at_top,rgba(30,215,96,0.12),transparent_65%)]" />

      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-ink-850 shadow-2xl">
        <ProfileBanner seed={user?.username || "musicly"} image={bannerPreview || user?.banner || undefined} />
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-4 sm:top-4">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 bg-black/45 px-3 text-xs backdrop-blur-md hover:bg-black/65"
            onClick={() => bannerFileRef.current?.click()}
            disabled={bannerSaving}
          >
            {bannerSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {bannerSaving ? "Uploading…" : "Change banner"}
          </Button>
          {user?.banner && !bannerPreview && !bannerSaving && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 w-8 bg-black/45 p-0 backdrop-blur-md hover:bg-black/65"
              onClick={() => void removeBanner()}
              aria-label="Remove profile banner"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <input
            ref={bannerFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload profile banner"
            onChange={pickBanner}
          />
        </div>
        <div className="relative -mt-16 px-4 pb-5 sm:-mt-20 sm:px-6">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-end">
            <div className="group relative">
              <Avatar className="h-32 w-32 shadow-2xl ring-4 ring-[#0b0b0b] sm:h-40 sm:w-40">
                <AvatarImage src={avatarPreview || user?.avatar || undefined} alt={user?.name} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-emerald-700 text-4xl font-black text-black">
                  {initials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarSaving}
                className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 disabled:cursor-wait disabled:hover:scale-100"
                aria-label="Change profile photo"
                aria-busy={avatarSaving}
              >
                {avatarSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Upload profile photo"
                onChange={pickAvatar}
              />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Profile</p>
              <h1 className="mt-1 truncate text-4xl font-extrabold tracking-tight sm:text-5xl">{user?.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/50">
                <span>@{user?.username}</span>
                <span>·</span>
                <span>Member since {user?.created_at ? new Date(user.created_at).getFullYear() : new Date().getFullYear()}</span>
                {user?.is_staff && <Badge variant="success">Staff</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="gap-2">
                <Link to={`/user/${user?.username || ""}`}>
                  <Users className="h-4 w-4" /> Public profile
                </Link>
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")} className="gap-2">
                <BarChart3 className="h-4 w-4" /> Dashboard
              </Button>
              <Button variant="ghost" onClick={handleLogout} className="gap-2 text-white/60">
                <LogOut className="h-4 w-4" /> Log out
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Playlists", value: stats.playlists ?? 0, icon: ListMusic },
          { label: "Friends", value: stats.friends ?? 0, icon: Users },
          { label: "Badges", value: stats.badges ?? 0, icon: Trophy },
          { label: "Liked songs", value: stats.liked ?? 0, icon: Heart },
          { label: "Following", value: stats.following ?? 0, icon: UserCheck },
          { label: "Total plays", value: stats.played ?? 0, icon: Music2 },
        ].map((stat) => (
          <Card key={stat.label} className="border-white/[0.07] bg-white/[0.035]">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-extrabold leading-none">{stat.value}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-white/45">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              Badge collection <Badge variant="secondary">{badges.filter((badge) => badge.earned).length}</Badge>
            </h2>
            <p className="mt-1 text-xs text-white/40">
              Badges are shown on your public profile. Keep listening, saving and connecting to unlock them.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/search?type=user">
              <Search className="h-3.5 w-3.5" /> Find people
            </Link>
          </Button>
        </div>
        {badgesLoading && badges.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((badge) => (
              <BadgeTile
                key={badge.slug}
                badge={badge}
                collecting={collecting === badge.slug}
                onCollect={collectBadge}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            Friends <Badge variant="secondary">{friendsData?.friends.length ?? stats.friends ?? 0}</Badge>
          </h2>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/search?type=user">
              <UserPlus className="h-3.5 w-3.5" /> Add friends
            </Link>
          </Button>
        </div>

        {friendsData?.incoming.length ? (
          <div className="mb-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35">Requests</p>
            {friendsData.incoming.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] p-3"
              >
                <UserCard user={request.user} compact className="min-w-0 flex-1 border-0 bg-transparent p-0 hover:bg-transparent" />
                <div className="flex gap-2">
                  <Button size="sm" className="h-8 gap-1 px-3 text-xs" onClick={() => void acceptRequest(request.id)}>
                    <Check className="h-3.5 w-3.5" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 px-3 text-xs"
                    onClick={() => void declineRequest(request.id)}
                  >
                    <X className="h-3.5 w-3.5" /> Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {friendsData?.outgoing.length ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/35">Sent requests</span>
            {friendsData.outgoing.map((request) => (
              <span
                key={request.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] text-white/60"
              >
                @{request.user.username} · pending
              </span>
            ))}
          </div>
        ) : null}

        {friendsData?.friends.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {friendsData.friends.map((friend) => (
              <div key={friend.id} className="group relative">
                <UserCard user={friend} compact />
                <button
                  className="absolute right-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-[9px] text-white/45 opacity-0 transition hover:text-red-300 group-hover:opacity-100"
                  onClick={() => void removeFriend(friend.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] py-10 text-center">
            <Users className="h-8 w-8 text-white/30" />
            <p className="text-sm font-medium text-white/70">No friends yet</p>
            <p className="text-xs text-white/40">Find listeners with similar taste and send a friend request.</p>
            <Button asChild variant="secondary" size="sm" className="mt-2">
              <Link to="/search?type=user">Find people</Link>
            </Button>
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-white/[0.07] bg-white/[0.03]">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Edit profile</h2>
                <p className="mt-1 text-xs text-white/45">Changes save automatically as you type.</p>
              </div>
              {saveState === "error" ? (
                <button
                  type="button"
                  onClick={flushTextSave}
                  className="rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-[11px] font-semibold text-red-200 transition hover:bg-red-400/20"
                >
                  Couldn&apos;t save · Retry
                </button>
              ) : (
                <span
                  aria-live="polite"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-white/45"
                >
                  {saveState === "saving" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                  {saveState === "saving" ? "Saving…" : "Saved automatically"}
                </span>
              )}
            </div>
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Display name</Label>
                  <Input
                    id="profile-name"
                    value={displayName}
                    onChange={(event) => updateField("display_name", event.target.value)}
                    onBlur={flushTextSave}
                    placeholder={user?.username}
                    maxLength={80}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={user?.username || ""} disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-bio">Bio</Label>
                <Textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(event) => updateField("bio", event.target.value)}
                  onBlur={flushTextSave}
                  placeholder="Tell listeners a little about your taste…"
                  maxLength={240}
                />
                <p className="text-right text-[10px] text-white/30">{bio.length}/240</p>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/[0.07] bg-gradient-to-br from-primary/15 via-white/[0.03] to-transparent">
            <CardContent className="p-5">
              <BarChart3 className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-lg font-bold">Your listening dashboard</h3>
              <p className="mt-1 text-sm text-white/55">
                See your top artists, listening hours and streaks visualised with Tremor charts.
              </p>
              <Button asChild className="mt-4 w-full">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/[0.07] bg-white/[0.03]">
            <CardContent className="p-5">
              <Download className="h-6 w-6 text-white/70" />
              <h3 className="mt-3 text-lg font-bold">Install the app</h3>
              <p className="mt-1 text-sm text-white/55">
                Musicly is a PWA. Install it for a full-screen, app-like experience with cached artwork.
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => {
                  if (canInstall) void promptInstall();
                  else toast("Use your browser menu → “Install app” to add Musicly.", "default");
                }}
              >
                {canInstall ? "Install Musicly" : "How to install"}
              </Button>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-white/40">
            <p>Account created {timeAgo(user?.created_at)}.</p>
            <p className="mt-1">Musicly stores only your profile, playlists and listening history.</p>
          </div>
        </div>
      </div>

      <AvatarCropDialog file={cropFile} onCancel={() => setCropFile(null)} onConfirm={confirmCrop} />
    </div>
  );
}
