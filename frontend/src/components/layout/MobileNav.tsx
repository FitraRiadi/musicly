import { Link } from "react-router-dom";
import { Download, Home, Library, Radio, Search, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useSongHubStore } from "@/store/songhub";

const items = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/song-hub", label: "Hub", icon: Radio },
  { to: "/library", label: "Library", icon: Library },
  { to: "/downloads", label: "Downloads", icon: Download },
];

export function MobileNav() {
  const user = useAuthStore((state) => state.user);
  const inRoom = useSongHubStore((state) => Boolean(state.room));
  return (
    <nav className="flex h-16 items-stretch justify-around border-t border-white/[0.06] bg-ink-850 pb-safe md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
              isActive ? "text-white" : "text-white/50",
            )
          }
        >
          {({ isActive }) => (
            <>
              <span className="relative">
                <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.6 : 2} />
                {item.to === "/song-hub" && inRoom && (
                  <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                )}
              </span>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
      <Link
        to={user ? "/profile" : "/login"}
        className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-white/50"
      >
        <User className="h-5 w-5" />
        {user ? "Profile" : "Log in"}
      </Link>
    </nav>
  );
}
