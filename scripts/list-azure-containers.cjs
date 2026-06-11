const { BlobServiceClient } = require('/app/apps/api/node_modules/@azure/storage-blob');

async function countBlobs(containerClient) {
  let n = 0;
  let sample = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    n++;
    if (sample.length < 3) sample.push(blob.name);
  }
  return { count: n, sample };
}

async function main() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) {
    console.error('No AZURE_STORAGE_CONNECTION_STRING');
    process.exit(1);
  }
  const client = BlobServiceClient.fromConnectionString(conn);
  const results = [];
  for await (const item of client.listContainers()) {
    const cc = client.getContainerClient(item.name);
    const { count, sample } = await countBlobs(cc);
    results.push({ name: item.name, count, sample });
  }
  results.sort((a, b) => b.count - a.count);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
