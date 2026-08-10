#!/usr/bin/env tsx
/**
 * Compare a local certificate folder (a Google Drive export) against what is
 * already in Blob Storage, and report exactly what is NEW.
 *
 * Read-only by default. Pass --upload to actually upload the missing files.
 *
 * Matching is by NORMALISED FILE NAME, not path: the Drive export nests files in
 * year folders while storage is flat, and the same certificate must not be
 * uploaded twice because one copy sat in a subfolder. Names are compared
 * case-insensitively with runs of whitespace collapsed, because the archive is
 * full of double spaces ("2026 08 14 …", "2027 05 19  DHL …").
 *
 * Three outcomes per local file:
 *   new      — no blob with that name; upload it
 *   repair   — a blob exists but is ZERO BYTES while the local copy has content
 *   present  — already stored with content; skip (costs nothing, changes nothing)
 *
 * Usage (from apps/api):
 *   CERT_SOURCE_DIR="../../docs/Certificates" \
 *   AZURE_CERT_STORAGE_CONNECTION_STRING=... AZURE_STORAGE_CONTAINER_NAME=certificates \
 *   npx tsx scripts/compareLocalCertificates.ts [--upload]
 */
import { readdirSync, statSync, createReadStream } from 'fs';
import { join, basename, extname } from 'path';
import { getCertBlobServiceClient, getCertContainerClient } from '../src/services/azureCertStorage.js';

const SOURCE_DIR = process.env.CERT_SOURCE_DIR ?? '../../docs/Certificates';
const DO_UPLOAD = process.argv.includes('--upload');
const SUPPORTED = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

/** Case- and whitespace-insensitive key so nesting and double spaces don't create duplicates. */
function nameKey(fileName: string): string {
  return fileName.toLowerCase().replace(/\s+/g, ' ').trim();
}

interface LocalFile { path: string; fileName: string; size: number; }

function walk(dir: string, out: LocalFile[] = []): LocalFile[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, out); continue; }
    if (!entry.isFile()) continue;
    out.push({ path: full, fileName: entry.name, size: statSync(full).size });
  }
  return out;
}

function contentTypeFor(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

async function main() {
  const local = walk(SOURCE_DIR);
  console.log(`\nLocal source: ${SOURCE_DIR}`);
  console.log(`  files found: ${local.length}`);

  const supported = local.filter((f) => SUPPORTED.has(extname(f.fileName).toLowerCase()));
  const unsupported = local.filter((f) => !SUPPORTED.has(extname(f.fileName).toLowerCase()));
  const emptyLocal = supported.filter((f) => f.size === 0);
  console.log(`  supported types: ${supported.length}  (unsupported/no extension: ${unsupported.length})`);
  console.log(`  zero-byte locally (cannot help): ${emptyLocal.length}`);

  const container = getCertContainerClient(getCertBlobServiceClient()!);
  const blobs = new Map<string, { name: string; size: number }>();
  for await (const b of container.listBlobsFlat()) {
    blobs.set(nameKey(basename(b.name)), { name: b.name, size: b.properties.contentLength ?? 0 });
  }
  console.log(`\nBlob storage: ${blobs.size} distinct file names`);

  const toUpload: LocalFile[] = [];
  const toRepair: LocalFile[] = [];
  let present = 0;

  for (const f of supported) {
    const existing = blobs.get(nameKey(f.fileName));
    if (!existing) { toUpload.push(f); continue; }
    if (existing.size === 0 && f.size > 0) { toRepair.push(f); continue; }
    present += 1;
  }

  console.log('\n--- COMPARISON ---');
  console.log(`  already stored with content : ${present}`);
  console.log(`  NEW (not in storage)        : ${toUpload.length}`);
  console.log(`  REPAIR (stored but 0 bytes) : ${toRepair.length}`);
  console.log(`  local zero-byte, skip       : ${emptyLocal.length}`);

  const newBytes = toUpload.reduce((s, f) => s + f.size, 0) + toRepair.reduce((s, f) => s + f.size, 0);
  console.log(`  bytes to upload             : ${(newBytes / 1024 / 1024).toFixed(1)} MB`);

  for (const f of toUpload.slice(0, 10)) console.log(`     NEW    ${f.fileName}`);
  if (toUpload.length > 10) console.log(`     … and ${toUpload.length - 10} more`);
  for (const f of toRepair.slice(0, 10)) console.log(`     REPAIR ${f.fileName}`);

  if (!DO_UPLOAD) {
    console.log('\n(dry run — pass --upload to write these to Blob Storage)\n');
    return;
  }

  const work = [...toUpload, ...toRepair].filter((f) => f.size > 0);
  console.log(`\nUploading ${work.length} file(s)…`);
  let done = 0, failed = 0;
  for (const f of work) {
    try {
      const blobName = f.fileName; // storage is flat; keep the archive's own name
      await container.getBlockBlobClient(blobName).uploadStream(
        createReadStream(f.path), 4 * 1024 * 1024, 4,
        { blobHTTPHeaders: { blobContentType: contentTypeFor(f.fileName) } },
      );
      done += 1;
      if (done % 50 === 0) console.log(`   ${done}/${work.length}`);
    } catch (err) {
      failed += 1;
      console.error(`   FAILED ${f.fileName}: ${(err as Error).message}`);
    }
  }
  console.log(`\nuploaded ${done}, failed ${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
