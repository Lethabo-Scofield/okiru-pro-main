/**
 * Let a MemoryStorage e2e suite get through POST /api/auth/login.
 *
 * The login route refuses with 503 ("Database is not available") whenever
 * `mongoose.connection.readyState !== 1`. That guard landed on 2026-06-12,
 * three weeks AFTER the first Supertest e2e suite, and every suite that
 * authenticates through the real login route has failed at boot ever since —
 * silently, because the failure is a thrown setup error in beforeAll rather
 * than a red assertion. Three files (clients, ESG workbooks, organization)
 * were effectively unrun for three months.
 *
 * These suites deliberately run on the in-memory `MemoryStorage` with
 * MONGODB_URI unset, so there is nothing for mongoose to connect to and
 * nothing the guard usefully protects: the storage the route reads IS
 * available. This reports the connection as up for the duration of ONE call
 * and puts it back immediately.
 *
 * The window is deliberately narrow. `readyState` is not only the login
 * guard — it is the switch the client, workbook and scorecard routes use to
 * choose between the Mongoose models and MemoryStorage. Holding it at 1 for
 * the whole suite sends every later request to a Mongo that is not there, and
 * they buffer-time-out at ten seconds apiece. Wrap the sign-in, nothing else.
 *
 * It stubs no storage, no session and no route: the sign-in still travels the
 * production code path end to end, and so does everything after it.
 */
import mongoose from "mongoose";

export async function withStorageReportedAvailable<T>(perform: () => Promise<T>): Promise<T> {
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  try {
    return await perform();
  } finally {
    // Removes the own property, restoring the real getter on the prototype.
    delete (mongoose.connection as unknown as Record<string, unknown>).readyState;
  }
}
