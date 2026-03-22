import { v4 as uuid } from "uuid";
import { ImportLogModel, ExportLogModel } from "../../models.js";
import type { ExportLog, ImportLog, InsertExportLog, InsertImportLog, PaginatedResponse } from "../../schema.js";
import { cleanDoc } from "./base.js";

export class LogRepository {
  async createImportLog(data: InsertImportLog): Promise<ImportLog> {
    const { errors, ...rest } = data;
    const doc = await ImportLogModel.create({ id: uuid(), importErrors: errors ?? null, ...rest });
    const obj = cleanDoc<Record<string, unknown>>(doc);
    obj.errors = obj.importErrors ?? null;
    delete obj.importErrors;
    return obj as unknown as ImportLog;
  }

  async getImportLogsByUser(userId: string): Promise<ImportLog[]> {
    const docs = await ImportLogModel.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();
    return docs.map((d) => {
      const obj = cleanDoc<Record<string, unknown>>(d);
      obj.errors = obj.importErrors ?? null;
      delete obj.importErrors;
      return obj as unknown as ImportLog;
    });
  }

  async getImportLogsByUserPaginated(userId: string, page: number, limit: number): Promise<PaginatedResponse<ImportLog>> {
    const skip = Math.max(0, (page - 1) * limit);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [docs, total] = await Promise.all([
      ImportLogModel.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      ImportLogModel.countDocuments({ userId }),
    ]);
    const items = docs.map((d) => {
      const obj = cleanDoc<Record<string, unknown>>(d);
      obj.errors = obj.importErrors ?? null;
      delete obj.importErrors;
      return obj as unknown as ImportLog;
    });
    return { items, total, page, limit: safeLimit };
  }

  async createExportLog(data: InsertExportLog): Promise<ExportLog> {
    const doc = await ExportLogModel.create({ id: uuid(), ...data });
    return cleanDoc<ExportLog>(doc);
  }

  async getExportLogs(clientId: string): Promise<ExportLog[]> {
    const docs = await ExportLogModel.find({ clientId }).lean();
    return docs.map((d) => cleanDoc<ExportLog>(d));
  }
}
