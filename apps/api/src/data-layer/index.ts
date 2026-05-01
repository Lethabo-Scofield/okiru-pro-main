/**
 * Composition root helper for the data layer.
 *
 * Builds a provider registry, registers concrete factories, and exposes the
 * one canonical factory for the running app. Imported only from
 * `apps/api/index.ts` (the composition root) — never from route handlers or
 * services.
 */
import {
  InMemoryProviderRegistry,
  type IDataAccessFactory,
  type IProviderRegistry,
} from "@okiru/data-layer";
import { MongoDataAccessFactory } from "./mongo/mongo-data-access-factory.js";
import type { IAppUnitOfWork } from "./mongo/mongo-unit-of-work.js";

export type { IAppUnitOfWork };
export type AppDataAccessFactory = IDataAccessFactory<IAppUnitOfWork>;

export interface DataLayer {
  registry: IProviderRegistry;
  /** The factory the app should use for incoming requests. */
  factory: AppDataAccessFactory;
  /** The provider key chosen at startup (e.g. "mongo"). */
  provider: string;
}

/**
 * Build the data layer from environment configuration.
 *
 * `DATA_PROVIDER` selects which provider to expose via `factory`. Currently
 * only "mongo" is supported. Adding a provider is a two-step process:
 *   1. Implement IDataAccessFactory<IAppUnitOfWork> for the new backend.
 *   2. registry.register("yourkey", new YourFactory()) below.
 */
export function buildDataLayer(): DataLayer {
  const registry = new InMemoryProviderRegistry();

  const mongoFactory = new MongoDataAccessFactory();
  registry.register("mongo", mongoFactory);

  const provider = process.env.DATA_PROVIDER?.trim() || "mongo";
  if (!registry.has(provider)) {
    throw new Error(
      `DATA_PROVIDER="${provider}" is not registered. Known providers: mongo`,
    );
  }

  const factory = registry.resolve(provider) as AppDataAccessFactory;
  return { registry, factory, provider };
}
