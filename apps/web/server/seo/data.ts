import http from "http";

/** Mirrors API public certificate / SEO payload (sourced from /api/certificates/* only). */
export interface CertificateRecord {
  id?: string | null;
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
  vatNumber?: string | null;
  companySize?: string | null;
  verified?: boolean;
  metadataComplete?: boolean;
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

function dedupeBySlug(records: CertificateRecord[]): CertificateRecord[] {
  const seen = new Map<string, CertificateRecord>();
  for (const r of records) {
    if (!r.slug) continue;
    seen.set(r.slug, r);
  }
  return Array.from(seen.values());
}

export async function listCertificates(): Promise<CertificateRecord[]> {
  // Cold API queries on the shared Atlas tier can take tens of seconds; the
  // API caches the result, so allow one slow fetch rather than serving an
  // empty sitemap/level page to a crawler.
  const apiRecords = await fetchFromApi<CertificateRecord[]>("/api/certificates/seo/list", 60_000);
  if (apiRecords && Array.isArray(apiRecords)) {
    return dedupeBySlug(apiRecords.filter((r) => r.slug && r.companyName));
  }
  return [];
}

export async function getCertificateBySlug(slug: string): Promise<CertificateRecord | null> {
  const fromApi = await fetchFromApi<CertificateRecord>(
    `/api/certificates/by-slug/${encodeURIComponent(slug)}`,
    15_000,
  );
  if (fromApi && fromApi.slug) return fromApi;
  return null;
}

export async function listCertificatesByLevel(level: number): Promise<CertificateRecord[]> {
  const all = await listCertificates();
  return all.filter((c) => c.bbbeeLevel === level);
}

export async function listBlackOwnedCertificates(threshold = 51): Promise<CertificateRecord[]> {
  const all = await listCertificates();
  return all.filter((c) => (c.blackOwnership ?? 0) >= threshold);
}
