import type { IDataAccessFactory } from "@okiru/data-layer";
import { type IAppUnitOfWork, MongoUnitOfWork } from "./mongo-unit-of-work.js";

/**
 * Mongoose-backed Data Access Factory.
 *
 * Mongoose holds its own connection pool internally (created when connectDB()
 * runs at startup), so this factory does not own any state of its own. It
 * exists so the rest of the app can depend on IDataAccessFactory rather than
 * importing MongoUnitOfWork.begin() directly.
 *
 * Construct ONCE at startup and reuse for the lifetime of the process.
 */
export class MongoDataAccessFactory implements IDataAccessFactory<IAppUnitOfWork> {
  async createUnitOfWork(): Promise<IAppUnitOfWork> {
    return MongoUnitOfWork.begin();
  }
}
