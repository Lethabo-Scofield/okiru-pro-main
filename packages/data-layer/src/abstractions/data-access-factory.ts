import type { IUnitOfWork } from "./unit-of-work.js";

/**
 * Data Access Factory — produces Unit of Work instances.
 *
 * The factory holds the long-lived connection / pool / client (one per process)
 * and produces a fresh Unit of Work for each request.
 *
 * Critical rule: create the factory ONCE at startup (the composition root),
 * never inside a request handler. Creating a new pool per request will
 * exhaust connections quickly.
 */
export interface IDataAccessFactory<TUoW extends IUnitOfWork = IUnitOfWork> {
  createUnitOfWork(): Promise<TUoW>;
}
