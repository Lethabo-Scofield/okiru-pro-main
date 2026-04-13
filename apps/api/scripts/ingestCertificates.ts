#!/usr/bin/env tsx
import { BlobServiceClient } from '@azure/storage-blob';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, readdirSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Tesseract from 'tesseract.js';
import { ensureIndex, uploadDocuments, type CertificateSearchDocument } from '../src/services/azureSearch.js';

const CONTAINER_NAME = 'clients-certs';
const CHUNK_SIZE = 1000;
const UPLOAD_BATCH_SIZE = 50;
const TMP_DIR = join(tmpdir(), 'cert-ingest');

function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return chunks;

  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);
    if (end < cleaned.length) {
      const lastSpace = cleaned.lastIndexOf(' ', end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }
    chunks.push(cleaned.substring(start, end).trim());
    start = end;
  }

  return chunks.filter(c => c.length > 0);
}

function makeId(blobName: string, chunkIndex: number): string {
  return createHash('md5').update(`${blobName}:${chunkIndex}`).digest('hex');
}

function extractUserIdFromPath(blobName: string): string {
  const parts = blobName.split('/');
  return parts.length > 1 ? parts[0] : 'global';
}

function extractFileName(blobName: string): string {
  const parts = blobName.split('/');
  return parts[parts.length - 1];
}

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdf = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');
      pages.push(pageText);
    }

    return pages.join('\n');
  } catch {
    return '';
  }
}

async function ocrPdf(pdfBuffer: Buffer, fileName: string): Promise<string> {
  const workDir = join(TMP_DIR, createHash('md5').update(fileName).digest('hex'));
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  const pdfPath = join(workDir, 'input.pdf');
  writeFileSync(pdfPath, pdfBuffer);

  try {
    const outputPrefix = join(workDir, 'page');
    execSync(`pdftoppm -png -r 200 -l 3 "${pdfPath}" "${outputPrefix}"`, {
      timeout: 30000,
      stdio: 'pipe',
    });

    const imageFiles = readdirSync(workDir)
      .filter(f => f.startsWith('page') && f.endsWith('.png'))
      .sort();

    if (imageFiles.length === 0) return '';

    const allText: string[] = [];
    for (const imgFile of imageFiles) {
      const imgPath = join(workDir, imgFile);
      try {
        const result = await Tesseract.recognize(imgPath, 'eng', {
          logger: () => {},
        });
        if (result.data.text.trim()) {
          allText.push(result.data.text.trim());
        }
      } catch {
        // skip failed page
      }
    }

    return allText.join('\n');
  } catch {
    return '';
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  console.log('=== Certificate Ingestion Script (with OCR) ===\n');

  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) {
    console.error('AZURE_STORAGE_CONNECTION_STRING is not set');
    process.exit(1);
  }

  if (!process.env.AZURE_SEARCH_ENDPOINT || !process.env.AZURE_SEARCH_API_KEY || !process.env.AZURE_SEARCH_INDEX_NAME) {
    console.error('Azure AI Search environment variables are not set');
    process.exit(1);
  }

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  console.log('1. Ensuring search index exists...');
  await ensureIndex();
  console.log('   Index ready.\n');

  console.log('2. Connecting to Azure Blob Storage...');
  const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  console.log(`   Container: ${CONTAINER_NAME}\n`);

  console.log('3. Listing and processing PDFs (with OCR fallback)...');
  let pendingDocs: CertificateSearchDocument[] = [];
  let totalBlobs = 0;
  let textExtracted = 0;
  let ocrExtracted = 0;
  let noTextFound = 0;
  let skippedNonPdf = 0;
  let totalChunksUploaded = 0;

  for await (const blob of containerClient.listBlobsFlat()) {
    totalBlobs++;
    const blobName = blob.name;

    if (!blobName.toLowerCase().endsWith('.pdf')) {
      skippedNonPdf++;
      continue;
    }

    const fileName = extractFileName(blobName);

    try {
      const blobClient = containerClient.getBlobClient(blobName);
      const downloadResponse = await blobClient.download();
      const chunks: Buffer[] = [];
      if (downloadResponse.readableStreamBody) {
        for await (const chunk of downloadResponse.readableStreamBody as any) {
          chunks.push(Buffer.from(chunk));
        }
      }
      const buffer = Buffer.concat(chunks);

      let text = await extractTextFromPdf(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      let method = 'text';

      if (!text.trim()) {
        console.log(`   [OCR] ${fileName}...`);
        text = await ocrPdf(buffer, blobName);
        method = 'ocr';
      }

      const combinedText = `${fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')} ${text}`.trim();

      if (!combinedText || combinedText.length < 5) {
        noTextFound++;
        console.log(`   [SKIP] ${fileName} — no text after OCR`);
        continue;
      }

      const textChunks = chunkText(combinedText, CHUNK_SIZE);
      const userId = extractUserIdFromPath(blobName);

      if (method === 'ocr') {
        ocrExtracted++;
        console.log(`   [OK-OCR] ${fileName} — ${text.length} chars, ${textChunks.length} chunks`);
      } else {
        textExtracted++;
      }

      for (let i = 0; i < textChunks.length; i++) {
        pendingDocs.push({
          id: makeId(blobName, i),
          document_id: blobName,
          user_id: userId,
          file_name: fileName,
          content: textChunks[i],
          file_url: blobName,
        });
      }

      if (pendingDocs.length >= UPLOAD_BATCH_SIZE) {
        await uploadDocuments(pendingDocs);
        totalChunksUploaded += pendingDocs.length;
        console.log(`   >>> Uploaded batch (${totalChunksUploaded} chunks so far)`);
        pendingDocs = [];
      }
    } catch (err: any) {
      console.error(`   [ERR] ${fileName}: ${err.message || err}`);
    }
  }

  if (pendingDocs.length > 0) {
    await uploadDocuments(pendingDocs);
    totalChunksUploaded += pendingDocs.length;
    console.log(`   >>> Uploaded final batch (${totalChunksUploaded} chunks total)`);
  }

  console.log(`\n4. Summary:`);
  console.log(`   Total blobs: ${totalBlobs}`);
  console.log(`   Text-extracted PDFs: ${textExtracted}`);
  console.log(`   OCR-extracted PDFs: ${ocrExtracted}`);
  console.log(`   No text found: ${noTextFound}`);
  console.log(`   Non-PDFs skipped: ${skippedNonPdf}`);
  console.log(`   Total chunks indexed: ${totalChunksUploaded}`);
  console.log('\n=== Ingestion Complete ===');

  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}

main().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
