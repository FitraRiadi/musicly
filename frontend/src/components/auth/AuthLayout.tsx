import { Link } from "react-router-dom";
import { CheckCircle2, Headphones, Music4, Sparkles, WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

const features = [
  { icon: Music4, text: "Millions of tracks, albums and artists" },
  { icon: Sparkles, text: "Curated mixes and personalised picks" },
  { icon: WifiOff, text: "Installable PWA with cached artwork" },
];

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-dvh bg-black">
      <div className="relative hidden w-[52%] flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,#1ed760_0%,transparent_45%),radial-gradient(circle_at_85%_75%,#0d7a37_0%,transparent_50%)] opacity-40" />
        <div className="absolute inset-0 bg-noise opacity-[0.08]" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />

        <div className="relative">
          <Logo />
          <div className="mt-24 max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/90">{eyebrow}</p>
            <h1 className="mt-4 text-balance text-5xl font-extrabold leading-[1.02] tracking-tight text-white xl:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/60">{subtitle}</p>
          </div>

          <ul className="mt-10 space-y-3.5">
            {features.map((feature) => (
              <li key={feature.text} className="flex items-center gap-3 text-sm text-white/75">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.07]">
                  <feature.icon className="h-4 w-4 text-primary" />
                </span>
                {feature.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-black">
            <Headphones className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Full-length streaming, zero setup.</p>
            <p className="text-xs text-white/45">Tap play on any song and Musicly streams instantly.</p>
          </div>
          <CheckCircle2 className="ml-auto h-5 w-5 text-primary" />
        </div>
      </div>

      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-[48%] xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <div className={cn("rounded-2xl border border-white/[0.08] bg-ink-850/90 p-6 shadow-2xl sm:p-8", className)}>
            {children}
          </div>
          <div className="mt-6 text-center text-sm text-white/45">{footer}</div>
          <p className="mt-8 text-center text-[11px] leading-relaxed text-white/25">
            Musicly is an educational clone. Preview audio and artwork come from the public Deezer API.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthFooterLink({ to, text, label }: { to: string; text: string; label: string }) {
  return (
    <span>
      {text}{" "}
      <Link to={to} className="font-semibold text-white underline-offset-4 hover:underline">
        {label}
      </Link>
    </span>
  );
}
