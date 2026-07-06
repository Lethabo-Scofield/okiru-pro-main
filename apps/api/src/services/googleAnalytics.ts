/**
 * Google Analytics (GA4 Data API) + Search Console service.
 *
 * Uses a service-account JWT (google-auth-library) to mint short-lived access
 * tokens and calls the official Google REST endpoints via fetch:
 *   - GA4 Data API:      https://analyticsdata.googleapis.com/v1beta
 *   - Search Console:    https://searchconsole.googleapis.com/webmasters/v3
 *
 * All credentials stay server-side. The service degrades gracefully: when the
 * required environment variables are missing it reports `configured: false`
 * and callers return a friendly configuration message instead of crashing.
 */
import { JWT } from "google-auth-library";
import { createLogger } from "../logger.js";

const logger = createLogger("GoogleAnalytics");

// ─── Types (shared shape with the frontend, keep names in sync) ───────────────

export type DateRangeKey = "today" | "7d" | "30d" | "90d";

export interface OverviewMetrics {
  totalUsers: number;
  newUsers: number;
  sessions: number;
  screenPageViews: number;
  averageEngagementTime: number;
  engagementRate: number;
}

export interface AnalyticsOverview extends OverviewMetrics {
  /** Absolute values for the previous equivalent period (for % change). */
  comparison: OverviewMetrics;
}

export interface RealtimeCountry {
  country: string;
  activeUsers: number;
}

export interface RealtimePage {
  page: string;
  activeUsers: number;
}

export interface AnalyticsRealtime {
  activeUsers: number;
  topPages: RealtimePage[];
  byCountry: RealtimeCountry[];
}

export interface TrafficSource {
  channel: string;
  users: number;
  sessions: number;
  percentage: number;
}

export interface TopPage {
  pageTitle: string;
  pagePath: string;
  screenPageViews: number;
  totalUsers: number;
  averageEngagementTime: number;
}

export interface AudienceRow {
  label: string;
  users: number;
}

export interface AnalyticsAudience {
  countries: AudienceRow[];
  cities: AudienceRow[];
  devices: AudienceRow[];
  browsers: AudienceRow[];
  operatingSystems: AudienceRow[];
}

export interface SearchConsoleTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface AnalyticsSearchConsole {
  totals: SearchConsoleTotals;
  topQueries: SearchConsoleRow[];
  topPages: SearchConsoleRow[];
}

// ─── Configuration ────────────────────────────────────────────────────────────

const GA_DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";
const GSC_BASE = "https://searchconsole.googleapis.com/webmasters/v3";
const GOOGLE_TIMEOUT_MS = 20_000;

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

function getPropertyId(): string | undefined {
  const raw = process.env.GOOGLE_ANALYTICS_PROPERTY_ID?.trim();
  return raw ? raw : undefined;
}

function getSearchProperty(): string {
  return (
    process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY?.trim() || "sc-domain:okiru.pro"
  );
}

function getServiceAccount(): { email: string; key: string } | undefined {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) return undefined;
  // Private keys are commonly stored with escaped newlines.
  const key = rawKey.replace(/\\n/g, "\n").trim();
  if (!key) return undefined;
  return { email, key };
}

/** GA4 reports need a property ID + a service account. */
export function isAnalyticsConfigured(): boolean {
  return Boolean(getPropertyId() && getServiceAccount());
}

