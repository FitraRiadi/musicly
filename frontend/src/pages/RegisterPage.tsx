import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, AtSign, Loader2, LockKeyhole, User } from "lucide-react";
import { AuthFooterLink, AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";

export function RegisterPage() {
  const register = useAuthStore((state) => state.register);
  const user = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!/^[\w.-]{3,30}$/.test(username)) {
      setError("Username must be 3-30 characters: letters, numbers, dots or underscores.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await register({
        username: username.trim(),
        email: email.trim(),
        password,
        display_name: displayName.trim() || username.trim(),
      });
      toast("Account created — welcome to Musicly!", "success");
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err?.message || "Could not create your account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Join Musicly"
      title="Feel every beat."
      subtitle="Create a free account to build playlists, save the songs you love and unlock your personal listening dashboard."
      footer={<AuthFooterLink to="/login" text="Already have an account?" label="Log in" />}
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Create your account</h2>
        <p className="mt-1 text-sm text-white/50">Free forever. No credit card required.</p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="register-name">Display name</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id="register-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="How should we call you?"
              maxLength={80}
              className="pl-9"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="register-username">Username</Label>
            <Input
              id="register-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="listener"
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <Input
                id="register-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="pl-9"
                required
              />
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="register-password">Password</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <Input
                id="register-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                className="pl-9"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-confirm">Confirm</Label>
            <Input
              id="register-confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {loading ? "Creating account…" : "Sign up free"}
        </Button>
      </form>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-white/30">
        By signing up you agree to this demo's terms. Musicly is a portfolio project and stores only the data you enter.
      </p>
    </AuthLayout>
  );
}
