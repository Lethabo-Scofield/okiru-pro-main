/**
 * Shared analytics response types (frontend mirror of the API service in
 * `apps/api/src/services/googleAnalytics.ts`). Keep names in sync with the
 * backend so the JSON contract stays consistent.
 */

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

/** Envelope every analytics endpoint returns. */
export type AnalyticsResponse<T> =
  | { configured: false }
  | { configured: true; data: T };
