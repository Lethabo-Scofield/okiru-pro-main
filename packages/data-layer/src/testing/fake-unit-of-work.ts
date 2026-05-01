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
  commitCount = 0;
  rollbackCount = 0;

  /**
   * Set to true to simulate a database failure on the next commit() call.
   * Per the architecture doc §9 — used to test the error path without a DB.
   * The flag is sticky (commit will keep throwing) until you reset it.
   */
  shouldFailOnCommit = false;

  /**
   * Optional custom error to throw when shouldFailOnCommit is true. Defaults
   * to a generic simulated failure if not set.
   */
  commitError: Error | null = null;

  async commit(): Promise<void> {
    if (this.shouldFailOnCommit) {
      throw this.commitError ?? new Error("FakeUnitOfWork: simulated commit failure");
    }
    if (this.rolledBack) {
      throw new Error("FakeUnitOfWork: cannot commit — already rolled back");
    }
    this.committed = true;
    this.commitCount++;
  }

  async rollback(): Promise<void> {
    if (this.committed) {
      throw new Error("FakeUnitOfWork: cannot rollback — already committed");
    }
    this.rolledBack = true;
    this.rollbackCount++;
  }
}
