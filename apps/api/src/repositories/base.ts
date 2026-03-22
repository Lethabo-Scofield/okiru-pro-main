import { v4 as uuid } from "uuid";
import type { Model } from "mongoose";

export type Identifiable = { id: string };

export function cleanDoc<T>(doc: unknown): T {
  if (doc == null) return doc as T;
  const obj =
    typeof (doc as { toObject?: () => Record<string, unknown> }).toObject === "function"
      ? (doc as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(doc as Record<string, unknown>) };
  delete obj._id;
  delete obj.__v;
  return obj as T;
}

export abstract class BaseRepository<T extends Identifiable, InsertT extends object> {
  constructor(protected readonly model: Model<unknown>) {}

  async findById(id: string): Promise<T | undefined> {
    const doc = await this.model.findOne({ id }).lean();
    return doc ? cleanDoc<T>(doc) : undefined;
  }

  async create(data: InsertT): Promise<T> {
    const doc = await this.model.create({ id: uuid(), ...(data as object) });
    return cleanDoc<T>(doc);
  }

  async update(id: string, data: Partial<InsertT>): Promise<T | undefined> {
    const doc = await this.model.findOneAndUpdate({ id }, { $set: data }, { returnDocument: "after" }).lean();
    return doc ? cleanDoc<T>(doc) : undefined;
  }

  async delete(id: string): Promise<void> {
    await this.model.deleteOne({ id });
  }
}
