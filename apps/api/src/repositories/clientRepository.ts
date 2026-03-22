import { v4 as uuid } from "uuid";
import {
  ClientModel,
  ShareholderModel,
  OwnershipDataModel,
  FinancialYearModel,
} from "../../models.js";
import type {
  Client,
  FinancialYear,
  InsertClient,
  InsertFinancialYear,
  InsertShareholder,
  OwnershipDataRow,
  PaginatedResponse,
  Shareholder,
} from "../../schema.js";
import { BaseRepository, cleanDoc } from "./base.js";

export class ClientRepository extends BaseRepository<Client, InsertClient> {
  constructor() {
    super(ClientModel);
  }

  async findByOrg(orgId: string): Promise<Client[]> {
    const docs = await ClientModel.find({ organizationId: orgId }).lean();
    return docs.map((d) => cleanDoc<Client>(d));
  }

  async findByOrgPaginated(orgId: string, page: number, limit: number): Promise<PaginatedResponse<Client>> {
    const skip = Math.max(0, (page - 1) * limit);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [docs, total] = await Promise.all([
      ClientModel.find({ organizationId: orgId }).skip(skip).limit(safeLimit).lean(),
      ClientModel.countDocuments({ organizationId: orgId }),
    ]);
    return { items: docs.map((d) => cleanDoc<Client>(d)), total, page, limit: safeLimit };
  }
}

export class ShareholderRepository extends BaseRepository<Shareholder, InsertShareholder> {
  constructor() {
    super(ShareholderModel);
  }

  async findByClient(clientId: string): Promise<Shareholder[]> {
    const docs = await ShareholderModel.find({ clientId }).lean();
    return docs.map((d) => cleanDoc<Shareholder>(d));
  }
}

export class OwnershipRepository {
  async findByClient(clientId: string): Promise<OwnershipDataRow | undefined> {
    const doc = await OwnershipDataModel.findOne({ clientId }).lean();
    return doc ? cleanDoc<OwnershipDataRow>(doc) : undefined;
  }

  async upsert(clientId: string, data: { companyValue?: number; outstandingDebt?: number; yearsHeld?: number }): Promise<OwnershipDataRow> {
    const doc = await OwnershipDataModel.findOneAndUpdate(
      { clientId },
      { $set: data, $setOnInsert: { id: uuid(), clientId } },
      { upsert: true, returnDocument: "after" }
    ).lean();
    return cleanDoc<OwnershipDataRow>(doc!);
  }
}

export class FinancialYearRepository extends BaseRepository<FinancialYear, InsertFinancialYear> {
  constructor() {
    super(FinancialYearModel);
  }

  async findByClient(clientId: string): Promise<FinancialYear[]> {
    const docs = await FinancialYearModel.find({ clientId }).lean();
    return docs.map((d) => cleanDoc<FinancialYear>(d));
  }
}
