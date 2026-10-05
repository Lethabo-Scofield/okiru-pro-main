/**
 * Who does the pillar-access fix newly restrict?
 *
 * Before the fix, verifyPillarAccessInner resolved a company's workspace from
 * ProcessorSession alone. A company created the normal way has
 * client.workspaceId set and no workspace-bound session, so the lookup found
 * nothing and returned true — every workspace member, whatever their role, had
 * full write access to every pillar of every such company.
 *
 * After the fix the company's own binding is consulted first, so the recorded
 * roles and pillarScopes finally apply. That is the intended behaviour, but it
 * is a change of behaviour for live users: anyone who has been editing on the
 * strength of the bug stops being able to.
 *
 * READ ONLY. This writes nothing. It counts who is affected so the change can
 * be announced rather than discovered.
 *
 *   MONGO_URI="<connection string>" node scripts/measure-pillar-lockout.mjs
 */
import mongoose from "mongoose";

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGO_URI (or MONGODB_URI) to the database to measure.");
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
console.log(`Connected to "${db.databaseName}".\n`);

const clients = await db
  .collection("clients")
  .find({}, { projection: { _id: 0, clientId: 1, id: 1, name: 1, workspaceId: 1, createdByUserId: 1 } })
  .toArray();

const sessions = await db
  .collection("processorSessions")
  .find({ workspaceId: { $nin: [null, ""] } }, { projection: { _id: 0, clientId: 1, workspaceId: 1 } })
  .toArray();
const sessionBound = new Set(sessions.map((s) => String(s.clientId)));

const members = await db
  .collection("workspaceMembers")
  .find({}, { projection: { _id: 0, workspaceId: 1, userId: 1, role: 1, pillarScopes: 1 } })
  .toArray();

const membersByWorkspace = new Map();
for (const m of members) {
  const key = String(m.workspaceId);
  if (!membersByWorkspace.has(key)) membersByWorkspace.set(key, []);
  membersByWorkspace.get(key).push(m);
}

let newlyGoverned = 0;
let alreadyGoverned = 0;
let ungoverned = 0;
const losesAllWriting = new Set();
const losesSomeWriting = new Set();
const affectedCompanies = [];

for (const c of clients) {
  const companyId = String(c.clientId ?? c.id ?? "");
  const workspaceId = c.workspaceId ? String(c.workspaceId) : "";

  if (!workspaceId) {
    if (sessionBound.has(companyId)) alreadyGoverned++;
    else ungoverned++;
    continue;
  }
  // Bound via the client record. If a session also bound it, the old code
  // already governed it and nothing changes.
  if (sessionBound.has(companyId)) {
    alreadyGoverned++;
    continue;
  }

  newlyGoverned++;
  const roster = membersByWorkspace.get(workspaceId) ?? [];
  const restricted = [];
  for (const m of roster) {
    if (String(m.userId) === String(c.createdByUserId ?? "")) continue; // creator keeps full
    if (m.role === "owner") continue;
    if (m.role === "viewer") {
      losesAllWriting.add(String(m.userId));
      restricted.push({ userId: String(m.userId), role: m.role, effect: "read-only" });
      continue;
    }
    const scopes = Array.isArray(m.pillarScopes) ? m.pillarScopes.filter(Boolean) : [];
    if (scopes.length > 0) {
      losesSomeWriting.add(String(m.userId));
      restricted.push({ userId: String(m.userId), role: m.role, effect: `scoped to ${scopes.join(", ")}` });
    }
  }
  if (restricted.length) {
    affectedCompanies.push({ companyId, name: c.name ?? "(unnamed)", restricted });
  }
}

console.log("Companies");
console.log(`  bound via client.workspaceId, newly governed : ${newlyGoverned}`);
console.log(`  already governed (session-bound)             : ${alreadyGoverned}`);
console.log(`  no workspace binding, unaffected             : ${ungoverned}`);
console.log(`  total                                        : ${clients.length}\n`);

console.log("People whose access narrows");
console.log(`  become read-only somewhere : ${losesAllWriting.size}`);
console.log(`  become pillar-scoped       : ${losesSomeWriting.size}\n`);

if (!affectedCompanies.length) {
  console.log("No user loses access on any company. The fix is inert for current data.");
} else {
  console.log(`Affected companies (${affectedCompanies.length}):`);
  for (const a of affectedCompanies.slice(0, 40)) {
    console.log(`  ${a.name} [${a.companyId}]`);
    for (const r of a.restricted) console.log(`      ${r.userId} (${r.role}) -> ${r.effect}`);
  }
  if (affectedCompanies.length > 40) {
    console.log(`  ... and ${affectedCompanies.length - 40} more`);
  }
}

await mongoose.disconnect();
