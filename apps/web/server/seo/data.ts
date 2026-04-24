import http from "http";
import { makeCertificateSlug } from "./slug";

export interface CertificateRecord {
  slug: string;
  companyName: string;
  bbbeeLevel: number | null;
  bbbeeScore: number | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  verificationAgency: string | null;
  certificateNumber: string | null;
  expiryDate: string | null;
  issueDate: string | null;
  blobName: string | null;
  status: "valid" | "expiring" | "expired" | "unknown";
  updatedAt: string;
}

const API_BASE = process.env.API_SERVER_URL || "http://127.0.0.1:3000";

function fetchFromApi<T>(path: string, timeoutMs = 5000): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const url = new URL(path, API_BASE);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: "GET",
          timeout: timeoutMs,
          headers: { Accept: "application/json" },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            if (!res.statusCode || res.statusCode >= 400) {
              resolve(null);
              return;
            }
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              resolve(JSON.parse(body) as T);
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

const DEMO_CERTIFICATES: CertificateRecord[] = [
  {
    slug: makeCertificateSlug("Absa Group Limited", "ABSA-2025-001"),
    companyName: "Absa Group Limited",
    bbbeeLevel: 1,
    bbbeeScore: 105.5,
    blackOwnership: 32.4,
    blackWomenOwnership: 14.2,
    verificationAgency: "AQRate Verification Services",
    certificateNumber: "ABSA-2025-001",
    expiryDate: "2026-09-30",
    issueDate: "2025-10-01",
    blobName: null,
    status: "valid",
    updatedAt: "2025-10-01",
  },
  {
    slug: makeCertificateSlug("Standard Bank South Africa", "SBSA-2025-114"),
    companyName: "Standard Bank South Africa",
    bbbeeLevel: 1,
    bbbeeScore: 102.1,
    blackOwnership: 30.0,
    blackWomenOwnership: 12.8,
    verificationAgency: "Empowerdex",
    certificateNumber: "SBSA-2025-114",
    expiryDate: "2026-08-15",
    issueDate: "2025-08-16",
    blobName: null,
    status: "valid",
    updatedAt: "2025-08-16",
  },
  {
    slug: makeCertificateSlug("Sasol Limited", "SASOL-2025-220"),
    companyName: "Sasol Limited",
    bbbeeLevel: 2,
    bbbeeScore: 92.6,
    blackOwnership: 25.1,
    blackWomenOwnership: 9.4,
    verificationAgency: "BEE Verification Agency",
    certificateNumber: "SASOL-2025-220",
    expiryDate: "2026-06-30",
    issueDate: "2025-07-01",
    blobName: null,
    status: "valid",
    updatedAt: "2025-07-01",
  },
  {
    slug: makeCertificateSlug("MTN Group", "MTN-2025-337"),
    companyName: "MTN Group",
    bbbeeLevel: 2,
    bbbeeScore: 88.4,
    blackOwnership: 28.6,
    blackWomenOwnership: 11.0,
    verificationAgency: "Mosela Rating Agency",
    certificateNumber: "MTN-2025-337",
    expiryDate: "2026-05-12",
    issueDate: "2025-05-13",
    blobName: null,
    status: "valid",
    updatedAt: "2025-05-13",
  },
  {
    slug: makeCertificateSlug("Naspers", "NASPERS-2025-441"),
    companyName: "Naspers",
    bbbeeLevel: 3,
    bbbeeScore: 80.2,
    blackOwnership: 22.5,
    blackWomenOwnership: 8.1,
    verificationAgency: "Empowerdex",
    certificateNumber: "NASPERS-2025-441",
    expiryDate: "2026-04-20",
    issueDate: "2025-04-21",
    blobName: null,
    status: "valid",
    updatedAt: "2025-04-21",
  },
  {
    slug: makeCertificateSlug("Vodacom Group", "VOD-2025-559"),
    companyName: "Vodacom Group",
    bbbeeLevel: 4,
    bbbeeScore: 72.8,
    blackOwnership: 60.5,
    blackWomenOwnership: 27.3,
    verificationAgency: "AQRate Verification Services",
    certificateNumber: "VOD-2025-559",
    expiryDate: "2026-03-15",
    issueDate: "2025-03-16",
    blobName: null,
    status: "valid",
    updatedAt: "2025-03-16",
  },
];

function dedupe(records: CertificateRecord[]): CertificateRecord[] {
  const seen = new Map<string, CertificateRecord>();
  for (const r of records) {
    if (!r.slug) continue;
    if (!seen.has(r.slug)) seen.set(r.slug, r);
  }
  return Array.from(seen.values());
}

export async function listCertificates(): Promise<CertificateRecord[]> {
  const apiRecords = await fetchFromApi<CertificateRecord[]>("/api/certificates/seo/list");
  if (apiRecords && Array.isArray(apiRecords) && apiRecords.length > 0) {
    return dedupe(apiRecords);
  }
  return DEMO_CERTIFICATES;
}

export async function getCertificateBySlug(slug: string): Promise<CertificateRecord | null> {
  const fromApi = await fetchFromApi<CertificateRecord>(
    `/api/certificates/by-slug/${encodeURIComponent(slug)}`,
  );
  if (fromApi && fromApi.slug) return fromApi;
  return DEMO_CERTIFICATES.find((c) => c.slug === slug) || null;
}

export async function listCertificatesByLevel(level: number): Promise<CertificateRecord[]> {
  const all = await listCertificates();
  return all.filter((c) => c.bbbeeLevel === level);
}

export async function listBlackOwnedCertificates(threshold = 51): Promise<CertificateRecord[]> {
  const all = await listCertificates();
  return all.filter((c) => (c.blackOwnership ?? 0) >= threshold);
}
