import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  BarChart,
  Card as TremorCard,
  Metric,
  Text,
  Title as TremorTitle,
} from "@tremor/react";
import { Clock3, Disc3, Heart, ListMusic, Music2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type { Insights } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUiStore } from "@/store/ui";
import { formatCount } from "@/lib/utils";

export function DashboardPage() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useUiStore((state) => state.toast);

  const load = (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    api
      .insights()
      .then((data) => setInsights(data))
      .catch((error) => toast(error?.message || "Could not load your insights.", "error"))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-5 pb-12 pt-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const totals = insights?.totals;
  const hasData = (totals?.plays || 0) > 0;

  return (
    <div className="animate-fade-up pb-12 pt-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(ellipse_at_top,rgba(30,215,96,0.13),transparent_65%)]" />

      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="gap-1">
              <Sparkles className="h-3 w-3" /> Tremor analytics
            </Badge>
            <span className="text-[11px] text-white/35">Last 14 days</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">Listening dashboard</h1>
          <p className="mt-1 max-w-xl text-sm text-white/50">
            A visual breakdown of how you listen — top artists, daily activity and your favourite hours.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="relative mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total plays", value: totals?.plays ?? 0, icon: Music2, suffix: "" },
          { label: "Minutes listened", value: Math.round(totals?.minutes ?? 0), icon: Clock3, suffix: "m" },
          { label: "Unique tracks", value: totals?.unique_tracks ?? 0, icon: Disc3, suffix: "" },
          { label: "Liked songs", value: totals?.likes ?? 0, icon: Heart, suffix: "" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="group rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 transition hover:border-primary/25"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wider text-white/45">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-primary/80" />
            </div>
            <p className="mt-3 text-3xl font-extrabold leading-none">
              {formatCount(stat.value)}
              <span className="text-base font-semibold text-white/40">{stat.suffix}</span>
            </p>
            <p className="mt-1.5 text-[10px] text-white/30">
              {stat.label === "Minutes listened" ? "Across 30-second previews" : "All time"}
            </p>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <p className="text-xl font-bold">Your dashboard is warming up</p>
          <p className="max-w-md text-sm text-white/45">
            Play a few songs and Musicly will start charting your top artists, listening hours and streaks.
          </p>
          <Button asChild className="mt-2">
            <Link to="/search">Play something</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <TremorCard className="!rounded-xl !border-white/10 !bg-ink-800/80 !p-5">
            <TremorTitle className="!text-white">Listening activity</TremorTitle>
            <Text className="!text-white/45">Plays per day over the last two weeks</Text>
            <AreaChart
              className="mt-4 h-64"
              data={insights?.by_day || []}
              index="date"
              categories={["plays"]}
              colors={["emerald"]}
              showLegend={false}
              showGridLines={false}
              curveType="natural"
            />
          </TremorCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <TremorCard className="!rounded-xl !border-white/10 !bg-ink-800/80 !p-5">
              <TremorTitle className="!text-white">Top artists</TremorTitle>
              <Text className="!text-white/45">Who has been on repeat</Text>
              <BarChart
                className="mt-4 h-64"
                data={insights?.top_artists || []}
                index="name"
                categories={["plays"]}
                colors={["emerald"]}
                layout="vertical"
                showLegend={false}
                showGridLines={false}
                valueFormatter={(value) => `${value}`}
                yAxisWidth={110}
              />
            </TremorCard>

            <TremorCard className="!rounded-xl !border-white/10 !bg-ink-800/80 !p-5">
              <TremorTitle className="!text-white">When you listen</TremorTitle>
              <Text className="!text-white/45">Plays grouped by hour of day</Text>
              <BarChart
                className="mt-4 h-64"
                data={insights?.by_hour || []}
                index="hour"
                categories={["plays"]}
                colors={["emerald"]}
                showLegend={false}
                showGridLines={false}
                valueFormatter={(value) => `${value}`}
              />
            </TremorCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <TremorCard className="!rounded-xl !border-white/10 !bg-ink-800/80 !p-5">
              <TremorTitle className="!text-white">Most played tracks</TremorTitle>
              <Text className="!text-white/45">Your personal rotation</Text>
              <Table className="mt-4">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Track</TableHead>
                    <TableHead className="hidden sm:table-cell">Artist</TableHead>
                    <TableHead className="text-right">Plays</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights?.top_tracks.map((track, i) => (
                    <TableRow key={`${track.id}-${i}`}>
                      <TableCell className="text-white/40">{i + 1}</TableCell>
                      <TableCell>
                        <Link to={`/album/${track.album_id || ""}`} className="flex items-center gap-2.5 hover:underline">
                          {track.cover ? (
                            <img src={track.cover} alt="" className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded bg-white/10">
                              <Music2 className="h-3 w-3" />
                            </span>
                          )}
                          <span className="max-w-[180px] truncate text-[13px] font-medium">{track.title}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden max-w-[160px] truncate text-xs text-white/50 sm:table-cell">
                        {track.artist}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">{track.plays}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TremorCard>

            <TremorCard className="!rounded-xl !border-white/10 !bg-ink-800/80 !p-5">
              <TremorTitle className="!text-white">Library snapshot</TremorTitle>
              <Text className="!text-white/45">Everything you've collected</Text>
              <div className="mt-5 space-y-4">
                {[
                  { label: "Playlists", value: totals?.playlists ?? 0, icon: ListMusic },
                  { label: "Following", value: totals?.following ?? 0, icon: Heart },
                  { label: "Minutes", value: Math.round(totals?.minutes ?? 0), icon: Clock3 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06]">
                      <item.icon className="h-4 w-4 text-white/60" />
                    </div>
                    <Text className="flex-1 !text-white/60">{item.label}</Text>
                    <Metric className="!text-lg !text-white">{formatCount(item.value)}</Metric>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-lg bg-primary/10 p-3 text-[11px] leading-relaxed text-primary/90">
                Metrics update as you listen. History is recorded server-side in PostgreSQL.
              </div>
            </TremorCard>
          </div>
        </div>
      )}
    </div>
  );
}
