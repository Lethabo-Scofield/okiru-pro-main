import type { IDataAccessFactory } from "../abstractions/data-access-factory.js";
import type { IUnitOfWork } from "../abstractions/unit-of-work.js";

/**
 * FakeDataAccessFactory — returns a pre-built UoW so tests can wire up the
 * same code paths the real factory would, without touching a database.
 *
 * If you need a fresh UoW per call (because tests assert on commit state),
 * pass a builder function instead of a single instance.
 */
export class FakeDataAccessFactory<TUoW extends IUnitOfWork>
  implements IDataAccessFactory<TUoW>
{
  constructor(private readonly source: TUoW | (() => TUoW)) {}

  async createUnitOfWork(): Promise<TUoW> {
    return typeof this.source === "function"
      ? (this.source as () => TUoW)()
      : this.source;
  }
}
