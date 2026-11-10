/** TEST-ONLY. Mirrors the contract (including append-only refusal) of MongoStudioStore. */
import {
  APPEND_ONLY, DuplicateIdError, StaleWriteError,
  type Collection, type CollectionName, type Doc, type StudioStore,
} from '../studioStore.js';

class MemoryCollection<T extends Doc> implements Collection<T> {
  rows = new Map<string, T>();
  constructor(private readonly name: CollectionName) {}

  async get(id: string) { const r = this.rows.get(id); return r ? structuredClone(r) : null; }

  async insert(doc: T) {
    if (this.rows.has(doc.id)) throw new DuplicateIdError(doc.id);
    this.rows.set(doc.id, structuredClone(doc));
  }

  async replace(doc: T, expectedRev: number) {
    if (APPEND_ONLY.has(this.name)) throw new Error(`${this.name} is append-only`);
    const cur = this.rows.get(doc.id);
    if (!cur || cur.rev !== expectedRev) throw new StaleWriteError();
    const next = { ...structuredClone(doc), rev: expectedRev + 1 };
    this.rows.set(doc.id, next);
    return structuredClone(next);
  }

  async find(filter: Partial<Record<keyof T & string, unknown>> = {}) {
    return [...this.rows.values()]
      .filter((r) => Object.entries(filter).every(([k, v]) => (r as Record<string, unknown>)[k] === v))
      .map((r) => structuredClone(r));
  }
}

export class MemoryStudioStore implements StudioStore {
  private readonly cols = new Map<CollectionName, MemoryCollection<any>>();
  collection<T extends Doc>(name: CollectionName): Collection<T> {
    let c = this.cols.get(name);
    if (!c) { c = new MemoryCollection<T>(name); this.cols.set(name, c); }
    return c as Collection<T>;
  }
}
