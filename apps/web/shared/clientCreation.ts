/**
 * What a company must have before it exists.
 *
 * Creating a company took a name and nothing else. The result is visible in the
 * company list: "Example", "Test", "Test Company", "Procurement examplee
 * eeeeeeeeeee" — and companies with no usable name at all. Every one of them
 * carries a default sector of RCOGP and a default scorecard type of Generic
 * that nobody chose, so a scorecard could be built, scored and exported against
 * a sector the measured entity does not trade in.
 *
 * Four fields decide what the scorecard IS, so they are collected before it
 * starts rather than defaulted and discovered later:
 *
 *   name               — who is being measured
 *   sectorCode         — which code series applies
 *   scorecardType      — Generic or QSE, which changes the weightings
 *   financialYearEnd   — the date the measurement period closes
 *
 * The measurement period START and END stay editable. Reporting periods are not
 * always twelve months — a company changing its year end, or measuring a short
 * first period, needs to say so — and the year end is what those dates are
 * anchored to, not a substitute for them.
 *
 * This module is imported by the create form AND by POST /api/clients on
 * purpose. A rule enforced on one side only is a rule with a way around it: the
 * form is the polite version and the endpoint is the real one, and they have to
 * be the same rule or the endpoint quietly becomes the only one that counts.
 */

/** Sector codes apps/api/pipeline/sectorConfig.ts can actually score. */
export const CLIENT_SECTOR_CODES = [
  "RCOGP",
  "ICT",
  "FSC",
  "AGRI",
  "TRANSPORT",
  "CONSTRUCTION",
] as const;

export type ClientSectorCode = (typeof CLIENT_SECTOR_CODES)[number];

/** Scorecard types available per sector. Mirrors getScorecardTypeOptions. */
export function scorecardTypesForSector(sectorCode: unknown): string[] {
  switch (String(sectorCode ?? "").trim().toUpperCase()) {
    case "RCOGP":
    case "ICT":
    case "TRANSPORT":
    case "CONSTRUCTION":
      return ["Generic", "QSE"];
    case "FSC":
    case "AGRI":
      return ["Generic"];
    default:
      return [];
  }
}

export interface NewClientDraft {
  name?: unknown;
  sectorCode?: unknown;
  scorecardType?: unknown;
  financialYearEnd?: unknown;
  /** "bbbee" (default) or "esg". ESG companies are not scored against a B-BBEE code. */
  product?: unknown;
}

export interface ClientFieldError {
  field: "name" | "sectorCode" | "scorecardType" | "financialYearEnd" | "product";
  message: string;
}

/** Shortest name that could be a real company. Two letters covers "BP". */
export const MIN_CLIENT_NAME_LENGTH = 2;
export const MAX_CLIENT_NAME_LENGTH = 200;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/**
 * Is this a date we can anchor a measurement period to?
 *
 * Accepts YYYY-MM-DD, which is what a date input submits. A year alone is
 * rejected: "2026" does not say when the period closed, and the whole point of
 * the field is that the closing date varies.
 */
export function isFinancialYearEndValid(value: unknown): boolean {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return false;
  // Round-trip guards against 2026-02-31, which Date happily rolls forward.
  return date.toISOString().slice(0, 10) === raw;
}

/**
 * Every reason this company cannot be created, in field order.
 *
 * Returns them all rather than the first, so the form can mark each field at
 * once instead of revealing the next problem after every attempt.
 */
export function validateNewClient(draft: NewClientDraft): ClientFieldError[] {
  const errors: ClientFieldError[] = [];

  const product = text(draft.product).toLowerCase() || "bbbee";
  if (product !== "bbbee" && product !== "esg") {
    errors.push({ field: "product", message: 'Product must be "bbbee" or "esg".' });
  }

  const name = text(draft.name);
  if (!name) {
    errors.push({ field: "name", message: "Company name is required." });
  } else if (name.length < MIN_CLIENT_NAME_LENGTH) {
    errors.push({ field: "name", message: `Company name must be at least ${MIN_CLIENT_NAME_LENGTH} characters.` });
  } else if (name.length > MAX_CLIENT_NAME_LENGTH) {
    errors.push({ field: "name", message: `Company name must be under ${MAX_CLIENT_NAME_LENGTH} characters.` });
  }

  // An ESG company is not measured against a B-BBEE code, so a sector and a
  // scorecard type would be fields with nothing behind them.
  if (product !== "bbbee") return errors;

  const sectorCode = text(draft.sectorCode).toUpperCase();
  if (!sectorCode) {
    errors.push({ field: "sectorCode", message: "Sector is required." });
  } else if (!CLIENT_SECTOR_CODES.includes(sectorCode as ClientSectorCode)) {
    errors.push({
      field: "sectorCode",
      message: `Sector must be one of: ${CLIENT_SECTOR_CODES.join(", ")}.`,
    });
  }

  const allowedTypes = scorecardTypesForSector(sectorCode);
  const scorecardType = text(draft.scorecardType);
  if (!scorecardType) {
    errors.push({ field: "scorecardType", message: "Scorecard type is required." });
  } else if (allowedTypes.length && !allowedTypes.some((t) => t.toLowerCase() === scorecardType.toLowerCase())) {
    errors.push({
      field: "scorecardType",
      message: `${sectorCode} uses: ${allowedTypes.join(" or ")}.`,
    });
  }

  if (!text(draft.financialYearEnd)) {
    errors.push({ field: "financialYearEnd", message: "Financial year end is required." });
  } else if (!isFinancialYearEndValid(draft.financialYearEnd)) {
    errors.push({ field: "financialYearEnd", message: "Financial year end must be a date, as YYYY-MM-DD." });
  }

  return errors;
}

export interface NormalizedNewClient {
  name: string;
  sectorCode: string | null;
  scorecardType: string | null;
  financialYearEnd: string | null;
  /** The calendar year the period closes in — what the legacy field holds. */
  financialYear: string;
  measurementPeriodStart: string;
  measurementPeriodEnd: string;
  product: "bbbee" | "esg";
}

/**
 * The stored shape of a validated draft.
 *
 * The period defaults to the twelve months ending on the year end, which is the
 * ordinary case — and it is written as data, not inferred at read time, so a
 * company measuring a short period can simply edit it afterwards and have the
 * edit stick.
 */
export function normalizeNewClient(draft: NewClientDraft): NormalizedNewClient {
  const product = (text(draft.product).toLowerCase() || "bbbee") as "bbbee" | "esg";
  const financialYearEnd = text(draft.financialYearEnd) || null;
  const sectorCode = product === "bbbee" ? text(draft.sectorCode).toUpperCase() || null : null;

  let measurementPeriodStart = "";
  let measurementPeriodEnd = "";
  if (financialYearEnd && isFinancialYearEndValid(financialYearEnd)) {
    // Day first, THEN year. The other order lands on 29 February in a
    // non-leap year for a leap-day year end, which JavaScript rolls forward to
    // 1 March before the day is added — putting the period start one day late.
    const start = new Date(`${financialYearEnd}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() + 1);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    measurementPeriodStart = start.toISOString().slice(0, 10);
    measurementPeriodEnd = financialYearEnd;
  }

  return {
    name: text(draft.name),
    sectorCode,
    scorecardType: product === "bbbee" ? text(draft.scorecardType) || null : null,
    financialYearEnd,
    financialYear: financialYearEnd
      ? financialYearEnd.slice(0, 4)
      : new Date().getFullYear().toString(),
    measurementPeriodStart,
    measurementPeriodEnd,
    product,
  };
}
