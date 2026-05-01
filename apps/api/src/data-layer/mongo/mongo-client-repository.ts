import type { ClientSession } from "mongoose";
import { ClientModel } from "../../../models.js";
import type {
  ClientCreateInput,
  ClientUpdateInput,
  ClientView,
  IClientRepository,
  PaginatedResult,
} from "../domain/client.js";

interface ClientDoc {
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

function toView(doc: ClientDoc | null): ClientView | null {
  if (!doc) return null;
  return {
    id: doc.id,
    organizationId: doc.organizationId,
    name: doc.name,
    financialYear: doc.financialYear,
    revenue: doc.revenue ?? 0,
    npat: doc.npat ?? 0,
    leviableAmount: doc.leviableAmount ?? 0,
    industrySector: doc.industrySector ?? "Generic",
    eapProvince: doc.eapProvince ?? "National",
    industryNorm: doc.industryNorm ?? null,
    logo: doc.logo ?? null,
    pipelineOverrides: doc.pipelineOverrides ?? null,
    createdAt: doc.createdAt,
  };
}

/**
 * Concrete Mongo implementation of IClientRepository.
 *
 * Mirrors the existing storage.ts client methods so legacy /api/clients
 * behaviour stays identical, but exposes them through the repository contract
 * so route handlers depend on IClientRepository (the abstraction) instead of
 * the storage facade or Mongoose models directly.
 *
 * Pagination clamps page>=1 and limit between 1..100 to match the legacy
 * behaviour and prevent unbounded queries.
 */
export class MongoClientRepository implements IClientRepository {
  constructor(private readonly session: ClientSession | null) {}

  async findById(id: string): Promise<ClientView | null> {
    const doc = await ClientModel.findOne({ id })
      .session(this.session)
      .lean<ClientDoc>()
      .exec();
    return toView(doc);
  }

  async findByOrganization(organizationId: string): Promise<ClientView[]> {
    const docs = await ClientModel.find({ organizationId })
      .session(this.session)
      .lean<ClientDoc[]>()
      .exec();
    return docs.map((d) => toView(d)!).filter(Boolean);
  }

  async findByOrganizationPaginated(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ClientView>> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const skip = (safePage - 1) * safeLimit;

    const [docs, total] = await Promise.all([
      ClientModel.find({ organizationId })
        .session(this.session)
        .skip(skip)
        .limit(safeLimit)
        .lean<ClientDoc[]>()
        .exec(),
      ClientModel.countDocuments({ organizationId })
        .session(this.session)
        .exec(),
    ]);

    return {
      items: docs.map((d) => toView(d)!).filter(Boolean),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async create(input: ClientCreateInput): Promise<ClientView> {
    // Mongoose's create() doesn't accept a session on a single doc; use save() instead.
    const doc = new ClientModel(input);
    await doc.save({ session: this.session ?? undefined });
    const created = doc.toObject() as ClientDoc;
    return toView(created)!;
  }

  async update(id: string, input: ClientUpdateInput): Promise<ClientView | null> {
    const doc = await ClientModel.findOneAndUpdate(
      { id },
      { $set: input },
      { returnDocument: "after" },
    )
      .session(this.session)
      .lean<ClientDoc>()
      .exec();
    return toView(doc);
  }
}
