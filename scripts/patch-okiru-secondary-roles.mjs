/**
 * One-off: set secondaryRoles for @okiru users promoted to super_admin.
 * Also backfill clients.id from clientId where id is null/missing.
 *
 * Usage (from api pod):
 *   node scripts/patch-okiru-secondary-roles.mjs
 */
import mongoose from "mongoose";

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://admin:okiru-mongo-2026@mongodb:27017/okiru_pro?authSource=admin";

const ROLE_BY_EMAIL = {
  "tmoahi@okiru.co.za": "analyst",
  "admin@okiru.pro": "admin",
  "cmyezwa@okiru.co.za": "manager",
  "pnkadimeng@okiru.co.za": "user",
  "zmnanzana@okiru.co.za": "auditor",
};

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const clients = db.collection("clients");

  for (const [email, originalRole] of Object.entries(ROLE_BY_EMAIL)) {
    const u = await users.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } });
    if (!u) {
      console.log("skip user (not found):", email);
      continue;
    }
    const secondary = new Set([...(u.secondaryRoles || []), originalRole].filter((r) => r && r !== "super_admin"));
    await users.updateOne(
      { _id: u._id },
      { $set: { secondaryRoles: Array.from(secondary), role: u.role || "super_admin" } },
    );
    console.log("patched user", email, "secondaryRoles:", Array.from(secondary));
  }

  const nullIdClients = await clients.find({ $or: [{ id: null }, { id: { $exists: false } }] }).toArray();
  let fixed = 0;
  for (const c of nullIdClients) {
    const businessId = c.clientId || c.id;
    if (!businessId) continue;
    await clients.updateOne({ _id: c._id }, { $set: { id: businessId, clientId: businessId } });
    fixed++;
  }
  console.log("backfilled client id fields:", fixed);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
