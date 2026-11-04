import { Link } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-[90] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 md:top-4">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-amber-300/25 bg-[#241d0f]/95 px-3.5 py-2.5 text-sm text-amber-50 shadow-2xl backdrop-blur-xl">
        <WifiOff className="h-4 w-4 shrink-0 text-amber-300" />
        <p className="min-w-0 flex-1 leading-snug">
          You&apos;re offline. Downloaded music is still available.
        </p>
        <Link
          to="/downloads"
          className="shrink-0 rounded-lg bg-amber-300/90 px-2.5 py-1 text-xs font-semibold text-black transition hover:bg-amber-200"
        >
          Open Downloads
        </Link>
      </div>
    </div>
  );
}
