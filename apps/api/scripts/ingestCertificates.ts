#!/usr/bin/env tsx
import { BlobServiceClient } from '@azure/storage-blob';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { createHash } from 'crypto';
import { ensureIndex, uploadDocuments, type CertificateSearchDocument } from '../src/services/azureSearch.js';

GlobalWorkerOptions.workerSrc = undefined as any;

const CONTAINER_NAME = 'clients-certs';
const CHUNK_SIZE = 1000;

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
  const hash = createHash('md5').update(`${blobName}:${chunkIndex}`).digest('hex');
  return hash;
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
  } catch (err) {
    console.error('Failed to extract PDF text:', err);
    return '';
  }
}

async function main() {
  console.log('=== Certificate Ingestion Script ===\n');

  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) {
    console.error('AZURE_STORAGE_CONNECTION_STRING is not set');
    process.exit(1);
  }

  if (!process.env.AZURE_SEARCH_ENDPOINT || !process.env.AZURE_SEARCH_API_KEY || !process.env.AZURE_SEARCH_INDEX_NAME) {
    console.error('Azure AI Search environment variables are not set (AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY, AZURE_SEARCH_INDEX_NAME)');
    process.exit(1);
  }

  console.log('1. Ensuring search index exists...');
  await ensureIndex();
  console.log('   Index ready.\n');

  console.log('2. Connecting to Azure Blob Storage...');
  const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  console.log(`   Container: ${CONTAINER_NAME}\n`);

  console.log('3. Listing and processing PDFs...');
  const allDocuments: CertificateSearchDocument[] = [];
  let totalBlobs = 0;
  let processedPdfs = 0;
  let skippedNonPdf = 0;

  for await (const blob of containerClient.listBlobsFlat()) {
    totalBlobs++;
    const blobName = blob.name;

    if (!blobName.toLowerCase().endsWith('.pdf')) {
      skippedNonPdf++;
      console.log(`   [SKIP] ${blobName} (not a PDF)`);
      continue;
    }

    console.log(`   [PROCESSING] ${blobName}...`);

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

      const text = await extractTextFromPdf(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      if (!text.trim()) {
        console.log(`     -> No text extracted (scanned/image PDF?)`);
        continue;
      }

      const textChunks = chunkText(text, CHUNK_SIZE);
      const userId = extractUserIdFromPath(blobName);
      const fileName = extractFileName(blobName);

      console.log(`     -> Extracted ${text.length} chars, ${textChunks.length} chunks`);

      for (let i = 0; i < textChunks.length; i++) {
        allDocuments.push({
          id: makeId(blobName, i),
          document_id: blobName,
          user_id: userId,
          file_name: fileName,
          content: textChunks[i],
          file_url: blobName,
        });
      }

      processedPdfs++;
    } catch (err) {
      console.error(`     -> Error processing ${blobName}:`, err);
    }
  }

  console.log(`\n4. Summary:`);
  console.log(`   Total blobs: ${totalBlobs}`);
  console.log(`   PDFs processed: ${processedPdfs}`);
  console.log(`   Non-PDFs skipped: ${skippedNonPdf}`);
  console.log(`   Total chunks: ${allDocuments.length}\n`);

  if (allDocuments.length > 0) {
    console.log('5. Uploading chunks to Azure AI Search...');
    await uploadDocuments(allDocuments);
    console.log('   Upload complete!\n');
  } else {
    console.log('5. No documents to upload.\n');
  }

  console.log('=== Ingestion Complete ===');
}

main().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
