#!/usr/bin/env tsx
/**
 * PROBE: does prebuilt-layout actually solve field bleed?
 *
 * The bleed hypothesis is that a flat PDF text stream loses the association
 * between a label and its value, so "the first VAT after the word VAT" is
 * sometimes the verification agency's. If that is right, a model that returns
 * key/value pairs and table cells should attach the RIGHT VAT to the supplier.
 *
 * This takes a certificate we know is wrong (its VAT is shared with other
 * companies), runs prebuilt-layout with the keyValuePairs feature, and prints
 * what comes back — before any of it is wired into the pipeline.
 *
 * Read-only. Costs a handful of pages.
 */
import mongoose from 'mongoose';
import { getCertBlobServiceClient, getCertContainerClient } from '../src/services/azureCertStorage.js';

const ENDPOINT = (process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? '').replace(/\/$/, '');
const KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ?? '';
const SAMPLE = Number(process.env.SAMPLE ?? 2);

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

async function analyseLayout(buffer: Buffer): Promise<any> {
  // prebuilt-document is the model that returns keyValuePairs on this API
  // version; on prebuilt-layout it is rejected as an unsupported feature.
  const url = `${ENDPOINT}/formrecognizer/documentModels/prebuilt-document:analyze`
    + '?api-version=2023-07-31';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/pdf' },
    body: new Uint8Array(buffer),
  });
  if (res.status !== 202) throw new Error(`analyze -> ${res.status} ${await res.text()}`);
  const opLocation = res.headers.get('operation-location');
  if (!opLocation) throw new Error('no operation-location header');

  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(opLocation, { headers: { 'Ocp-Apim-Subscription-Key': KEY } });
    const body = await poll.json() as any;
    if (body.status === 'succeeded') return body.analyzeResult;
    if (body.status === 'failed') throw new Error(`analysis failed: ${JSON.stringify(body.error)}`);
  }
  throw new Error('timed out polling');
}

async function main() {
  if (!ENDPOINT || !KEY) throw new Error('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/KEY required');
  await mongoose.connect(process.env.MONGODB_URI!);
  const col = mongoose.connection.db!.collection('certificate_metadata');

  // Pick certificates whose VAT is shared with other companies — the known-bad set.
  const shared = await col.aggregate([
    { $match: { vatNumber: { $nin: [null, ''] }, blobName: { $nin: [null, ''] } } },
    { $group: { _id: '$vatNumber', companies: { $addToSet: '$supplierName' }, docs: { $push: { blobName: '$blobName', supplierName: '$supplierName', vatNumber: '$vatNumber' } } } },
    { $project: { docs: 1, companyCount: { $size: '$companies' } } },
    { $match: { companyCount: { $gt: 3 } } },
    { $sort: { companyCount: -1 } },
    { $limit: SAMPLE },
  ]).toArray();

  const container = getCertContainerClient(getCertBlobServiceClient()!);

  for (const group of shared) {
    const pick = (group.docs as any[])[0];
    console.log(`\n${'='.repeat(70)}`);
    console.log(`FILE      : ${pick.blobName}`);
    console.log(`SUPPLIER  : ${pick.supplierName}`);
    console.log(`VAT NOW   : ${pick.vatNumber}  <-- shared with ${group.companyCount} companies`);
    console.log('='.repeat(70));

    const dl = await container.getBlobClient(pick.blobName).download();
    const buf = await streamToBuffer(dl.readableStreamBody as NodeJS.ReadableStream);
    if (buf.length === 0) { console.log('  (zero-byte file, skipping)'); continue; }

    const result = await analyseLayout(buf);
    const kvps = (result.keyValuePairs ?? []) as any[];
    console.log(`\n  keyValuePairs returned: ${kvps.length}`);
    for (const kv of kvps) {
      const k = String(kv.key?.content ?? '').replace(/\s+/g, ' ').trim();
      const v = String(kv.value?.content ?? '').replace(/\s+/g, ' ').trim();
      if (!k) continue;
      if (/vat|registration|company|entity|name|level|b-bbee|bbbee|owner|expir|valid|certificate/i.test(k)) {
        console.log(`    ${k.slice(0, 42).padEnd(44)} => ${v.slice(0, 60)}`);
      }
    }
    console.log(`\n  tables: ${(result.tables ?? []).length}, pages: ${(result.pages ?? []).length}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
