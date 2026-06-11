db = db.getSiblingDB('okiru');
print('total', db.certificate_metadata.countDocuments());
print('completed', db.certificate_metadata.countDocuments({ extractionStatus: 'completed' }));
print('withSupplier', db.certificate_metadata.countDocuments({ supplierName: { $regex: /\S/ } }));
print('noSupplierCompleted', db.certificate_metadata.countDocuments({
  extractionStatus: 'completed',
  $or: [{ supplierName: null }, { supplierName: '' }, { supplierName: { $exists: false } }],
}));
print('withLevel', db.certificate_metadata.countDocuments({ bbbeeLevel: { $ne: null } }));
print('withExpiry', db.certificate_metadata.countDocuments({ expiryDate: { $ne: null } }));
print('withCompanyName', db.certificate_metadata.countDocuments({ companyName: { $regex: /\S/ } }));
printjson(db.certificate_metadata.aggregate([
  { $group: { _id: '$status', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray());
printjson(db.certificate_metadata.find(
  { extractionStatus: 'completed', $or: [{ supplierName: null }, { supplierName: '' }] },
  { blobName: 1, fileName: 1, status: 1, bbbeeLevel: 1, expiryDate: 1, _id: 0 },
).limit(3).toArray());
