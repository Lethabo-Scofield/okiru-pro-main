/**
 * AI-assisted tabular mapping endpoints.
 *
 *   POST /api/workbook/normalize-paste  — map pasted/imported columns → fields
 *   POST /api/workbook/import-map       — map workbook sheets → scorecard sections
 *
 * Both run the shared deterministic matcher first (columnMatch.ts) and only
 * call the LLM for the columns/sheets that could not be matched confidently.
 * The LLM is constrained to choose from the supplied target keys (or null) and
 * its output is validated against that allow-list, so it can never invent a
 * destination field. Gated behind requireAuth and reuses the Azure
 * OpenAI / OpenAI configuration of the existing Excel import route.
 */
import type { Express, Request, Response, NextFunction } from "express";
import OpenAI, { AzureOpenAI } from "openai";
import { createLogger } from "./logger";
import { createChatCompletion } from "./openaiCompat";
import {
  buildFieldMapping,
  type FieldMapping,
  type TargetField,
} from "../src/lib/columnMatch";
import { columnQuestionFingerprint, rememberDecision } from "./mappingDecisionCache";

const logger = createLogger("AiMappingRoutes");

const AI_CONFIDENCE_FLOOR = 0.75;

function getOpenAIClient(): { client: OpenAI; model: string } | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_FAST_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT;
  if (endpoint && apiKey && deployment) {
    return {
      client: new AzureOpenAI({
        endpoint,
        apiKey,
        deployment,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
      }),
      model: deployment,
    };
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  return null;
}

function sanitizeTargetFields(raw: unknown): TargetField[] {
  if (!Array.isArray(raw)) return [];
  const out: TargetField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const key = typeof (f as any).key === "string" ? (f as any).key : "";
    const label = typeof (f as any).label === "string" ? (f as any).label : key;
    if (!key) continue;
    out.push({
      key,
      label,
      type: typeof (f as any).type === "string" ? (f as any).type : undefined,
      options: Array.isArray((f as any).options) ? (f as any).options.map(String) : undefined,
      aliases: Array.isArray((f as any).aliases) ? (f as any).aliases.map(String) : undefined,
    });
  }
  return out;
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (v === null || v === undefined ? "" : String(v)));
}

