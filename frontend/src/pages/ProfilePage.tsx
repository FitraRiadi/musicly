import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Camera,
  Download,
  Heart,
  ListMusic,
  LogOut,
  Music2,
  Save,
  UserCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  const { canInstall, promptInstall } = useInstallPrompt();

  const [profile, setProfile] = useState<User | null>(currentUser);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [displayName, setDisplayName] = useState(currentUser?.display_name || "");
  const [bio, setBio] = useState(currentUser?.bio || "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .profile()
      .then((data) => {
        setProfile(data.user);
        setStats(data.stats);
        setDisplayName(data.user.display_name || "");
        setBio(data.user.bio || "");
        setUser(data.user);
      })
      .catch(() => toast("Could not load your profile.", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      let updated: User;
      if (avatarFile) {
        const form = new FormData();
        form.append("display_name", displayName);
        form.append("bio", bio);
        form.append("avatar", avatarFile);
        updated = await api.updateMe(form);
      } else {
        updated = await api.updateMe({ display_name: displayName, bio });
      }
      setProfile(updated);
      setUser(updated);
      setAvatarFile(null);
      toast("Profile updated", "success");
    } catch (error: any) {
      toast(error?.message || "Could not save your profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    resetLibrary();
    navigate("/");
  };

  const user = profile || currentUser;

  return (
    <div className="animate-fade-up pb-12 pt-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(ellipse_at_top,rgba(30,215,96,0.14),transparent_65%)]" />

      <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-end">
        <div className="group relative">
          <Avatar className="h-32 w-32 shadow-2xl ring-4 ring-black/30 sm:h-40 sm:w-40">
            <AvatarImage src={avatarPreview || user?.avatar || undefined} alt={user?.name} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-emerald-700 text-4xl font-black text-black">
              {initials(user?.name)}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105"
            aria-label="Change profile photo"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/dashboard")} className="gap-2">
            <BarChart3 className="h-4 w-4" /> Dashboard
          </Button>
          <Button variant="ghost" onClick={handleLogout} className="gap-2 text-white/60">
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Playlists", value: stats.playlists ?? 0, icon: ListMusic },
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-white/[0.07] bg-white/[0.03]">
          <CardContent className="p-5">
            <h2 className="text-lg font-bold">Edit profile</h2>
            <p className="mt-1 text-xs text-white/45">This is how you appear across Musicly.</p>
            <form onSubmit={save} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Display name</Label>
                  <Input
                    id="profile-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
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
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Tell listeners a little about your taste…"
                  maxLength={240}
                />
                <p className="text-right text-[10px] text-white/30">{bio.length}/240</p>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
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
    </div>
  );
}
