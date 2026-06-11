import mongoose from 'mongoose';
import { BlobServiceClient } from '@azure/storage-blob';

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('No MONGODB_URI');
  process.exit(1);
}

await mongoose.connect(uri);
const col = mongoose.connection.collection('certificate_metadata');

const totalMongo = await col.countDocuments();
const completed = await col.countDocuments({ extractionStatus: 'completed' });
const withSupplier = await col.countDocuments({ supplierName: { $type: 'string', $regex: /\S/ } });
const withExpiry = await col.countDocuments({ expiryDate: { $ne: null } });
const withLevel = await col.countDocuments({ bbbeeLevel: { $ne: null } });
const statusBreakdown = await col.aggregate([
  { $group: { _id: '$status', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();

const mongoBlobNames = new Set(
  (await col.find({}, { projection: { blobName: 1, _id: 0 } }).toArray())
    .map((d) => d.blobName)
    .filter(Boolean),
);

let azureBlobNames = [];
const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (conn) {
  const client = BlobServiceClient.fromConnectionString(conn);
  const container = client.getContainerClient('clients-certs');
  for await (const blob of container.listBlobsFlat()) {
    azureBlobNames.push(blob.name);
  }
}

const azureSet = new Set(azureBlobNames);
const mongoInAzure = [...mongoBlobNames].filter((b) => azureSet.has(b)).length;
const mongoNotInAzure = [...mongoBlobNames].filter((b) => !azureSet.has(b)).length;
const azureNotInMongo = azureBlobNames.filter((b) => !mongoBlobNames.has(b)).length;

// Sample azure blobs missing mongo metadata
const missingSamples = azureBlobNames.filter((b) => !mongoBlobNames.has(b)).slice(0, 5);

// Sample mongo docs with completed extraction but empty supplierName
const noSupplierCompleted = await col.find(
  { extractionStatus: 'completed', $or: [{ supplierName: null }, { supplierName: '' }] },
  { projection: { blobName: 1, fileName: 1, status: 1, bbbeeLevel: 1, expiryDate: 1 } },
).limit(5).toArray();

// Check legacy companyName field
const withCompanyName = await col.countDocuments({ companyName: { $type: 'string', $regex: /\S/ } });

console.log(JSON.stringify({
  mongo: { totalMongo, completed, withSupplier, withExpiry, withLevel, withCompanyName, statusBreakdown },
  azure: { totalBlobs: azureBlobNames.length },
  matching: { mongoInAzure, mongoNotInAzure, azureNotInMongo },
  missingSamples,
  noSupplierCompleted,
}, null, 2));

await mongoose.disconnect();
