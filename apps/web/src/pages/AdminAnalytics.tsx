import { useMemo, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@toolkit/lib/auth";
import { useLocation } from "wouter";
import { apiRequest } from "@toolkit/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { Input } from "@toolkit/components/ui/input";
import { Skeleton } from "@toolkit/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@toolkit/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@toolkit/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@toolkit/components/ui/select";
import {
  BarChart3,
  Shield,
  Users,
  UserPlus,
  MousePointerClick,
  Eye,
  Timer,
  Activity,
  TrendingUp,
  TrendingDown,
  Search as SearchIcon,
  Globe,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell,
  CartesianGrid,
} from "recharts";
import { AppNavBack } from "@/components/AppNavBack";
import { hasAnyRole } from "@/lib/roles";
import type {
  AnalyticsResponse,
  AnalyticsOverview,
  AnalyticsRealtime,
  AnalyticsAudience,
  AudienceRow,
  TrafficSource,
  TopPage,
  AnalyticsSearchConsole,
  OverviewMetrics,
  DateRangeKey,
} from "@/types/analytics";

// ─── Constants ──────────────────────────────────────────────────────────────

const RANGE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const CHART_COLORS = [
  "#8b5cf6",
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];

const PAGE_SIZE = 10;

const CONFIG_MESSAGE =
  "Analytics has not been connected yet. Add the required Google credentials and property access to view live data.";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatPosition(pos: number): string {
  return pos ? pos.toFixed(1) : "—";
}

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// ─── Data hook ─────────────────────────────────────────────────────────────────

function useAnalytics<T>(
  key: string,
  path: string,
  opts?: { refetchInterval?: number; range?: DateRangeKey },
): UseQueryResult<AnalyticsResponse<T>> {
  const range = opts?.range;
  return useQuery<AnalyticsResponse<T>>({
    queryKey: range ? ["analytics", key, range] : ["analytics", key],
    queryFn: async () => {
      const url = range ? `${path}?range=${range}` : path;
      const res = await apiRequest("GET", url);
      return (await res.json()) as AnalyticsResponse<T>;
    },
    refetchInterval: opts?.refetchInterval ?? false,
    staleTime: opts?.refetchInterval ? 0 : 5 * 60 * 1000,
  });
}

// ─── Small presentational helpers ───────────────────────────────────────────────

function SectionState({
  icon: Icon,
  title,
  message,
  onRetry,
}: {
  icon: React.ElementType;
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground mb-3" />
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Retry
        </Button>
      )}
    </div>
  );
}

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-xs text-muted-foreground">No prior data</span>;
  }
  const up = change >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up ? "text-status-success" : "text-status-error"
      }`}
    >
      <Arrow className="h-3 w-3" />
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

// ─── Overview cards ─────────────────────────────────────────────────────────────

const OVERVIEW_CARDS: {
  key: keyof OverviewMetrics;
  label: string;
  icon: React.ElementType;
  format: (v: number) => string;
}[] = [
  { key: "totalUsers", label: "Total Users", icon: Users, format: formatNumber },
  { key: "newUsers", label: "New Users", icon: UserPlus, format: formatNumber },
  { key: "sessions", label: "Sessions", icon: MousePointerClick, format: formatNumber },
  { key: "screenPageViews", label: "Page Views", icon: Eye, format: formatNumber },
  {
    key: "averageEngagementTime",
    label: "Avg Engagement Time",
    icon: Timer,
    format: formatDuration,
  },
  {
    key: "engagementRate",
    label: "Engagement Rate",
    icon: Activity,
    format: (v) => formatPercent(v),
  },
];

function OverviewCards({ range }: { range: DateRangeKey }) {
  const q = useAnalytics<AnalyticsOverview>("overview", "/api/admin/analytics/overview", {
    range,
  });

  if (q.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {OVERVIEW_CARDS.map((c) => (
          <Card key={c.key}>
            <CardContent className="p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-20 mb-2" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (q.isError) {
    return (
      <Card>
        <SectionState
          icon={BarChart3}
          title="Couldn't load overview"
          message="The analytics request failed. Please try again."
          onRetry={() => q.refetch()}
        />
      </Card>
    );
  }

  if (!q.data?.configured) {
    return (
      <Card>
        <SectionState icon={BarChart3} title="Analytics not connected" message={CONFIG_MESSAGE} />
      </Card>
    );
  }

  const data = q.data.data;
  const allZero = OVERVIEW_CARDS.every((c) => !data[c.key]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {OVERVIEW_CARDS.map((c) => {
        const Icon = c.icon;
        const change = pctChange(data[c.key], data.comparison[c.key]);
        return (
          <Card key={c.key} data-testid={`card-metric-${c.key}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-semibold text-foreground mb-1">
                {allZero ? "—" : c.format(data[c.key])}
              </div>
              <ChangeIndicator change={change} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Realtime ───────────────────────────────────────────────────────────────────

