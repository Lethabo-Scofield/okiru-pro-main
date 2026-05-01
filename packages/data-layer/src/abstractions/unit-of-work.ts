/**
 * Unit of Work — represents a single transactional boundary.
 *
 * One request = one Unit of Work = one open database transaction (where the
 * underlying driver supports it; otherwise commit/rollback are best-effort).
 *
 * A concrete UoW exposes domain repositories as readonly properties. All
 * repositories on the same UoW share the same connection / session, so
 * everything they do is part of the same transaction automatically.
 *
 * Implementations MUST guarantee that any underlying connection / session is
 * released back to its pool whether commit() succeeds or fails — typically by
 * doing the release inside a finally block.
 */
export interface IUnitOfWork {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
