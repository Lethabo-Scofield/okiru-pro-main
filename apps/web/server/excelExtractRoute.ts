/**
 * POST /api/extract-excel
 *
 * Hybrid Excel/CSV extraction pipeline:
 *   1. PRIMARY: Row/column structured extraction via excelParser (fast, deterministic)
 *   2. SECONDARY: Full-chunk LLM NER via the pipeline (Groq llama-3.3-70b-versatile)
 *      - Each sheet is serialised to a text chunk
 *      - BM25 + entity-manifest retrieval selects the most relevant chunks per entity
 *      - LLM extracts with anti-hallucination structural verification
 *
 * Request body (JSON):
 *   {
 *     fileBase64: string,          // base64-encoded .xlsx / .xls / .csv
 *     fileName: string,            // original filename (used for MIME detection)
 *     sectorCode?: string,         // "RCOGP" | "ICT" | "FSC" | "AGRI" (default "RCOGP")
 *     scorecardType?: string,      // "Generic" | "QSE" | "EME" (default "Generic")
 *     entities?: Array<{           // custom entity list (overrides manifest)
 *       label: string;
 *       definition?: string;
 *       aliases?: string[];
 *       positiveExamples?: string[];
 *       negativeExamples?: string[];
 *       zones?: string[];
 *     }>;
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     structured: ParseResult,          // raw excelParser output (row/col extraction)
 *     llmExtractions: LLMExtractionResult[],  // per-entity LLM results
 *     merged: Record<string, any>,      // structured fields merged with LLM overrides
 *     sheetChunks: SheetChunk[],        // text representation of each sheet
 *     stats: { ... }
 *   }
 */

import type { Express, Request, Response } from 'express';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SheetChunk {
    sheetName: string;
    sheetIndex: number;
    text: string;
    rowCount: number;
    colCount: number;
    detectedType: string | null;
}