function RealtimeSection() {
  const q = useAnalytics<AnalyticsRealtime>("realtime", "/api/admin/analytics/realtime", {
    refetchInterval: 60_000,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-status-success" />
          </span>
          Real-time
        </CardTitle>
        <span className="text-xs text-muted-foreground">Last 30 minutes</span>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : q.isError ? (
          <SectionState
            icon={Activity}
            title="Real-time unavailable"
            message="Couldn't load real-time data."
            onRetry={() => q.refetch()}
          />
        ) : !q.data?.configured ? (
          <p className="text-sm text-muted-foreground">{CONFIG_MESSAGE}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-4xl font-semibold text-foreground">
                {formatNumber(q.data.data.activeUsers)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Active users right now</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Top active pages</div>
              {q.data.data.topPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active pages</p>
              ) : (
                <ul className="space-y-1.5">
                  {q.data.data.topPages.slice(0, 5).map((p) => (
                    <li key={p.page} className="flex justify-between text-sm">
                      <span className="truncate mr-2 text-foreground/90">{p.page}</span>
                      <span className="text-muted-foreground tabular-nums">{p.activeUsers}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">By country</div>
              {q.data.data.byCountry.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data</p>
              ) : (
                <ul className="space-y-1.5">
                  {q.data.data.byCountry.slice(0, 5).map((c) => (
                    <li key={c.country} className="flex justify-between text-sm">
                      <span className="truncate mr-2 text-foreground/90">{c.country}</span>
                      <span className="text-muted-foreground tabular-nums">{c.activeUsers}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Traffic sources ─────────────────────────────────────────────────────────────

function SourcesSection({ range }: { range: DateRangeKey }) {
  const q = useAnalytics<TrafficSource[]>("sources", "/api/admin/analytics/sources", { range });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Traffic Sources</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : q.isError ? (
          <SectionState
            icon={Globe}
            title="Couldn't load sources"
            message="The request failed. Please try again."
            onRetry={() => q.refetch()}
          />
        ) : !q.data?.configured ? (
          <p className="text-sm text-muted-foreground">{CONFIG_MESSAGE}</p>
        ) : q.data.data.length === 0 ? (
          <SectionState icon={Globe} title="No traffic yet" message="No acquisition data for this period." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={q.data.data} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} strokeOpacity={0.1} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                  <YAxis
                    type="category"
                    dataKey="channel"
                    width={110}
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    opacity={0.7}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="sessions" radius={[0, 4, 4, 0]}>
                    {q.data.data.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">% of total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.data.map((s) => (
                    <TableRow key={s.channel}>
                      <TableCell className="font-medium">{s.channel}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(s.users)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(s.sessions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.percentage.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Top pages ──────────────────────────────────────────────────────────────────

function PagesSection({ range }: { range: DateRangeKey }) {
  const q = useAnalytics<TopPage[]>("pages", "/api/admin/analytics/pages", { range });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const rows = q.data && q.data.configured ? q.data.data : [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.pageTitle.toLowerCase().includes(term) || r.pagePath.toLowerCase().includes(term),
    );
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <CardTitle className="text-base">Top Pages</CardTitle>
        {q.data?.configured && rows.length > 0 && (
          <div className="relative w-full sm:w-64">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pages…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-8 h-9"
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : q.isError ? (
          <SectionState
            icon={Eye}
            title="Couldn't load pages"
            message="The request failed. Please try again."
            onRetry={() => q.refetch()}
          />
        ) : !q.data?.configured ? (
          <p className="text-sm text-muted-foreground">{CONFIG_MESSAGE}</p>
        ) : filtered.length === 0 ? (
          <SectionState icon={Eye} title="No pages" message="No page data for this period." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">Avg time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((p) => (
                    <TableRow key={p.pagePath || p.pageTitle}>
                      <TableCell>
                        <div className="font-medium text-foreground truncate max-w-[280px]">
                          {p.pageTitle}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {p.pagePath}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(p.screenPageViews)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(p.totalUsers)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(p.averageEngagementTime)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-muted-foreground">
                  Page {current + 1} of {pageCount} · {filtered.length} rows
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current === 0}
                    onClick={() => setPage(current - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current >= pageCount - 1}
                    onClick={() => setPage(current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Audience ───────────────────────────────────────────────────────────────────

function AudienceChart({ title, rows }: { title: string; rows: AudienceRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows.slice(0, 6)} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={90}
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  opacity={0.7}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="users" radius={[0, 4, 4, 0]}>
                  {rows.slice(0, 6).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AudienceSection({ range }: { range: DateRangeKey }) {
  const q = useAnalytics<AnalyticsAudience>("audience", "/api/admin/analytics/audience", { range });

  if (q.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    );
  }
  if (q.isError) {
    return (
      <Card>
        <SectionState
          icon={Users}
          title="Couldn't load audience"
          message="The request failed. Please try again."
          onRetry={() => q.refetch()}
        />
      </Card>
    );
  }
  if (!q.data?.configured) {
    return (
      <Card>
        <SectionState icon={Users} title="Analytics not connected" message={CONFIG_MESSAGE} />
      </Card>
    );
  }

  const a = q.data.data;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <AudienceChart title="Country" rows={a.countries} />
      <AudienceChart title="City" rows={a.cities} />
      <AudienceChart title="Device Category" rows={a.devices} />
      <AudienceChart title="Browser" rows={a.browsers} />
      <AudienceChart title="Operating System" rows={a.operatingSystems} />
    </div>
  );
}

// ─── Google Search (Search Console) ─────────────────────────────────────────────

function SearchConsoleSection({ range }: { range: DateRangeKey }) {
  const q = useAnalytics<AnalyticsSearchConsole>(
    "search-console",
    "/api/admin/analytics/search-console",
    { range },
  );

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <Card>
        <SectionState
          icon={SearchIcon}
          title="Couldn't load Search data"
          message="The request failed. Please try again."
          onRetry={() => q.refetch()}
        />
      </Card>
    );
  }
  if (!q.data?.configured) {
    return (
      <Card>
        <SectionState
          icon={SearchIcon}
          title="Search Console not connected"
          message={CONFIG_MESSAGE}
        />
      </Card>
    );
  }

  const { totals, topQueries, topPages } = q.data.data;
  const totalCards = [
    { label: "Total Clicks", value: formatNumber(totals.clicks) },
    { label: "Total Impressions", value: formatNumber(totals.impressions) },
    { label: "Average CTR", value: formatPercent(totals.ctr) },
    { label: "Average Position", value: formatPosition(totals.position) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {totalCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground mb-1">{c.label}</div>
              <div className="text-2xl font-semibold text-foreground">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Search Queries</CardTitle>
        </CardHeader>
        <CardContent>
          {topQueries.length === 0 ? (
            <SectionState icon={SearchIcon} title="No queries" message="No search query data for this period." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Avg position</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topQueries.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium max-w-[280px] truncate">{r.key}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(r.ctr)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPosition(r.position)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Pages from Google Search</CardTitle>
        </CardHeader>
        <CardContent>
          {topPages.length === 0 ? (
            <SectionState icon={SearchIcon} title="No pages" message="No search page data for this period." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Avg position</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPages.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium max-w-[280px] truncate">{r.key}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(r.ctr)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPosition(r.position)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [range, setRange] = useState<DateRangeKey>("30d");

  const isAdmin = hasAnyRole(user, "admin", "super_admin");

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2" data-testid="text-access-denied">
              Access Denied
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              You need administrator privileges to view this page.
            </p>
            <Button onClick={() => navigate("/hub")} data-testid="btn-go-hub">
              Go to Hub
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <AppNavBack href="/hub" eyebrow="Admin" label="Hub" variant="light" className="mb-6" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Traffic Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor website traffic, visitor behaviour, acquisition sources and Google Search
              performance.
            </p>
          </div>
          <Select value={range} onValueChange={(v) => setRange(v as DateRangeKey)}>
            <SelectTrigger className="w-full sm:w-44" data-testid="select-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" className="gap-2">
              <TrendingUp className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="search" className="gap-2">
              <SearchIcon className="h-4 w-4" /> Google Search
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-0">
            <OverviewCards range={range} />
            <RealtimeSection />
            <SourcesSection range={range} />
            <PagesSection range={range} />
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">Audience</h2>
              <AudienceSection range={range} />
            </div>
          </TabsContent>

          <TabsContent value="search" className="mt-0">
            <SearchConsoleSection range={range} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
