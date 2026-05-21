import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { createLogger } from "./logger";
import { SECTOR_CODE_OPTIONS } from "../src/components/workbook/workbookValidation";
import { getScorecardTypeOptions } from "../src/components/workbook/sections";

const logger = createLogger("ExcelImportRoute");

const SCORECARD_TYPES = ["Generic", "QSE", "Contractor", "BEP"] as const;

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SECTOR_ALIASES: Record<string, string> = {
  transport: "TRANSPORT",
  tourism: "RCOGP",
  agricultural: "AGRI",
  agriculture: "AGRI",
  construction: "CONSTRUCTION",
  financialservices: "FSC",
  financial: "FSC",
  ict: "ICT",
  informationcommunicationtechnology: "ICT",
  property: "RCOGP",
  legal: "RCOGP",
  forestry: "AGRI",
  defence: "RCOGP",
};

function normalizeSectorDeterministic(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().toUpperCase();
  if (SECTOR_CODE_OPTIONS.includes(upper)) return upper;
  const key = norm(raw);
  if (SECTOR_ALIASES[key]) return SECTOR_ALIASES[key];
  for (const [alias, code] of Object.entries(SECTOR_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return code;
  }
  return undefined;
}

function inferScorecardType(revenueHint: string | undefined, raw: string | undefined): string | undefined {
  const cleaned = (raw || "").trim();
  if (cleaned) {
    const upper = cleaned.toUpperCase();
    if (upper.includes("GENERIC") || upper.includes("LARGE")) return "Generic";
    if (upper.includes("QSE")) return "QSE";
    if (upper.includes("EME")) return "QSE";
    if (upper.includes("CONTRACTOR")) return "Contractor";
    if (upper.includes("BEP")) return "BEP";
    if (SCORECARD_TYPES.includes(cleaned as (typeof SCORECARD_TYPES)[number])) return cleaned;
  }
  return undefined;
}

type ExtractedPayload = Record<string, string | number | undefined>;

function validateExtractedConsistency(data: ExtractedPayload): string[] {
  const warnings: string[] = [];
  const pct = (k: string) => {
    const v = data[k];
    return typeof v === "number" ? v : undefined;
  };

  const blackOwnership = pct("blackOwnership");
  const blackWomenOwnership = pct("blackWomenOwnership");
  if (blackOwnership !== undefined && (blackOwnership < 0 || blackOwnership > 100)) {
    warnings.push(`Black ownership (${blackOwnership}%) is outside 0–100.`);
  }
  if (blackWomenOwnership !== undefined && (blackWomenOwnership < 0 || blackWomenOwnership > 100)) {
    warnings.push(`Black women ownership (${blackWomenOwnership}%) is outside 0–100.`);
  }
  if (
    blackOwnership !== undefined &&
    blackWomenOwnership !== undefined &&
    blackWomenOwnership > blackOwnership
  ) {
    warnings.push("Black women ownership exceeds total black ownership.");
  }

  const revenue = typeof data.revenue === "number" ? data.revenue : undefined;
  const npat = typeof data.npat === "number" ? data.npat : undefined;
  if (revenue !== undefined && revenue <= 0) {
    warnings.push("Revenue is zero or negative — verify financial year data.");
  }
  if (revenue !== undefined && npat !== undefined && Math.abs(npat) > revenue * 2) {
    warnings.push("NPAT magnitude is unusually large relative to revenue.");
  }

  const missing: string[] = [];
  if (!data.companyName) missing.push("company name");
  if (!data.sector) missing.push("sector");
  if (revenue === undefined) missing.push("revenue");
  if (missing.length) {
    warnings.push(`Missing critical fields: ${missing.join(", ")}.`);
  }

  return warnings;
}

function normalizeDateDeterministic(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;

  const weekday = /\w+day,\s+(\w+)\s+(\d{1,2}),\s+(\d{4})/i.exec(s);
  if (weekday) {
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04",
      may: "05", june: "06", july: "07", august: "08",
      september: "09", october: "10", november: "11", december: "12",
    };
    const mo = months[weekday[1].toLowerCase()];
    if (mo) {
      const day = String(Number(weekday[2])).padStart(2, "0");
      return `${weekday[3]}-${mo}-${day}`;
    }
  }

  const dmy = /(\d{1,2})\s+(\w+)\s+(\d{4})/i.exec(s);
  if (dmy) {
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04",
      may: "05", june: "06", july: "07", august: "08",
      september: "09", october: "10", november: "11", december: "12",
    };
    const mo = months[dmy[2].toLowerCase()];
    if (mo) {
      const day = String(Number(dmy[1])).padStart(2, "0");
      return `${dmy[3]}-${mo}-${day}`;
    }
  }

  return undefined;
}

