/**
 * PDF Vision Extractor
 * 
 * Two modes:
 * 1. Scanned PDF OCR: Full entity extraction from image-only PDFs
 * 2. Digital PDF Vision: Table-aware extraction from readable PDFs that have
 *    complex tabular layouts (scorecards, EE reports, financial statements)
 *    where pdfjs.getTextContent() loses column structure
 */

import { createLogger } from '../../src/logger.js';
import { AzureOpenAIClient, isAzureOpenAIConfigured } from './azureOpenAIClient.js';

const logger = createLogger("VisionPdfExtractor");

const MIN_TEXT_THRESHOLD = 50;

export interface VisionExtractionResult {
  pageId: string;
  text: string;
  entities: Array<{
    name: string;
    value: string;
    confidence: number;
  }>;
  metadata: {
    pageNumber: number;
    type: 'vision' | 'vision_table';
    ocrConfidence: number;
  };
}

export interface VisionTableResult {
  pageNumber: number;
  tables: Array<{
    title: string;
    headers: string[];
    rows: Array<Record<string, any>>;
    pillarHint: string;
  }>;
  rawText: string;
}

/**
 * Check if extracted text is likely from a scanned/image PDF
 */
export function isScannedPdf(text: string): boolean {
  // If text is very short or contains only whitespace/newlines
  const cleanedText = text.replace(/\s+/g, ' ').trim();
  return cleanedText.length < MIN_TEXT_THRESHOLD;
}

/**
 * Convert PDF buffer to base64-encoded images
 * Uses pdf2pic to convert PDF pages to PNG images
 */
export async function pdfToBase64Images(
  buffer: Buffer,
  maxPages: number = 10
): Promise<Array<{ pageNumber: number; base64: string }>> {
  logger.info(`Converting PDF to images (max ${maxPages} pages)`);
  
  try {
    // Use pdf2pic for reliable PDF to image conversion
    const { fromBuffer } = await import('pdf2pic');
    
    const options = {
      density: 150,  // DPI for good OCR quality
      format: 'png' as const,
      width: 1654,   // A4 at 150 DPI width
      height: 2339,  // A4 at 150 DPI height
      quality: 90,
    };
    
    const convert = fromBuffer(buffer, options);
    
    // Convert first N pages
    const pagesToConvert = Math.min(maxPages, 20);
    const images: Array<{ pageNumber: number; base64: string }> = [];
    
    for (let i = 1; i <= pagesToConvert; i++) {
      try {
        const result = await convert(i, { responseType: 'base64' });
        if (result && result.base64) {
          images.push({ pageNumber: i, base64: result.base64 });
          logger.debug(`Converted page ${i} to base64 image`);
        }
      } catch (pageErr) {
        logger.error(`Failed to convert page ${i}`, pageErr);
        // Continue to next page
      }
    }
    
    logger.info(`Converted ${images.length} pages to images`);
    return images;
  } catch (err) {
    logger.error('PDF to image conversion failed', err);
    throw err;
  }
}

/**
 * Extract entities from a single page image using GPT-4o Vision
 */
