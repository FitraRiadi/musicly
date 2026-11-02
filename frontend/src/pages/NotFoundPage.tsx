import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <Logo />
      <p className="mt-4 text-6xl font-black tracking-tighter text-white/15">404</p>
      <h1 className="text-2xl font-extrabold">This page skipped the beat</h1>
      <p className="max-w-sm text-sm text-white/45">
        The page you're looking for doesn't exist — but there's plenty of music waiting for you.
      </p>
      <div className="mt-2 flex gap-2">
        <Button asChild>
          <Link to="/">
            <Home className="h-4 w-4" /> Home
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/search">
            <Compass className="h-4 w-4" /> Explore music
          </Link>
        </Button>
      </div>
    </div>
  );
}
