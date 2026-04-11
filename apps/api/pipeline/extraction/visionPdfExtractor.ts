/**
 * Scanned PDF Vision Extractor
 * 
 * Uses GPT-4o Vision to OCR and extract entities from scanned/image PDFs
 * Falls back to this when pdfjs text extraction returns empty/insufficient content
 */

import { createLogger } from '../../src/logger.js';
import { AzureOpenAIClient } from './azureOpenAIClient.js';

const logger = createLogger("VisionPdfExtractor");

// Minimum text threshold to trigger vision mode (characters per page)
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
    type: 'vision';
    ocrConfidence: number;
  };
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
      model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
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
 * Main entry point for vision-based PDF extraction
 */
export async function extractFromScannedPdf(
  buffer: Buffer,
  sectorCode: string,
  scorecardType: string,
  entityManifest: any
): Promise<Array<VisionExtractionResult>> {
  logger.info(`Starting vision extraction for scanned PDF (${sectorCode}, ${scorecardType})`);
  
  try {
    // Convert PDF to images
    const images = await pdfToBase64Images(buffer, 10);
    
    if (images.length === 0) {
      logger.warn('No pages could be converted to images');
      return [];
    }
    
    // Extract from each page
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
    
    logger.info(`Vision extraction complete: ${results.length} pages processed`);
    return results;
  } catch (err) {
    logger.error('Vision extraction pipeline failed', err);
    throw err;
  }
}
