const { BlobServiceClient } = require('@azure/storage-blob');

async function count(name, client) {
  const cc = client.getContainerClient(name);
  if (!(await cc.exists())) return { name, exists: false };
  let count = 0;
  const sample = [];
  for await (const blob of cc.listBlobsFlat()) {
    count++;
    if (sample.length < 5) sample.push(blob.name);
  }
  return { name, exists: true, count, sample };
}

async function main() {
  const conn = process.argv[2];
  if (!conn) throw new Error('usage: node count-containers.cjs <connectionString>');
  const client = BlobServiceClient.fromConnectionString(conn);
  const names = ['clients-certs', 'certificates', 'certificatees'];
  const out = [];
  for (const name of names) {
    out.push(await count(name, client));
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
