/**
 * Generic Repository contract.
 *
 * A Repository is an object that knows how to read and write a single type of
 * domain entity. Implementations hide all database-specific code behind this
 * interface. Concrete repositories (e.g. MongoUserRepository) extend this with
 * entity-specific operations.
 *
 * Rule: A repository never calls commit() or rollback(). Transaction control
 * belongs to the Unit of Work.
 */
export interface IRepository<TEntity, TId> {
  findById(id: TId): Promise<TEntity | null>;
}
