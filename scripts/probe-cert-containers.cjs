const { BlobServiceClient } = require('/app/apps/api/node_modules/@azure/storage-blob');

const CANDIDATES = [
  'clients-certs',
  'client-certs',
  'clientcerts',
  'client-certs',
  'client certs',
  'clients-certs',
  'certificates',
  'certs',
  'client_certs',
  'clients_certs',
];

async function countBlobs(containerClient) {
  let n = 0;
  const sample = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    n++;
    if (sample.length < 5) sample.push(blob.name);
  }
  return { count: n, sample };
}

async function main() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  console.log('accountName env:', account || '(unset)');
  if (!conn) {
    console.error('No AZURE_STORAGE_CONNECTION_STRING');
    process.exit(1);
  }
  const match = conn.match(/AccountName=([^;]+)/);
  console.log('conn account:', match ? match[1] : 'unknown');

  const client = BlobServiceClient.fromConnectionString(conn);
  const results = [];
  for (const name of CANDIDATES) {
    try {
      const cc = client.getContainerClient(name);
      const exists = await cc.exists();
      if (!exists) {
        results.push({ name, exists: false });
        continue;
      }
      const { count, sample } = await countBlobs(cc);
      results.push({ name, exists: true, count, sample });
    } catch (err) {
      results.push({ name, error: err.message || String(err) });
    }
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