export async function extractFromImage(
  base64Image: string,
  pageNumber: number,
  sectorCode: string,
  entityManifest: any
): Promise<VisionExtractionResult> {
  const client = new AzureOpenAIClient();
  
  // Get entity list from manifest
  const entityNames = entityManifest?.entities?.map((e: any) => e.name) || [];
  
  const prompt = `
You are a B-BBEE (Broad-Based Black Economic Empowerment) document OCR and entity extraction system.

TASK: Extract all text from this scanned PDF page using OCR, then identify and extract the following B-BBEE entities:
${entityNames.map((name: string) => `- ${name}`).join('\n')}

INSTRUCTIONS:
1. First, perform OCR to read all visible text on the page
2. Identify which B-BBEE entities are present
3. Extract the exact values with high precision
4. Return a structured JSON response

SECTOR: ${sectorCode || 'Generic'}

RESPONSE FORMAT:
{
  "ocrText": "the full OCR text extracted from the page",
  "entities": [
    {
      "name": "exact entity name from the list above",
      "value": "extracted value",
      "confidence": 0.95
    }
  ],
  "ocrConfidence": 0.92
}

RULES:
- Only include entities that are actually present on the page
- Use high confidence scores (>0.8) for clearly readable text
- Use lower confidence (0.5-0.7) for partially obscured text
- Return empty entities array if no entities found
- Extract financial figures, percentages, names, dates exactly as shown
`;

  try {
    logger.debug(`Sending page ${pageNumber} to GPT-4o Vision`);
    
    const response = await client.chat.completions.create({
      model: client.deploymentName,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content);
    
    logger.info(`Vision extraction for page ${pageNumber}: ${result.entities?.length || 0} entities found`);
    
    return {
      pageId: `page_${pageNumber}`,
      text: result.ocrText || '',
      entities: result.entities || [],
      metadata: {
        pageNumber,
        type: 'vision',
        ocrConfidence: result.ocrConfidence || 0.8
      }
    };
  } catch (err) {
    logger.error(`Vision extraction failed for page ${pageNumber}`, err);
    return {
      pageId: `page_${pageNumber}`,
      text: '',
      entities: [],
      metadata: {
        pageNumber,
        type: 'vision',
        ocrConfidence: 0
      }
    };
  }
}

/**
 * Main entry point for scanned PDF extraction (OCR mode)
 */
export async function extractFromScannedPdf(
  buffer: Buffer,
  sectorCode: string,
  scorecardType: string,
  entityManifest: any
): Promise<Array<VisionExtractionResult>> {
  logger.info(`Starting vision OCR for scanned PDF (${sectorCode}, ${scorecardType})`);
  
  try {
    const images = await pdfToBase64Images(buffer, 10);
    
    if (images.length === 0) {
      logger.warn('No pages could be converted to images');
      return [];
    }
    
    const results: Array<VisionExtractionResult> = [];
    for (const image of images) {
      const result = await extractFromImage(
        image.base64,
        image.pageNumber,
        sectorCode,
        entityManifest
      );
      results.push(result);
    }
    
    logger.info(`Vision OCR complete: ${results.length} pages processed`);
    return results;
  } catch (err) {
    logger.error('Vision OCR pipeline failed', err);
    throw err;
  }
}

/**
 * Check if a digital PDF page likely contains tabular data worth sending to vision.
 * Heuristic: pages with keywords like "scorecard", "schedule", "report", table-like 
 * patterns (multiple columns of numbers), or very short fragmented text per line.
 */
function isTablePage(text: string): boolean {
  const lower = text.toLowerCase();
  const tableKeywords = [
    'scorecard', 'schedule', 'report', 'summary', 'breakdown',
    'target', 'actual', 'points', 'indicator', 'criteria', 'weighting',
    'designation', 'headcount', 'race', 'gender', 'level',
    'supplier', 'spend', 'contribution', 'ownership',
    'board', 'executive', 'senior', 'middle', 'junior',
    'african', 'coloured', 'indian', 'white',
    'b-bbee', 'bbbee', 'bee level', 'recognition',
  ];
  
  const keywordHits = tableKeywords.filter(kw => lower.includes(kw)).length;
  if (keywordHits >= 3) return true;

  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const numberHeavyLines = lines.filter(l => {
    const nums = l.match(/\d+[\.,]?\d*/g);
    return nums && nums.length >= 3;
  });
  if (numberHeavyLines.length >= 3) return true;

  return false;
}

/**
 * Extract structured tables from a digital PDF page image using GPT-4o Vision.
 * Unlike OCR mode, this preserves column headers, row alignment, and table structure.
 */
async function extractTablesFromPageImage(
  base64Image: string,
  pageNumber: number,
  textHint: string
): Promise<VisionTableResult> {
  const client = new AzureOpenAIClient();

  const prompt = `You are a B-BBEE document table extraction system. Analyze this PDF page image and extract ALL tables visible on the page.

CONTEXT: This is a B-BBEE (Broad-Based Black Economic Empowerment) document. Pages may contain:
- Scorecards (Ownership, Management Control, Skills Development, Procurement, ESD, SED)
- Employee lists with Race, Gender, Designation columns
- Shareholder registers with ownership percentages
- Financial summaries (Revenue, NPAT, Payroll)
- Supplier lists with BEE levels and spend amounts
- Training/skills program lists

EXISTING TEXT EXTRACTION (may have lost column alignment):
${textHint.slice(0, 2000)}

TASK: Look at the actual visual layout in the image. For each table you see:
1. Identify the table title/heading
2. Extract column headers exactly as shown
3. Extract each data row preserving column alignment
4. Classify which B-BBEE pillar this table relates to

RESPONSE FORMAT (JSON):
{
  "tables": [
    {
      "title": "Management Control Scorecard",
      "headers": ["Name", "Race", "Gender", "Designation", "Voting Rights %"],
      "rows": [
        {"Name": "John Smith", "Race": "White", "Gender": "Male", "Designation": "Executive Director", "Voting Rights %": "25"},
        ...
      ],
      "pillarHint": "employees"
    }
  ],
  "rawText": "full text visible on page preserving layout as best as possible"
}

PILLAR HINTS: Use one of: employees, shareholders, suppliers, contributions, trainingPrograms, financials, ownershipFinancials, irrelevant

RULES:
- Preserve exact numbers, percentages, and currency values
- Keep column alignment — each row object must have the same keys as headers
- If a cell is empty, use "" (empty string)
- Extract ALL tables on the page, not just the first one
- For merged header cells, repeat the parent header as prefix (e.g. "Black Male", "Black Female")`;

  try {
    logger.info(`[VisionTable] Sending page ${pageNumber} to GPT-4o Vision for table extraction`);

    const response = await client.chat.completions.create({
      model: client.deploymentName,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      temperature: 0,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content);

    const tables = (result.tables || []).map((t: any) => ({
      title: t.title || '',
      headers: Array.isArray(t.headers) ? t.headers : [],
      rows: Array.isArray(t.rows) ? t.rows : [],
      pillarHint: t.pillarHint || 'irrelevant',
    }));

    logger.info(`[VisionTable] Page ${pageNumber}: ${tables.length} tables extracted`);

    return {
      pageNumber,
      tables,
      rawText: result.rawText || '',
    };
  } catch (err) {
    logger.error(`[VisionTable] Failed for page ${pageNumber}`, err);
    return { pageNumber, tables: [], rawText: '' };
  }
}

/**
 * Vision-enhanced extraction for digital PDFs.
 * Renders pages with tabular content to images and uses GPT-4o Vision
 * to extract structured tables that pdfjs text extraction misses.
 *
 * Returns enhanced page data alongside the original text extraction.
 */
export async function extractTablesFromDigitalPdf(
  buffer: Buffer,
  textPages: Array<{ pageId: string; text: string; metadata?: Record<string, any> }>,
  maxVisionPages: number = 15
): Promise<VisionTableResult[]> {
  if (!isAzureOpenAIConfigured()) {
    logger.warn('[VisionTable] Azure OpenAI not configured, skipping vision extraction');
    return [];
  }

  const candidatePages = textPages
    .map((p, idx) => ({ ...p, index: idx, pageNum: idx + 1 }))
    .filter(p => isTablePage(p.text));

  if (candidatePages.length === 0) {
    logger.info('[VisionTable] No table-heavy pages detected, skipping vision extraction');
    return [];
  }

  const pagesToProcess = candidatePages.slice(0, maxVisionPages);
  logger.info(`[VisionTable] ${pagesToProcess.length}/${textPages.length} pages identified as table-heavy, rendering to images`);

  let images: Array<{ pageNumber: number; base64: string }>;
  try {
    images = await pdfToBase64Images(buffer, Math.max(...pagesToProcess.map(p => p.pageNum)));
  } catch (err) {
    logger.error('[VisionTable] PDF to image conversion failed', err);
    return [];
  }

  const results: VisionTableResult[] = [];
  for (const page of pagesToProcess) {
    const image = images.find(img => img.pageNumber === page.pageNum);
    if (!image) continue;

    const result = await extractTablesFromPageImage(
      image.base64,
      page.pageNum,
      page.text
    );

    if (result.tables.length > 0) {
      results.push(result);
    }
  }

  const totalTables = results.reduce((sum, r) => sum + r.tables.length, 0);
  logger.info(`[VisionTable] Digital PDF vision complete: ${totalTables} tables from ${results.length} pages`);

  return results;
}