/** Ask the LLM to map the leftover headers to one of the allowed field keys. */
async function aiMapHeaders(
  headers: { sourceIndex: number; header: string; samples: string[] }[],
  fields: TargetField[],
): Promise<{ assignments: Map<number, string>; notes: string[] }> {
  const cfg = getOpenAIClient();
  if (!cfg) return { assignments: new Map(), notes: ["AI not configured — deterministic mapping only."] };

  const allowedKeys = new Set(fields.map((f) => f.key));
  const fieldList = fields
    .map((f) => `- ${f.key}: ${f.label}${f.type ? ` (${f.type})` : ""}${f.options?.length ? ` [${f.options.join(", ")}]` : ""}`)
    .join("\n");
  const columnList = headers
    .map((h) => `#${h.sourceIndex} "${h.header}" e.g. ${h.samples.slice(0, 3).map((s) => `"${s}"`).join(", ") || "(no samples)"}`)
    .join("\n");

  const system = [
    "You map messy spreadsheet column headers onto a fixed set of target fields for a South African B-BBEE scorecard.",
    "Return JSON only: { \"mappings\": [ { \"sourceIndex\": number, \"targetKey\": string|null } ] }.",
    "targetKey MUST be one of the provided field keys, or null when no field is a good match.",
    "Never invent a key. Use the sample values to disambiguate. Each target key may be used at most once.",
  ].join(" ");

  const user = `TARGET FIELDS:\n${fieldList}\n\nSOURCE COLUMNS (with sample values):\n${columnList}`;

  try {
    const response = await createChatCompletion(cfg.client, {
      model: cfg.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = response.choices?.[0]?.message?.content;
    if (!text) return { assignments: new Map(), notes: ["AI returned no content."] };
    const parsed = JSON.parse(text) as { mappings?: Array<{ sourceIndex: number; targetKey: string | null }> };
    const assignments = new Map<number, string>();
    const used = new Set<string>();
    const notes: string[] = [];
    for (const m of parsed.mappings ?? []) {
      if (typeof m.sourceIndex !== "number") continue;
      const key = m.targetKey;
      if (key == null) continue;
      if (!allowedKeys.has(key)) {
        notes.push(`AI suggested unknown field "${key}" — ignored.`);
        continue;
      }
      if (used.has(key)) continue;
      used.add(key);
      assignments.set(m.sourceIndex, key);
    }
    return { assignments, notes };
  } catch (err) {
    logger.warn("AI header mapping failed", err);
    return { assignments: new Map(), notes: ["AI mapping call failed — deterministic mapping only."] };
  }
}

export function registerAiMappingRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void | Promise<void>,
): void {
  app.post("/api/workbook/normalize-paste", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const headers = toStringArray(body.headers);
      const fields = sanitizeTargetFields(body.targetFields);
      if (headers.length === 0 || fields.length === 0) {
        return res.status(400).json({ message: "headers and targetFields are required" });
      }
      const sampleRows: string[][] = Array.isArray(body.sampleRows)
        ? body.sampleRows.map(toStringArray)
        : [];

      const deterministic: FieldMapping[] = buildFieldMapping(headers, fields);
      // "Settled" means confident AND unambiguous. A column whose name fits two
      // fields equally scores 1.00 and was therefore treated as settled — so
      // the one case most in need of a second opinion was the one case that
      // never got one. The client applies the same rule; both ends must agree
      // or the server simply never puts the ambiguous column in `leftovers`.
      const settled = (m: FieldMapping) =>
        Boolean(m.targetKey) && m.confidence >= AI_CONFIDENCE_FLOOR && !m.ambiguous;

      const claimed = new Set<string>();
      for (const m of deterministic) {
        if (settled(m)) claimed.add(m.targetKey as string);
      }

      const leftovers = deterministic
        .filter((m) => m.sourceHeader.trim() && !settled(m))
        .map((m) => ({
          sourceIndex: m.sourceIndex,
          header: m.sourceHeader,
          samples: sampleRows.map((r) => r[m.sourceIndex]).filter((v) => v && v.trim()),
        }));

      const notes: string[] = [];
      let usedAi = false;
      let mapping = deterministic;

      if (leftovers.length > 0) {
        const availableFields = fields.filter((f) => !claimed.has(f.key));
        // What a COLUMN means is a property of the template, not of this
        // upload, so the answer is decided once per (headers, fields) pair and
        // replayed. `temperature: 0` below is a request the gpt-5 deployments
        // reject, so without this the same workbook can map two ways on two
        // days — and an unmapped column scores zero.
        const fingerprint = columnQuestionFingerprint(
          leftovers.map((l) => l.header),
          availableFields.map((f) => f.key),
        );
        const decision = await rememberDecision<Array<[number, string]>>(
          "normalize-paste",
          fingerprint,
          async () => {
            const { assignments: fresh, notes: freshNotes } = await aiMapHeaders(
              leftovers,
              availableFields,
            );
            notes.push(...freshNotes);
            // A considered "nothing maps" is a real decision worth remembering;
            // re-rolling a non-answer is the drift being removed.
            return Array.from(fresh.entries());
          },
        );
        const assignments = new Map<number, string>(decision.value ?? []);
        if (decision.replayed) notes.push("Mapping replayed from a prior decision on this template.");
        if (assignments.size > 0) {
          usedAi = true;
          const used = new Set(claimed);
          mapping = deterministic.map((m) => {
            if (settled(m)) return m;
            const key = assignments.get(m.sourceIndex);
            if (key && !used.has(key)) {
              used.add(key);
              return { ...m, targetKey: key, confidence: 0.7, method: "ai" as const };
            }
            return m;
          });
        }
      }

      return res.json({ mapping, usedAi, notes });
    } catch (err) {
      logger.error("normalize-paste failed", err);
      return res.status(500).json({ message: "normalize-paste failed" });
    }
  });

  app.post("/api/workbook/import-map", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const sheets: Array<{ name: string; headers: string[]; sampleRows?: string[][] }> = Array.isArray(body.sheets)
        ? body.sheets
            .filter((s: any) => s && typeof s.name === "string")
            .map((s: any) => ({
              name: String(s.name),
              headers: toStringArray(s.headers),
              sampleRows: Array.isArray(s.sampleRows) ? s.sampleRows.map(toStringArray) : [],
            }))
        : [];
      const sections: Array<{ key: string; label: string; fields?: { key: string; label: string }[] }> =
        Array.isArray(body.sections) ? body.sections : [];

      if (sheets.length === 0 || sections.length === 0) {
        return res.status(400).json({ message: "sheets and sections are required" });
      }

      const cfg = getOpenAIClient();
      const sheetToSection: Record<string, string | null> = {};
      const notes: string[] = [];

      if (!cfg) {
        for (const s of sheets) sheetToSection[s.name] = null;
        return res.json({ sheetToSection, usedAi: false, notes: ["AI not configured."] });
      }

      const allowedKeys = new Set(sections.map((s) => s.key));
      const sectionList = sections
        .map((s) => `- ${s.key}: ${s.label}${s.fields?.length ? ` (fields: ${s.fields.map((f) => f.label).slice(0, 8).join(", ")})` : ""}`)
        .join("\n");
      const sheetList = sheets
        .map((s) => `"${s.name}" headers: ${s.headers.slice(0, 12).join(", ") || "(none)"}`)
        .join("\n");

      const system = [
        "You map worksheet tabs from a South African B-BBEE toolkit workbook onto scorecard sections.",
        "Return JSON only: { \"sheets\": [ { \"name\": string, \"sectionKey\": string|null } ] }.",
        "sectionKey MUST be one of the provided section keys, or null if the sheet has no matching section.",
      ].join(" ");
      const user = `SCORECARD SECTIONS:\n${sectionList}\n\nWORKBOOK SHEETS:\n${sheetList}`;

      try {
        const response = await createChatCompletion(cfg.client, {
          model: cfg.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        const text = response.choices?.[0]?.message?.content;
        const parsed = text ? (JSON.parse(text) as { sheets?: Array<{ name: string; sectionKey: string | null }> }) : { sheets: [] };
        for (const s of sheets) sheetToSection[s.name] = null;
        for (const m of parsed.sheets ?? []) {
          if (typeof m.name !== "string") continue;
          if (m.sectionKey == null) continue;
          if (!allowedKeys.has(m.sectionKey)) {
            notes.push(`AI suggested unknown section "${m.sectionKey}" — ignored.`);
            continue;
          }
          sheetToSection[m.name] = m.sectionKey;
        }
        return res.json({ sheetToSection, usedAi: true, notes });
      } catch (err) {
        logger.warn("import-map AI call failed", err);
        for (const s of sheets) sheetToSection[s.name] = null;
        return res.json({ sheetToSection, usedAi: false, notes: ["AI mapping call failed."] });
      }
    } catch (err) {
      logger.error("import-map failed", err);
      return res.status(500).json({ message: "import-map failed" });
    }
  });
}
