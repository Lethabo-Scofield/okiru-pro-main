const mongoose = require('/app/apps/api/node_modules/mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('No mongo URI');
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('certificate_metadata');

  const totalMongo = await col.countDocuments();
  const completed = await col.countDocuments({ extractionStatus: 'completed' });
  const withSupplier = await col.countDocuments({ supplierName: { $regex: /\S/ } });
  const withExpiry = await col.countDocuments({ expiryDate: { $ne: null } });
  const noExpiryCompleted = await col.countDocuments({ extractionStatus: 'completed', expiryDate: null });
  const statusBreakdown = await col.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  const extractionBreakdown = await col.aggregate([
    { $group: { _id: '$extractionStatus', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();

  console.log(JSON.stringify({
    totalMongo,
    completed,
    withSupplier,
    withExpiry,
    noExpiryCompleted,
    statusBreakdown,
    extractionBreakdown,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
