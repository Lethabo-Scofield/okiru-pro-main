import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, Eye, RefreshCw, Users, Wrench } from "lucide-react";
import { apiRequest } from "@toolkit/lib/queryClient";

type Cell = { date: string; hour: number; count: number; users: number; activeMinutes: number };
type TopPage = { path: string; views: number; users: number; activeMinutes: number };
type ToolUsage = { id: string; name: string; visits: number; users: number; activeMinutes: number; usageShare: number; lastUsed: string };
type ActivityData = {
  days: number;
  totalViews: number;
  uniqueUsers: number;
  activeMinutes: number;
  cells: Cell[];
  topPages: TopPage[];
  toolUsage: ToolUsage[];
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function localDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function intensity(count: number, max: number): string {
  if (!count) return "bg-purple-50";
  const ratio = count / Math.max(1, max);
  if (ratio <= 0.2) return "bg-purple-100";
  if (ratio <= 0.4) return "bg-purple-300";
  if (ratio <= 0.65) return "bg-purple-500";
  if (ratio <= 0.85) return "bg-purple-700";
  return "bg-purple-950";
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatLastUsed(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function ActivityHeatmap() {
  const [days, setDays] = useState(28);
  const query = useQuery<ActivityData>({
    queryKey: ["activity-heatmap", days],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/activity-heatmap?days=${days}`);
      return response.json();
    },
    refetchInterval: 60_000,
  });

  const dates = useMemo(
    () => Array.from({ length: days }, (_, index) => localDate(days - index - 1)),
    [days],
  );
  const byCell = useMemo(
    () => new Map((query.data?.cells ?? []).map((cell) => [`${cell.date}:${cell.hour}`, cell])),
    [query.data?.cells],
  );
  const max = Math.max(1, ...(query.data?.cells ?? []).map((cell) => cell.count));

  return (
    // This page was white inside a dark application, with its own back link and
    // its own wordmark. The shell carries all three now; refresh is the only
    // control here that was ever this page's own.
    <div className="text-[color:var(--hi)]">
      <main className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8">
        <div className="flex items-center justify-end mb-4">
          <button
            type="button"
            onClick={() => query.refetch()}
            className="grid h-8 w-8 place-items-center rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-3)] text-[color:var(--body)] transition-colors hover:border-[color:var(--rule-strong)] hover:text-white"
            title="Refresh activity"
            aria-label="Refresh activity"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[color:var(--muted)]">Okiru.pro internal analytics</p>
            <h1 className="mt-2 text-3xl font-semibold">Product activity</h1>
            <p className="mt-2 text-sm text-white/55">See which tools people use, how often they return, and when they are active.</p>
          </div>
          <div className="inline-flex w-fit rounded-md border border-[color:var(--rule)] bg-[color:var(--ink-3)] p-1">
            {[7, 28, 90].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`h-8 px-3 text-xs font-medium transition-colors ${days === option ? "rounded bg-[color:var(--ink)] text-white" : "text-white/55 hover:text-white"}`}
              >
                {option} days
              </button>
            ))}
          </div>
        </div>

        <section className="mt-8 grid grid-cols-1 border-y border-[color:var(--rule)] sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Page views", value: query.data?.totalViews ?? 0, icon: Eye },
            { label: "Active users", value: query.data?.uniqueUsers ?? 0, icon: Users },
            { label: "Active time", value: formatDuration(query.data?.activeMinutes ?? 0), icon: Activity },
            { label: "Busiest hour", value: (() => { const c = [...(query.data?.cells ?? [])].sort((a,b) => b.count-a.count)[0]; return c ? `${String(c.hour).padStart(2,"0")}:00` : "No data"; })(), icon: Clock3 },
          ].map(({ label, value, icon: Icon }, index) => (
            <div key={label} className={`px-5 py-5 ${index ? "sm:border-l sm:border-[color:var(--rule)]" : ""}`}>
              <div className="flex items-center gap-2 text-xs text-white/55"><Icon className="h-4 w-4" />{label}</div>
              <div className="mt-2 text-2xl font-semibold">{query.isLoading ? "..." : value}</div>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2"><Wrench className="h-4 w-4" /><h2 className="text-sm font-semibold">Tool usage</h2></div>
          <div className="overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--ink-3)]">
            {(query.data?.toolUsage ?? []).map((tool) => (
              <div key={tool.id} className="grid gap-3 border-b border-[color:var(--rule)] px-5 py-4 transition-colors last:border-b-0 hover:bg-[color:var(--ink)]/[0.025] md:grid-cols-[minmax(180px,1fr)_minmax(180px,2fr)_90px_80px_135px] md:items-center">
                <div>
                  <div className="text-sm font-semibold">{tool.name}</div>
                  <div className="mt-1 text-[11px] text-white/45">Last used {formatLastUsed(tool.lastUsed)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--ink)]/10">
                    <div className="h-full rounded-full bg-[color:var(--ink)]" style={{ width: `${Math.max(2, tool.usageShare)}%` }} />
                  </div>
                  <span className="w-9 text-right text-xs font-medium">{tool.usageShare}%</span>
                </div>
                <div className="text-xs text-[color:var(--muted)]"><strong className="block text-sm text-white">{formatDuration(tool.activeMinutes)}</strong>active</div>
                <div className="text-xs text-[color:var(--muted)]"><strong className="block text-sm text-white">{tool.visits}</strong>visits</div>
                <div className="text-xs text-[color:var(--muted)]"><strong className="block text-sm text-white">{tool.users}</strong>unique users</div>
              </div>
            ))}
            {!query.isLoading && !query.data?.toolUsage.length && <div className="px-5 py-12 text-center text-sm text-[color:var(--muted)]">Tool usage will appear after signed-in users begin working.</div>}
          </div>
        </section>

        <section className="mt-10 overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--ink-3)]">
          <div className="flex items-center justify-between border-b border-[color:var(--rule)] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Engagement by day and hour</h2>
              <p className="mt-1 text-xs text-[color:var(--muted)]">Times shown in South Africa Standard Time</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[color:var(--muted)]">
              Less {[0, 1, 2, 3, 4].map((level) => <span key={level} className={`h-3 w-3 rounded-sm ${intensity(level, 4)}`} />)} More
            </div>
          </div>
          {query.isError ? (
            <div className="px-5 py-16 text-center text-sm text-red-600">Activity data could not be loaded.</div>
          ) : (
            <div className="overflow-x-auto p-5">
              <div className="min-w-[850px]">
                <div className="mb-2 grid grid-cols-[82px_repeat(24,minmax(22px,1fr))] gap-1">
                  <span />
                  {HOURS.map((hour) => <span key={hour} className="text-center text-[9px] text-white/40">{hour % 3 === 0 ? hour : ""}</span>)}
                </div>
                <div className="space-y-1">
                  {dates.map((date) => (
                    <div key={date} className="grid grid-cols-[82px_repeat(24,minmax(22px,1fr))] gap-1">
                      <span className="self-center text-[10px] text-[color:var(--muted)]">{new Date(`${date}T12:00:00`).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}</span>
                      {HOURS.map((hour) => {
                        const cell = byCell.get(`${date}:${hour}`);
                        return (
                          <div
                            key={hour}
                            className={`aspect-square min-h-4 rounded-sm ${intensity(cell?.count ?? 0, max)}`}
                            title={`${date} at ${String(hour).padStart(2, "0")}:00, ${cell?.count ?? 0} views, ${formatDuration(Math.round(cell?.activeMinutes ?? 0))} active, ${cell?.users ?? 0} users`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center gap-2"><Activity className="h-4 w-4" /><h2 className="text-sm font-semibold">Most visited pages</h2></div>
          <div className="divide-y divide-black/10 rounded-lg border border-[color:var(--rule)] bg-[color:var(--ink-3)]">
            {(query.data?.topPages ?? []).map((page, index) => (
              <div key={page.path} className="grid grid-cols-[28px_1fr_auto_auto] items-center gap-4 px-5 py-3 text-sm">
                <span className="text-xs text-white/35">{String(index + 1).padStart(2, "0")}</span>
                <span className="truncate font-mono text-xs">{page.path}</span>
                <span className="text-xs text-[color:var(--muted)]">{page.users} users · {formatDuration(page.activeMinutes)} active</span>
                <span className="min-w-16 text-right font-medium">{page.views} visits</span>
              </div>
            ))}
            {!query.isLoading && !query.data?.topPages.length && <div className="px-5 py-12 text-center text-sm text-[color:var(--muted)]">Activity will appear as users move through Okiru.</div>}
          </div>
        </section>
      </main>
    </div>
  );
}
