import type { IDataAccessFactory } from "./data-access-factory.js";

/**
 * Provider Registry — maps a string key (e.g. "mongo", "arango", "fake") to a
 * concrete IDataAccessFactory.
 *
 * The composition root populates the registry once at startup. Application
 * code can then resolve a factory by key without importing concrete provider
 * classes directly.
 */
export interface IProviderRegistry {
  register(key: string, factory: IDataAccessFactory): void;
  resolve(key: string): IDataAccessFactory;
  has(key: string): boolean;
}

export class InMemoryProviderRegistry implements IProviderRegistry {
  private readonly factories = new Map<string, IDataAccessFactory>();

  register(key: string, factory: IDataAccessFactory): void {
    if (this.factories.has(key)) {
      throw new Error(`Provider already registered for key "${key}"`);
    }
    this.factories.set(key, factory);
  }

  resolve(key: string): IDataAccessFactory {
    const factory = this.factories.get(key);
    if (!factory) {
      const known = [...this.factories.keys()].join(", ") || "(none)";
      throw new Error(
        `No provider registered for key "${key}". Known providers: ${known}`,
      );
    }
    return factory;
  }

  has(key: string): boolean {
    return this.factories.has(key);
  }
}
