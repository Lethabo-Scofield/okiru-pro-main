/**
 * Client domain types & repository contract.
 *
 * `ClientView` is the projection routes consume — never raw Mongoose documents
 * with `_id`, `__v`, internal flags, etc. Repositories are responsible for
 * mapping persistence shapes to this view.
 *
 * `IClientRepository` extends the generic `IRepository<ClientView, string>`
 * (one method, `findById`) with the extra access patterns this domain needs.
 * The contract is the API for any provider — Mongo today, something else
 * tomorrow — so route handlers depend ONLY on this interface.
 */
import type { IRepository } from "@okiru/data-layer";

export interface ClientView {
  id: string;
  organizationId: string;
  name: string;
  financialYear: string;
  revenue: number;
  npat: number;
  leviableAmount: number;
  industrySector: string;
  eapProvince: string;
  industryNorm: number | null;
  logo: string | null;
  pipelineOverrides: unknown;
  createdAt: string;
}

export interface ClientCreateInput {
  organizationId: string;
  name: string;
  financialYear: string;
  revenue?: number;
  npat?: number;
  leviableAmount?: number;
  industrySector?: string;
  eapProvince?: string;
  industryNorm?: number | null;
  logo?: string | null;
  pipelineOverrides?: unknown;
}

export type ClientUpdateInput = Partial<Omit<ClientView, "id" | "createdAt" | "organizationId">>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface IClientRepository extends IRepository<ClientView, string> {
  findByOrganization(organizationId: string): Promise<ClientView[]>;
  findByOrganizationPaginated(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ClientView>>;
  create(input: ClientCreateInput): Promise<ClientView>;
  update(id: string, input: ClientUpdateInput): Promise<ClientView | null>;
}
