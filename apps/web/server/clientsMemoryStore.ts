/**
 * In-memory fallback store for ClientModel records.
 *
 * Mirrors the subset of ClientModel fields used by the /api/clients routes
 * and by the workbook tenant check. Only consulted when Mongo is not
 * connected (dev / Replit without MONGODB_URI). Production always uses
 * Mongo — see `isMongoConnected()` in routes.ts.
 *
 * Lives in its own module so both routes.ts (writer) and workbookRoutes.ts
 * (reader, for P3 tenant check) share a single Map without circular imports.
 */

export interface MemoryClient {
  clientId: string;
  name: string;
  financialYear: string | null;
  industrySector: string | null;
  eapProvince: string | null;
  revenue: number;
  npat: number;
  leviableAmount: number;
  organizationId: string | null;
  createdByUserId: string | null;
  logo?: string | null;
  shareholders?: any[];
  employees?: any[];
  trainingPrograms?: any[];
  suppliers?: any[];
  esdContributions?: any[];
  sedContributions?: any[];
  tmps?: number;
  companyValue?: number;
  outstandingDebt?: number;
  sectorCode?: string | null;
  /** Which product created this company — "bbbee" (default) or "esg". */
  product?: "bbbee" | "esg";
  createdAt: Date;
  updatedAt: Date;
}

const store = new Map<string, MemoryClient>();

/** True iff the caller can read/write this client. Mirrors the Mongo filter
 *  applied in the /api/clients routes: same org OR same creator. */
export function canAccessClient(
  client: MemoryClient,
  userId: string,
  userOrgId: string | null,
): boolean {
  const sameOrg =
    client.organizationId !== null && client.organizationId === userOrgId;
  const sameUser =
    client.createdByUserId !== null && client.createdByUserId === userId;
  return sameOrg || sameUser;
}

export function listClientsForTenant(
  userId: string,
  userOrgId: string | null,
): MemoryClient[] {
  return Array.from(store.values())
    .filter((c) => canAccessClient(c, userId, userOrgId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function getClient(clientId: string): MemoryClient | undefined {
  return store.get(clientId);
}

export function createClient(doc: MemoryClient): MemoryClient {
  store.set(doc.clientId, doc);
  return doc;
}

export function updateClient(
  clientId: string,
  patch: Partial<MemoryClient>,
): MemoryClient | undefined {
  const existing = store.get(clientId);
  if (!existing) return undefined;
  const merged: MemoryClient = {
    ...existing,
    ...patch,
    clientId: existing.clientId,
    createdAt: existing.createdAt,
    updatedAt: new Date(),
  };
  store.set(clientId, merged);
  return merged;
}

export function deleteClient(clientId: string): boolean {
  return store.delete(clientId);
}

/** Test-only — reset between cases. */
export function __resetClientsMemoryStore(): void {
  store.clear();
}
