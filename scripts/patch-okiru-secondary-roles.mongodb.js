const users = [
  { email: "tmoahi@okiru.co.za", role: "analyst" },
  { email: "admin@okiru.pro", role: "admin" },
  { email: "cmyezwa@okiru.co.za", role: "manager" },
  { email: "pnkadimeng@okiru.co.za", role: "user" },
  { email: "zmnanzana@okiru.co.za", role: "auditor" },
];
users.forEach((u) => {
  const doc = db.users.findOne({ email: u.email });
  if (!doc) {
    print("skip " + u.email);
    return;
  }
  const sec = new Set(
    (doc.secondaryRoles || [])
      .concat([u.role])
      .filter((r) => r && r !== "super_admin"),
  );
  db.users.updateOne({ _id: doc._id }, { $set: { secondaryRoles: Array.from(sec) } });
  printjson({ email: u.email, role: doc.role, secondaryRoles: Array.from(sec) });
});
const r = db.clients.updateMany(
  { $or: [{ id: null }, { id: { $exists: false } }] },
  [{ $set: { id: "$clientId", clientId: "$clientId" } }],
);
print("clients backfill matched=" + r.matchedCount + " modified=" + r.modifiedCount);
