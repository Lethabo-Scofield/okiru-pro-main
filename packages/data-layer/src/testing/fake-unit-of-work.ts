import type { IUnitOfWork } from "../abstractions/unit-of-work.js";

/**
 * FakeUnitOfWork — for unit tests that do not need a real database.
 *
 * Tracks whether commit() or rollback() was called so tests can assert on it.
 * Subclass it and add fake repositories as readonly properties:
 *
 *   class FakeAppUoW extends FakeUnitOfWork {
 *     constructor(public readonly users: IUserRepository) { super(); }
 *   }
 */
export class FakeUnitOfWork implements IUnitOfWork {
  committed = false;
  rolledBack = false;

  async commit(): Promise<void> {
    if (this.rolledBack) {
      throw new Error("FakeUnitOfWork: cannot commit — already rolled back");
    }
    this.committed = true;
  }

  async rollback(): Promise<void> {
    if (this.committed) {
      throw new Error("FakeUnitOfWork: cannot rollback — already committed");
    }
    this.rolledBack = true;
  }
}