interface CustomEntity {
    label: string;
    definition?: string;
    aliases?: string[];
    positiveExamples?: string[];
    negativeExamples?: string[];
    zones?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a single worksheet to a structured text representation.
 * Format: "SheetName\n\nHeader1 | Header2 | Header3\nval1 | val2 | val3\n..."
 * This preserves row/column structure so the LLM can reason about it.
 */
function sheetToText(workbook: XLSX.WorkBook, sheetName: string): SheetChunk {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
        return { sheetName, sheetIndex: 0, text: '', rowCount: 0, colCount: 0, detectedType: null };
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

    // Remove completely empty rows
    const nonEmptyRows = rows.filter(row =>
        row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );

    if (nonEmptyRows.length === 0) {
        return { sheetName, sheetIndex: 0, text: `[Sheet: ${sheetName}]\n(empty)`, rowCount: 0, colCount: 0, detectedType: null };
    }

    // Determine max columns
    const maxCols = Math.max(...nonEmptyRows.map(r => r.length));

    // Build text: each row as pipe-separated values
    const lines: string[] = [`[Sheet: ${sheetName}]`, ''];
    for (const row of nonEmptyRows) {
        const cells = Array.from({ length: maxCols }, (_, i) => {
            const v = row[i];
            if (v === null || v === undefined || String(v).trim() === '') return '';
            // Format numbers nicely
            if (typeof v === 'number') {
                if (Number.isInteger(v)) return String(v);
                return v.toFixed(2);
            }
            return String(v).trim();
        });
        // Skip rows that are all empty after formatting
        if (cells.every(c => c === '')) continue;
        lines.push(cells.join(' | '));
    }

    const text = lines.join('\n');

    // Detect content type from text
    const lower = text.toLowerCase();
    let detectedType: string | null = null;
    if (/shareholder|shareholding|voting\s*right|economic\s*interest|black\s*own/i.test(lower)) detectedType = 'ownership';
    else if (/employee|personnel|staff|occupational\s*level|management\s*control/i.test(lower)) detectedType = 'management';
    else if (/supplier|vendor|procurement|preferential|b-?bbee\s*level/i.test(lower)) detectedType = 'procurement';
    else if (/training|learnership|bursary|skills?\s*development/i.test(lower)) detectedType = 'skills';
    else if (/enterprise.*develop|supplier.*develop|esd/i.test(lower)) detectedType = 'esd';
    else if (/socio.economic|sed|social\s*development|csi/i.test(lower)) detectedType = 'sed';
    else if (/revenue|turnover|npat|net\s*profit|leviable|financial/i.test(lower)) detectedType = 'financials';
    else if (/company\s*name|client\s*name|entity\s*name|registration|vat/i.test(lower)) detectedType = 'client';

    return {
        sheetName,
        sheetIndex: 0,
        text,
        rowCount: nonEmptyRows.length,
        colCount: maxCols,
        detectedType,
    };
}

/**
 * Build LLM extraction requests from either a custom entity list or the sector manifest.
 * Each entity gets the most relevant sheet chunk(s) as its source text.
 */
function buildExtractionRequests(
    entities: CustomEntity[],
    sheetChunks: SheetChunk[],
    combinedText: string
): Array<{
    entityName: string;
    entityType: string;
    definition: string;
    aliases: string[];
    positiveExamples: string[];
    negativeExamples: string[];
    zones: string[];
    sourceText: string;
    sourcePageId: string;
}> {
    return entities.map(entity => {
        // Find the most relevant chunk(s) for this entity
        // Simple BM25-style: score each chunk by term overlap
        const queryTerms = [
            entity.label.toLowerCase(),
            ...(entity.aliases || []).map(a => a.toLowerCase()),
            ...(entity.zones || []).map(z => z.toLowerCase()),
        ];

        let bestChunk: SheetChunk | null = null;
        let bestScore = -1;

        for (const chunk of sheetChunks) {
            if (!chunk.text) continue;
            const chunkLower = chunk.text.toLowerCase();
            let score = 0;
            for (const term of queryTerms) {
                if (!term) continue;
                // Count occurrences
                let pos = 0;
                while ((pos = chunkLower.indexOf(term, pos)) !== -1) {
                    score++;
                    pos += term.length;
                }
            }
            // Boost if detected type matches entity zones
            if (chunk.detectedType && entity.zones) {
                for (const zone of entity.zones) {
                    if (zone.toLowerCase().includes(chunk.detectedType) || chunk.detectedType.includes(zone.toLowerCase())) {
                        score += 5;
                    }
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestChunk = chunk;
            }
        }

        // Use best chunk if it has meaningful overlap, otherwise use combined text
        const sourceText = (bestChunk && bestScore > 0)
            ? bestChunk.text
            : combinedText.slice(0, 8000); // cap to avoid token limits

        const sourcePageId = bestChunk ? bestChunk.sheetName : 'combined';

        return {
            entityName: entity.label,
            entityType: 'string',
            definition: entity.definition || entity.label,
            aliases: entity.aliases || [],
            positiveExamples: entity.positiveExamples || [],
            negativeExamples: entity.negativeExamples || [],
            zones: entity.zones || [],
            sourceText,
            sourcePageId,
        };
    });
}

/**
 * Convert structured ParseResult fields to a flat key-value map for easy merging.
 */
function structuredToFlat(structured: any): Record<string, any> {
    const flat: Record<string, any> = {};

    // Client fields
    if (structured.client) {
        const c = structured.client;
        if (c.name) flat['Company Name'] = c.name;
        if (c.tradeName) flat['Trade Name'] = c.tradeName;
        if (c.financialYear) flat['Financial Year'] = c.financialYear;
        if (c.revenue) flat['Revenue'] = c.revenue;
        if (c.npat !== undefined) flat['NPAT'] = c.npat;
        if (c.leviableAmount) flat['Leviable Amount'] = c.leviableAmount;
        if (c.payroll) flat['Payroll'] = c.payroll;
        if (c.tmps) flat['TMPS'] = c.tmps;
        if (c.tmpsInclusions) flat['TMPS Inclusions'] = c.tmpsInclusions;
        if (c.tmpsExclusions) flat['TMPS Exclusions'] = c.tmpsExclusions;
        if (c.industrySector) flat['Industry Sector'] = c.industrySector;
        if (c.applicableScorecard) flat['Applicable Scorecard'] = c.applicableScorecard;
        if (c.applicableCodes) flat['Applicable Codes'] = c.applicableCodes;
        if (c.registrationNumber) flat['Registration Number'] = c.registrationNumber;
        if (c.vatNumber) flat['VAT Number'] = c.vatNumber;
        if (c.address) flat['Address'] = c.address;
    }

    // Ownership summary
    if (structured.shareholders && structured.shareholders.length > 0) {
        flat['Shareholders'] = structured.shareholders;
        const totalBO = structured.shareholders.reduce((s: number, sh: any) => s + (sh.blackOwnership || 0), 0);
        const totalBWO = structured.shareholders.reduce((s: number, sh: any) => s + (sh.blackWomenOwnership || 0), 0);
        if (totalBO > 0) flat['Black Ownership %'] = totalBO;
        if (totalBWO > 0) flat['Black Women Ownership %'] = totalBWO;
    }

    // Employees summary
    if (structured.employees && structured.employees.length > 0) {
        flat['Employees'] = structured.employees;
        flat['Total Employees'] = structured.employees.length;
        const blackCount = structured.employees.filter((e: any) =>
            ['African', 'Coloured', 'Indian'].includes(e.race)
        ).length;
        if (blackCount > 0) flat['Black Employees'] = blackCount;
    }

    // Training programs
    if (structured.trainingPrograms && structured.trainingPrograms.length > 0) {
        flat['Training Programs'] = structured.trainingPrograms;
        flat['Training Programs Count'] = structured.trainingPrograms.length;
        const totalCost = structured.trainingPrograms.reduce((s: number, t: any) => s + (t.cost || 0), 0);
        if (totalCost > 0) flat['Total Training Cost'] = totalCost;
    }

    // Suppliers
    if (structured.suppliers && structured.suppliers.length > 0) {
        flat['Suppliers'] = structured.suppliers;
        flat['Suppliers Count'] = structured.suppliers.length;
        const totalSpend = structured.suppliers.reduce((s: number, sup: any) => s + (sup.spend || 0), 0);
        if (totalSpend > 0) flat['Total Supplier Spend'] = totalSpend;
    }

    // ESD/SED
    if (structured.esdContributions && structured.esdContributions.length > 0) {
        flat['ESD Contributions'] = structured.esdContributions;
        const totalESD = structured.esdContributions.reduce((s: number, c: any) => s + (c.amount || 0), 0);
        if (totalESD > 0) flat['Total ESD Amount'] = totalESD;
    }
    if (structured.sedContributions && structured.sedContributions.length > 0) {
        flat['SED Contributions'] = structured.sedContributions;
        const totalSED = structured.sedContributions.reduce((s: number, c: any) => s + (c.amount || 0), 0);
        if (totalSED > 0) flat['Total SED Amount'] = totalSED;
    }

    return flat;
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerExcelExtractRoute(app: Express): void {
    /**
     * POST /api/extract-excel
     *
     * Accepts a base64-encoded Excel/CSV file and optional entity list.
     * Returns structured row/column extraction + LLM entity extraction.
     */
    app.post('/api/extract-excel', async (req: Request, res: Response) => {
        try {
            const { fileBase64, fileName, sectorCode, scorecardType, entities: customEntities } = req.body as {
                fileBase64?: string;
                fileName?: string;
                sectorCode?: string;
                scorecardType?: string;
                entities?: CustomEntity[];
            };

            if (!fileBase64 || !fileName) {
                return res.status(400).json({
                    error: 'fileBase64 and fileName are required',
                });
            }

            // ── Step 1: Decode file ──────────────────────────────────────────────
            let fileBuffer: Buffer;
            try {
                fileBuffer = Buffer.from(fileBase64, 'base64');
            } catch {
                return res.status(400).json({ error: 'Invalid base64 encoding' });
            }

            // ── Step 2: PRIMARY — Row/column structured extraction ───────────────
            const { parseExcelBuffer } = await import('../../api/pipeline/excelParser.js');
            const structured = parseExcelBuffer(fileBuffer, fileName);

            // ── Step 3: Build sheet text chunks ─────────────────────────────────
            let workbook: XLSX.WorkBook;
            try {
                workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            } catch (e: unknown) {
                return res.status(400).json({
                    error: `Could not parse "${fileName}". Is this a valid Excel/CSV file?`,
                    structured,
                });
            }

            const sheetChunks: SheetChunk[] = workbook.SheetNames.map((name, idx) => {
                const chunk = sheetToText(workbook, name);
                chunk.sheetIndex = idx;
                return chunk;
            }).filter(c => c.rowCount > 0);

            // Combined text for fallback (all sheets concatenated)
            const combinedText = sheetChunks
                .map(c => c.text)
                .join('\n\n---\n\n');

            // ── Step 4: Determine entities to extract ───────────────────────────
            let entitiesToExtract: CustomEntity[];

            if (customEntities && customEntities.length > 0) {
                // Use caller-provided entity list
                entitiesToExtract = customEntities;
            } else {
                // Fall back to sector manifest
                const sector = (sectorCode || 'RCOGP').toUpperCase();
                const scorecard = scorecardType || 'Generic';
                try {
                    const { buildManifestForSector } = await import('./pipeline');
                    const manifest = buildManifestForSector(sector, scorecard);
                    entitiesToExtract = manifest.requiredEntities.map((e: any) => ({
                        label: e.name,
                        definition: e.definition,
                        aliases: e.aliases || [],
                        positiveExamples: e.positiveExamples || [],
                        negativeExamples: e.negativeExamples || [],
                        zones: e.zones || [],
                    }));
                } catch {
                    // If manifest fails, use structured fields as entity list
                    entitiesToExtract = Object.keys(structuredToFlat(structured)).map(k => ({
                        label: k,
                        definition: k,
                    }));
                }
            }

            // ── Step 5: SECONDARY — LLM entity extraction ───────────────────────
            let llmExtractions: any[] = [];

            if (process.env.GROQ_API_KEY && entitiesToExtract.length > 0 && sheetChunks.length > 0) {
                try {
                    const { LLMExtractor } = await import('./pipeline');
                    const requests = buildExtractionRequests(entitiesToExtract, sheetChunks, combinedText);
                    const extractor = new LLMExtractor();
                    llmExtractions = await extractor.extractBatch(requests);
                } catch (llmErr: any) {
                    console.warn('[extract-excel] LLM extraction failed, using structured only:', llmErr?.message);
                    llmExtractions = [];
                }
            } else if (!process.env.GROQ_API_KEY) {
                console.warn('[extract-excel] GROQ_API_KEY not set — skipping LLM extraction, using structured only');
            }

            // ── Step 6: Merge structured + LLM results ───────────────────────────
            // Structured extraction is the primary source of truth.
            // LLM fills in gaps (null structured values) or provides higher-confidence overrides.
            const structuredFlat = structuredToFlat(structured);
            const merged: Record<string, any> = { ...structuredFlat };

            for (const llmResult of llmExtractions) {
                if (llmResult.extractedValue === null) continue;
                const key = llmResult.entityName;
                // Only override if structured didn't find it, or LLM has very high confidence
                if (!(key in merged) || (llmResult.confidence > 0.85 && llmResult.structuralVerification)) {
                    merged[key] = llmResult.extractedValue;
                }
            }

            // ── Step 7: Return combined result ───────────────────────────────────
            return res.json({
                success: structured.success || llmExtractions.some(r => r.extractedValue !== null),
                structured,
                llmExtractions,
                merged,
                sheetChunks: sheetChunks.map(c => ({
                    sheetName: c.sheetName,
                    sheetIndex: c.sheetIndex,
                    rowCount: c.rowCount,
                    colCount: c.colCount,
                    detectedType: c.detectedType,
                    textPreview: c.text.slice(0, 500) + (c.text.length > 500 ? '...' : ''),
                })),
                stats: {
                    sheetsProcessed: sheetChunks.length,
                    structuredEntities: Object.keys(structuredFlat).length,
                    llmEntitiesExtracted: llmExtractions.filter(r => r.extractedValue !== null).length,
                    llmEntitiesTotal: llmExtractions.length,
                    mergedKeys: Object.keys(merged).length,
                    structuredConfidence: structured.stats?.confidence ?? 0,
                    usedLLM: llmExtractions.length > 0,
                },
            });
        } catch (error: any) {
            console.error('[extract-excel] Error:', error);
            return res.status(500).json({
                error: error.message || 'Failed to extract from Excel/CSV file',
            });
        }
    });

    /**
     * POST /api/extract-excel-stream
     *
     * Same as /api/extract-excel but streams progress via SSE.
     * Useful for large files with many entities.
     */
    app.post('/api/extract-excel-stream', async (req: Request, res: Response) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });

        const send = (event: string, data: any) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        try {
            const { fileBase64, fileName, sectorCode, scorecardType, entities: customEntities } = req.body as {
                fileBase64?: string;
                fileName?: string;
                sectorCode?: string;
                scorecardType?: string;
                entities?: CustomEntity[];
            };

            if (!fileBase64 || !fileName) {
                send('error', { error: 'fileBase64 and fileName are required' });
                res.end();
                return;
            }

            send('progress', { step: 'decode', message: 'Decoding file...' });

            let fileBuffer: Buffer;
            try {
                fileBuffer = Buffer.from(fileBase64, 'base64');
            } catch {
                send('error', { error: 'Invalid base64 encoding' });
                res.end();
                return;
            }

            // Step 1: Structured extraction
            send('progress', { step: 'structured', message: 'Running row/column extraction...' });
            const { parseExcelBuffer } = await import('../../api/pipeline/excelParser.js');
            const structured = parseExcelBuffer(fileBuffer, fileName);
            send('structured', { structured, stats: structured.stats });

            // Step 2: Build sheet chunks
            send('progress', { step: 'chunks', message: 'Building sheet text chunks...' });
            let workbook: XLSX.WorkBook;
            try {
                workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            } catch {
                send('error', { error: `Could not parse "${fileName}"` });
                res.end();
                return;
            }

            const sheetChunks: SheetChunk[] = workbook.SheetNames.map((name, idx) => {
                const chunk = sheetToText(workbook, name);
                chunk.sheetIndex = idx;
                return chunk;
            }).filter(c => c.rowCount > 0);

            send('chunks', {
                count: sheetChunks.length,
                sheets: sheetChunks.map(c => ({ name: c.sheetName, rows: c.rowCount, type: c.detectedType })),
            });

            const combinedText = sheetChunks.map(c => c.text).join('\n\n---\n\n');

            // Step 3: Determine entities
            let entitiesToExtract: CustomEntity[];
            if (customEntities && customEntities.length > 0) {
                entitiesToExtract = customEntities;
            } else {
                const sector = (sectorCode || 'RCOGP').toUpperCase();
                const scorecard = scorecardType || 'Generic';
                try {
                    const { buildManifestForSector } = await import('./pipeline');
                    const manifest = buildManifestForSector(sector, scorecard);
                    entitiesToExtract = manifest.requiredEntities.map((e: any) => ({
                        label: e.name,
                        definition: e.definition,
                        aliases: e.aliases || [],
                        positiveExamples: e.positiveExamples || [],
                        negativeExamples: e.negativeExamples || [],
                        zones: e.zones || [],
                    }));
                } catch {
                    entitiesToExtract = [];
                }
            }

            send('progress', {
                step: 'llm',
                message: `Running LLM extraction for ${entitiesToExtract.length} entities...`,
                total: entitiesToExtract.length,
            });

            // Step 4: LLM extraction (one entity at a time for streaming)
            const llmExtractions: any[] = [];

            if (process.env.GROQ_API_KEY && entitiesToExtract.length > 0) {
                const { LLMExtractor } = await import('./pipeline');
                const extractor = new LLMExtractor();
                const requests = buildExtractionRequests(entitiesToExtract, sheetChunks, combinedText);

                for (let i = 0; i < requests.length; i++) {
                    try {
                        const [result] = await extractor.extractBatch([requests[i]]);
                        llmExtractions.push(result);
                        send('entity', {
                            index: i,
                            total: requests.length,
                            entityName: result.entityName,
                            value: result.extractedValue,
                            confidence: result.confidence,
                            method: result.method,
                        });
                    } catch (e: any) {
                        send('entity', {
                            index: i,
                            total: requests.length,
                            entityName: requests[i].entityName,
                            value: null,
                            confidence: 0,
                            error: e?.message,
                        });
                    }
                }
            }

            // Step 5: Merge and send final result
            const structuredFlat = structuredToFlat(structured);
            const merged: Record<string, any> = { ...structuredFlat };
            for (const llmResult of llmExtractions) {
                if (llmResult.extractedValue === null) continue;
                const key = llmResult.entityName;
                if (!(key in merged) || (llmResult.confidence > 0.85 && llmResult.structuralVerification)) {
                    merged[key] = llmResult.extractedValue;
                }
            }

            send('complete', {
                success: true,
                structured,
                llmExtractions,
                merged,
                stats: {
                    sheetsProcessed: sheetChunks.length,
                    structuredEntities: Object.keys(structuredFlat).length,
                    llmEntitiesExtracted: llmExtractions.filter(r => r.extractedValue !== null).length,
                    llmEntitiesTotal: llmExtractions.length,
                    mergedKeys: Object.keys(merged).length,
                },
            });

            res.end();
        } catch (error: any) {
            console.error('[extract-excel-stream] Error:', error);
            send('error', { error: error.message || 'Failed to extract from Excel/CSV file' });
            res.end();
        }
    });
}