async function normalizeWithOpenAI(input: {
  sector?: string;
  scorecardType?: string;
  financialYearEnd?: string;
}): Promise<{
  sector?: string;
  scorecardType?: string;
  financialYearEnd?: string;
  notes: string[];
} | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });
  const allowedSectors = SECTOR_CODE_OPTIONS.join(", ");
  const allowedTypes = SCORECARD_TYPES.join(", ");

  const system = [
    "You normalize B-BBEE Excel import fields to strict enum values.",
    "Return JSON only. Never invent numeric data.",
    `sector must be exactly one of: ${allowedSectors}, or null if unmappable.`,
    `scorecardType must be exactly one of: ${allowedTypes}, or null if unmappable.`,
    "financialYearEnd must be yyyy-mm-dd or null if unmappable.",
    "If input already matches an allowed value, return it unchanged.",
  ].join(" ");

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({
            sector: input.sector ?? null,
            scorecardType: input.scorecardType ?? null,
            financialYearEnd: input.financialYearEnd ?? null,
          }),
        },
      ],
    });

    const text = response.choices?.[0]?.message?.content;
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, string | null>;

    const notes: string[] = [];
    let sector = parsed.sector ?? undefined;
    let scorecardType = parsed.scorecardType ?? undefined;
    let financialYearEnd = parsed.financialYearEnd ?? undefined;

    if (sector && !SECTOR_CODE_OPTIONS.includes(String(sector).toUpperCase())) {
      notes.push(`AI returned invalid sector "${sector}" — ignored.`);
      sector = undefined;
    } else if (sector) {
      sector = String(sector).toUpperCase();
    }

    if (scorecardType && !SCORECARD_TYPES.includes(scorecardType as (typeof SCORECARD_TYPES)[number])) {
      notes.push(`AI returned invalid scorecard type "${scorecardType}" — ignored.`);
      scorecardType = undefined;
    }

    if (financialYearEnd && !/^\d{4}-\d{2}-\d{2}$/.test(financialYearEnd)) {
      notes.push(`AI returned invalid date "${financialYearEnd}" — ignored.`);
      financialYearEnd = undefined;
    }

    if (sector && scorecardType) {
      const allowed = getScorecardTypeOptions(sector);
      if (!allowed.includes(scorecardType)) {
        notes.push(`Scorecard type "${scorecardType}" is not valid for ${sector} — cleared.`);
        scorecardType = allowed.length === 1 ? allowed[0] : undefined;
      }
    }

    return { sector, scorecardType, financialYearEnd, notes };
  } catch (err) {
    logger.warn("OpenAI normalization failed", err);
    return null;
  }
}

export function registerExcelImportRoutes(app: Express) {
  app.post("/api/excel-import/normalize", async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const rawSector = typeof body.sector === "string" ? body.sector : undefined;
      const rawScorecard = typeof body.scorecardType === "string" ? body.scorecardType : undefined;
      const rawDate = typeof body.financialYearEnd === "string" ? body.financialYearEnd : undefined;
      const extractedData =
        body.extractedData && typeof body.extractedData === "object"
          ? (body.extractedData as ExtractedPayload)
          : undefined;

      let sector = normalizeSectorDeterministic(rawSector);
      let scorecardType = inferScorecardType(undefined, rawScorecard);
      let financialYearEnd = normalizeDateDeterministic(rawDate);
      const notes: string[] = [];
      const validationWarnings = extractedData ? validateExtractedConsistency(extractedData) : [];

      const needsAi =
        (rawSector && !sector) ||
        (rawScorecard && !scorecardType) ||
        (rawDate && !financialYearEnd);

      if (needsAi) {
        const ai = await normalizeWithOpenAI({
          sector: rawSector,
          scorecardType: rawScorecard,
          financialYearEnd: rawDate,
        });
        if (ai) {
          sector = sector || ai.sector;
          scorecardType = scorecardType || ai.scorecardType;
          financialYearEnd = financialYearEnd || ai.financialYearEnd;
          notes.push(...ai.notes, "AI normalization applied.");
          return res.json({
            sector,
            scorecardType,
            financialYearEnd,
            usedAi: true,
            notes,
            validationWarnings,
          });
        }
        notes.push("OPENAI_API_KEY not configured or AI call failed — using deterministic values only.");
      }

      if (sector && scorecardType) {
        const allowed = getScorecardTypeOptions(sector);
        if (!allowed.includes(scorecardType)) {
          scorecardType = allowed.length === 1 ? allowed[0] : undefined;
        }
      }

      return res.json({
        sector,
        scorecardType,
        financialYearEnd,
        usedAi: false,
        notes,
        validationWarnings,
      });
    } catch (err) {
      logger.error("Excel import normalize failed", err);
      return res.status(500).json({ message: "Normalization failed" });
    }
  });
}
