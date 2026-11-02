import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, LockKeyhole, User } from "lucide-react";
import { AuthFooterLink, AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth";
import { useUiStore } from "@/store/ui";

export function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={user.is_staff ? "/admin" : from} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const signedIn = await login(username.trim(), password);
      if (signedIn.is_staff) {
        navigate("/admin", { replace: true });
        return;
      }
      toast("Welcome back to Musicly!", "success");
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Incorrect username or password.");
    } finally {
      setLoading(false);
    }
  };

  const signInDemo = async () => {
    setUsername("demo");
    setPassword("Musicly123!");
    setError(null);
    setLoading(true);
    try {
      await login("demo", "Musicly123!");
      toast("Signed in with the demo account", "success");
      navigate(from, { replace: true });
    } catch {
      setError("The demo account has not been seeded yet. Register a new account instead.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Your music is waiting."
      subtitle="Sign in to pick up exactly where you left off — your playlists, liked songs and listening dashboard are all here."
      footer={<AuthFooterLink to="/register" text="New to Musicly?" label="Create a free account" />}
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Log in to Musicly</h2>
        <p className="mt-1 text-sm text-white/50">Use your username and password.</p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-username">Username</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id="login-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="your username"
              autoComplete="username"
              className="pl-9"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password">Password</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="pl-9"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={loading || status === "loading"}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {loading ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/25">
        <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
      </div>

      <Button variant="outline" className="w-full" onClick={() => void signInDemo()} type="button">
        Try the demo account
      </Button>
      <p className="mt-2 text-center text-[11px] text-white/30">demo · Musicly123!</p>

      <div className="mt-6 flex items-center justify-between text-xs text-white/35">
        <Link to="/" className="hover:text-white">
          ← Back to home
        </Link>
        <button
          type="button"
          className="hover:text-white"
          onClick={() => toast("Password reset is not enabled in this demo.", "default")}
        >
          Forgot password?
        </button>
      </div>
    </AuthLayout>
  );
}
