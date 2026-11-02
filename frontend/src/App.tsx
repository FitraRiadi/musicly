import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/auth";
import { HomePage } from "@/pages/HomePage";
import { SearchPage } from "@/pages/SearchPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { PlaylistPage } from "@/pages/PlaylistPage";
import { AlbumPage } from "@/pages/AlbumPage";
import { ArtistPage } from "@/pages/ArtistPage";
import { LikedSongsPage } from "@/pages/LikedSongsPage";
import { GenrePage } from "@/pages/GenrePage";
import { ProfilePage } from "@/pages/ProfilePage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { Logo } from "@/components/brand/Logo";

const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);

const AdminPage = lazy(() =>
  import("@/pages/AdminPage").then((module) => ({ default: module.AdminPage })),
);

function RouteFallback() {
  return (
    <div className="space-y-4 pt-8">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-white/[0.04]" />
    </div>
  );
}

function BootSplash() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-black">
      <Logo />
      <div className="h-1 w-28 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-shimmer rounded-full bg-primary" />
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();
  if (status === "idle" || status === "loading") return <BootSplash />;
  if (status === "guest") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  if (status === "idle" || status === "loading") return <BootSplash />;
  if (status === "guest") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!user?.is_staff) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  if (status === "idle") return <BootSplash />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppBootstrap>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="album/:id" element={<AlbumPage />} />
            <Route path="artist/:id" element={<ArtistPage />} />
            <Route path="playlist/:id" element={<PlaylistPage />} />
            <Route path="genre/:id" element={<GenrePage />} />
            <Route path="liked" element={<LikedSongsPage />} />
            <Route
              path="library"
              element={
                <RequireAuth>
                  <LibraryPage />
                </RequireAuth>
              }
            />
            <Route
              path="profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route
              path="dashboard"
              element={
                <RequireAuth>
                  <Suspense fallback={<RouteFallback />}>
                    <DashboardPage />
                  </Suspense>
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Suspense fallback={<div className="min-h-dvh bg-[#070707] p-6"><RouteFallback /></div>}>
                  <AdminPage />
                </Suspense>
              </RequireAdmin>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </AppBootstrap>
    </BrowserRouter>
  );
}