/** Search Console needs a property + a service account (property has a default). */
export function isSearchConsoleConfigured(): boolean {
  return Boolean(getServiceAccount());
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

let cachedClient: JWT | null = null;

function getAuthClient(): JWT {
  if (cachedClient) return cachedClient;
  const sa = getServiceAccount();
  if (!sa) {
    throw new Error("Google service account is not configured");
  }
  cachedClient = new JWT({ email: sa.email, key: sa.key, scopes: SCOPES });
  return cachedClient;
}

async function getAccessToken(): Promise<string> {
  const client = getAuthClient();
  const res = await client.getAccessToken();
  if (!res || !res.token) {
    throw new Error("Failed to obtain Google access token");
  }
  return res.token;
}

// ─── HTTP helper with timeout ──────────────────────────────────────────────────

async function googleFetch<T>(url: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Read the upstream error for server-side logging only. Never surface it.
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      logger.error("Google API request failed", undefined, {
        url,
        status: res.status,
        detail: detail.slice(0, 500),
      });
      const err = new Error(`Google API responded ${res.status}`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      logger.error("Google API request timed out", undefined, { url });
      throw new Error("Google API request timed out");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Simple in-memory cache ────────────────────────────────────────────────────

interface CacheEntry {
  value: unknown;
  expires: number;
}
const cache = new Map<string, CacheEntry>();
const HISTORICAL_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REALTIME_TTL_MS = 60 * 1000; // 60 seconds

async function withCache<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) {
    return hit.value as T;
  }
  const value = await producer();
  cache.set(key, { value, expires: now + ttlMs });
  return value;
}

// ─── Date range helpers ────────────────────────────────────────────────────────

const VALID_RANGES: DateRangeKey[] = ["today", "7d", "30d", "90d"];

export function isValidRange(value: unknown): value is DateRangeKey {
  return typeof value === "string" && VALID_RANGES.includes(value as DateRangeKey);
}

interface GaDateRange {
  startDate: string;
  endDate: string;
}

/** Current and previous equivalent period in GA4 relative-date syntax. */
function resolveDateRanges(range: DateRangeKey): {
  current: GaDateRange;
  previous: GaDateRange;
} {
  // Current and previous windows must be the SAME length for a fair
  // period-over-period comparison. `today` and `NdaysAgo..today` both include
  // today, so an N-day window is `(N-1)daysAgo..today` and the equivalent prior
  // window is `(2N-1)daysAgo..NdaysAgo`.
  switch (range) {
    case "today":
      return {
        current: { startDate: "today", endDate: "today" },
        previous: { startDate: "yesterday", endDate: "yesterday" },
      };
    case "7d":
      return {
        current: { startDate: "6daysAgo", endDate: "today" },
        previous: { startDate: "13daysAgo", endDate: "7daysAgo" },
      };
    case "90d":
      return {
        current: { startDate: "89daysAgo", endDate: "today" },
        previous: { startDate: "179daysAgo", endDate: "90daysAgo" },
      };
    case "30d":
    default:
      return {
        current: { startDate: "29daysAgo", endDate: "today" },
        previous: { startDate: "59daysAgo", endDate: "30daysAgo" },
      };
  }
}

// ─── GA4 Data API response shapes (partial) ────────────────────────────────────

interface GaRow {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}
interface GaReportResponse {
  rows?: GaRow[];
  metricHeaders?: { name: string }[];
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function runReport(
  propertyId: string,
  body: Record<string, unknown>,
): Promise<GaReportResponse> {
  return googleFetch<GaReportResponse>(
    `${GA_DATA_BASE}/properties/${encodeURIComponent(propertyId)}:runReport`,
    body,
  );
}

async function runRealtimeReport(
  propertyId: string,
  body: Record<string, unknown>,
): Promise<GaReportResponse> {
  return googleFetch<GaReportResponse>(
    `${GA_DATA_BASE}/properties/${encodeURIComponent(propertyId)}:runRealtimeReport`,
    body,
  );
}

const OVERVIEW_METRICS = [
  "totalUsers",
  "newUsers",
  "sessions",
  "screenPageViews",
  "averageSessionDuration",
  "engagementRate",
];

function emptyOverviewMetrics(): OverviewMetrics {
  return {
    totalUsers: 0,
    newUsers: 0,
    sessions: 0,
    screenPageViews: 0,
    averageEngagementTime: 0,
    engagementRate: 0,
  };
}

function mapOverviewRow(row: GaRow | undefined): OverviewMetrics {
  const m = row?.metricValues ?? [];
  return {
    totalUsers: num(m[0]?.value),
    newUsers: num(m[1]?.value),
    sessions: num(m[2]?.value),
    screenPageViews: num(m[3]?.value),
    averageEngagementTime: num(m[4]?.value),
    engagementRate: num(m[5]?.value),
  };
}

// ─── Public report functions ───────────────────────────────────────────────────

export async function getOverview(range: DateRangeKey): Promise<AnalyticsOverview> {
  const propertyId = getPropertyId()!;
  return withCache(`overview:${range}`, HISTORICAL_TTL_MS, async () => {
    const { current, previous } = resolveDateRanges(range);
    // One request, two date ranges → current + previous in a single report.
    const resp = await runReport(propertyId, {
      dateRanges: [current, previous],
      metrics: OVERVIEW_METRICS.map((name) => ({ name })),
    });
    const rows = resp.rows ?? [];
    // With multiple date ranges GA4 adds a `dateRange` dimension value.
    const currentRow = rows.find(
      (r) => r.dimensionValues?.[0]?.value === "date_range_0",
    );
    const previousRow = rows.find(
      (r) => r.dimensionValues?.[0]?.value === "date_range_1",
    );
    // Fallback to positional when the dimension is absent.
    const cur = currentRow ?? rows[0];
    const prev = previousRow ?? rows[1];
    return {
      ...mapOverviewRow(cur),
      comparison: prev ? mapOverviewRow(prev) : emptyOverviewMetrics(),
    };
  });
}

export async function getRealtime(): Promise<AnalyticsRealtime> {
  const propertyId = getPropertyId()!;
  return withCache("realtime", REALTIME_TTL_MS, async () => {
    const [totalResp, countryResp, pageResp] = await Promise.all([
      // Canonical total — no dimensions, so it is never capped by a row limit.
      runRealtimeReport(propertyId, {
        metrics: [{ name: "activeUsers" }],
      }),
      runRealtimeReport(propertyId, {
        dimensions: [{ name: "country" }],
        metrics: [{ name: "activeUsers" }],
        limit: 20,
      }),
      runRealtimeReport(propertyId, {
        dimensions: [{ name: "unifiedScreenName" }],
        metrics: [{ name: "activeUsers" }],
        limit: 10,
      }),
    ]);

    const activeUsers = num(totalResp.rows?.[0]?.metricValues?.[0]?.value);
    const byCountry: RealtimeCountry[] = (countryResp.rows ?? []).map((r) => ({
      country: r.dimensionValues?.[0]?.value || "(unknown)",
      activeUsers: num(r.metricValues?.[0]?.value),
    }));
    const topPages: RealtimePage[] = (pageResp.rows ?? []).map((r) => ({
      page: r.dimensionValues?.[0]?.value || "(not set)",
      activeUsers: num(r.metricValues?.[0]?.value),
    }));

    return { activeUsers, topPages, byCountry };
  });
}

export async function getSources(range: DateRangeKey): Promise<TrafficSource[]> {
  const propertyId = getPropertyId()!;
  return withCache(`sources:${range}`, HISTORICAL_TTL_MS, async () => {
    const { current } = resolveDateRanges(range);
    const resp = await runReport(propertyId, {
      dateRanges: [current],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 25,
    });
    const rows = resp.rows ?? [];
    const totalSessions = rows.reduce(
      (sum, r) => sum + num(r.metricValues?.[1]?.value),
      0,
    );
    return rows.map((r) => {
      const sessions = num(r.metricValues?.[1]?.value);
      return {
        channel: r.dimensionValues?.[0]?.value || "Other",
        users: num(r.metricValues?.[0]?.value),
        sessions,
        percentage: totalSessions > 0 ? (sessions / totalSessions) * 100 : 0,
      };
    });
  });
}

export async function getPages(range: DateRangeKey): Promise<TopPage[]> {
  const propertyId = getPropertyId()!;
  return withCache(`pages:${range}`, HISTORICAL_TTL_MS, async () => {
    const { current } = resolveDateRanges(range);
    const resp = await runReport(propertyId, {
      dateRanges: [current],
      dimensions: [{ name: "pageTitle" }, { name: "pagePath" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "totalUsers" },
        { name: "averageSessionDuration" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 200,
    });
    return (resp.rows ?? []).map((r) => ({
      pageTitle: r.dimensionValues?.[0]?.value || "(not set)",
      pagePath: r.dimensionValues?.[1]?.value || "",
      screenPageViews: num(r.metricValues?.[0]?.value),
      totalUsers: num(r.metricValues?.[1]?.value),
      averageEngagementTime: num(r.metricValues?.[2]?.value),
    }));
  });
}

async function audienceReport(
  propertyId: string,
  current: GaDateRange,
  dimension: string,
  limit: number,
): Promise<AudienceRow[]> {
  const resp = await runReport(propertyId, {
    dateRanges: [current],
    dimensions: [{ name: dimension }],
    metrics: [{ name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }],
    limit,
  });
  return (resp.rows ?? []).map((r) => ({
    label: r.dimensionValues?.[0]?.value || "(not set)",
    users: num(r.metricValues?.[0]?.value),
  }));
}

export async function getAudience(range: DateRangeKey): Promise<AnalyticsAudience> {
  const propertyId = getPropertyId()!;
  return withCache(`audience:${range}`, HISTORICAL_TTL_MS, async () => {
    const { current } = resolveDateRanges(range);
    const [countries, cities, devices, browsers, operatingSystems] =
      await Promise.all([
        audienceReport(propertyId, current, "country", 10),
        audienceReport(propertyId, current, "city", 10),
        audienceReport(propertyId, current, "deviceCategory", 10),
        audienceReport(propertyId, current, "browser", 10),
        audienceReport(propertyId, current, "operatingSystem", 10),
      ]);
    return { countries, cities, devices, browsers, operatingSystems };
  });
}

// ─── Search Console ─────────────────────────────────────────────────────────────

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}
interface GscResponse {
  rows?: GscRow[];
}

function gscDates(range: DateRangeKey): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  const days = range === "today" ? 1 : range === "7d" ? 7 : range === "90d" ? 90 : 30;
  start.setDate(end.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function gscQuery(
  property: string,
  body: Record<string, unknown>,
): Promise<GscResponse> {
  return googleFetch<GscResponse>(
    `${GSC_BASE}/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    body,
  );
}

function mapGscRow(r: GscRow): SearchConsoleRow {
  return {
    key: r.keys?.[0] || "(unknown)",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  };
}

export async function getSearchConsole(
  range: DateRangeKey,
): Promise<AnalyticsSearchConsole> {
  const property = getSearchProperty();
  return withCache(`gsc:${range}`, HISTORICAL_TTL_MS, async () => {
    const { startDate, endDate } = gscDates(range);
    const [totalsResp, queryResp, pageResp] = await Promise.all([
      gscQuery(property, { startDate, endDate, dimensions: [] }),
      gscQuery(property, {
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit: 25,
      }),
      gscQuery(property, {
        startDate,
        endDate,
        dimensions: ["page"],
        rowLimit: 25,
      }),
    ]);

    const totalsRow = totalsResp.rows?.[0];
    const totals: SearchConsoleTotals = {
      clicks: totalsRow?.clicks ?? 0,
      impressions: totalsRow?.impressions ?? 0,
      ctr: totalsRow?.ctr ?? 0,
      position: totalsRow?.position ?? 0,
    };

    return {
      totals,
      topQueries: (queryResp.rows ?? []).map(mapGscRow),
      topPages: (pageResp.rows ?? []).map(mapGscRow),
    };
  });
}
