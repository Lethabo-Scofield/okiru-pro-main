/**
 * reconcileEntity — assemble extracted facts into ONE coherent entity.
 *
 * See ./types.ts for the five invariant classes. The passes run in a fixed
 * order because each depends on the last:
 *
 *   1. representation  — canonicalise value TYPES first, so every later pass
 *                        compares like with like (a date serial is a date, a
 *                        share count is a count).
 *   2. identity        — collapse the same entity (same ID / same name) into one
 *                        row and give it one stable attribute set across sections.
 *   3. well-formedness  — remove things that cannot be members of the set (the
 *                        company as its own shareholder; amountless "contributions").
 *   4. conservation    — check the parts sum to the whole (ownership → 100%).
 *   5. derivation      — fill entailed-but-absent dimensions (shareholding ⇒
 *                        economic interest ⇒ voting, by flow-through).
 *
 * Nothing here is specific to one client: each pass encodes a domain law. It is
 * pure (no I/O) and deterministic.
 */
import { getSection, parseWorkbookDate } from "@/components/workbook/sections";
import { normalizeRace, isBlackRace } from "@toolkit/lib/calculators/shared";
import { genderFromSaId } from "@/lib/extractionReview";
import { normaliseEntityName } from "@/lib/parserToWorkbook";
import type {
  EntitySummary,
  IssueSeverity,
  ReconcileOptions,
  ReconcileResult,
  ReconciliationIssue,
  WorkbookRow,
  WorkbookSections,
} from "./types";

const str = (v: unknown): string => String(v ?? "").trim();
const blank = (v: unknown): boolean => v === undefined || v === null || String(v).trim() === "";
const idKey = (v: unknown): string => str(v).replace(/\s+/g, "");
const isId = (v: unknown): boolean => /^\d{13}$/.test(idKey(v));

let seq = 0;
const nextId = (): string => `rec_${(seq += 1)}`;

const PEOPLE_SECTIONS: Record<string, string[]> = {
  ownership: ["shareholderName"],
  "management-control": ["name", "surname"],
  employees: ["name", "surname"],
  "skills-development": ["learnerName"],
};

const CONTRIBUTION_SECTIONS = ["sed", "esd"] as const;

/** Excel serial date (days since 1899-12-30) → ISO. Only for the plausible range. */
function excelSerialToIso(value: unknown): string | null {
  const num = typeof value === "number" ? value : Number(String(value).trim());
  // ~1968-01-01 (=25000) to ~2050 (=55000): a bare integer in this window inside
  // a DATE cell is an unconverted Excel serial, never a real date the user typed.
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 20000 || num > 60000) return null;
  const ms = Date.UTC(1899, 11, 30) + num * 86_400_000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Parse a percentage-or-fraction cell to a fraction (0–1), or null if empty/NaN. */
function pctCell(v: unknown): number | null {
  if (blank(v)) return null;
  const n = Number(String(v).replace(/[%\s,]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n; // 100→1.0, 1→1.0, 0.5→0.5
}

/**
 * A holder's canonical holding fraction (0–1) from whatever dimension is present.
 * Takes the first POSITIVE of shareholding / economic interest / voting — a
 * stated 0 is "not this dimension", not "0% held" (a share register states the
 * holding once and leaves the other columns blank or zero).
 */
function holdingFraction(row: WorkbookRow): number {
  for (const col of ["shareholding", "economicInterest", "votingRights"] as const) {
    const p = pctCell(row[col]);
    if (p !== null && p > 0) return p;
  }
  return 0;
}

/** True when a row carries no ownership signal at all — not actually a shareholder. */
function hasNoOwnershipSignal(row: WorkbookRow): boolean {
  if (holdingFraction(row) > 0) return false;
  const shares = Number(String(row.numberOfShares ?? row.shares ?? "").replace(/[\s,]/g, ""));
  return !(Number.isFinite(shares) && shares > 0);
}

function pushSummaryDefaults(sections: WorkbookSections, opts: ReconcileOptions): EntitySummary {
  const companyMeta = (sections["company-information"]?.meta ?? {}) as Record<string, unknown>;
  return {
    companyName: str(companyMeta.companyName),
    sectorCode: str(opts.sectorCode ?? companyMeta.industrySector),
    scorecardType: str(opts.scorecardType ?? companyMeta.scorecardType),
    shareholderCount: 0,
    blackOwnershipFraction: 0,
    blackWomenOwnershipFraction: 0,
    ownershipClosesTo: 0,
    employeeCount: 0,
    supplierCount: 0,
    trainingProgrammeCount: 0,
    scoredSedContributions: 0,
    scoredEsdContributions: 0,
    deemedLevel: null,
  };
}

// ── Pass 1: REPRESENTATION ────────────────────────────────────────────────
function normaliseRepresentation(sections: WorkbookSections, issues: ReconciliationIssue[]): void {
  let dateFixes = 0;
  let genderFixes = 0;
  for (const [key, section] of Object.entries(sections)) {
    const def = getSection(key);
    if (!def?.columns) continue;
    const dateCols = def.columns.filter((c) => c.type === "date").map((c) => c.key);
    for (const row of section.rows ?? []) {
      // Excel serial dates → real dates.
      for (const col of dateCols) {
        const iso = excelSerialToIso(row[col]);
        if (iso && !parseWorkbookDate(row[col])) {
          row[col] = iso;
          dateFixes++;
        }
      }
      // Gender that is not Male/Female but the ID states it → derive.
      if (key in PEOPLE_SECTIONS && !blank(row.gender)) {
        const g = str(row.gender).toLowerCase();
        if (g !== "male" && g !== "female") {
          const derived = genderFromSaId(row.idNumber);
          if (derived) { row.gender = derived; genderFixes++; }
          else row.gender = "";
        }
      }
    }
  }
  if (dateFixes > 0) {
    issues.push({
      id: nextId(), invariant: "representation", severity: "resolved",
      statement: `Converted ${dateFixes} spreadsheet date code${dateFixes === 1 ? "" : "s"} into real dates.`,
      action: "The workbook exported dates as numbers (e.g. 46066); reconciliation read them back as calendar dates.",
    });
  }
  if (genderFixes > 0) {
    issues.push({
      id: nextId(), invariant: "representation", severity: "resolved",
      statement: `Recovered gender for ${genderFixes} ${genderFixes === 1 ? "person" : "people"} from their ID number.`,
    });
  }
}

// ── Pass 2: IDENTITY ──────────────────────────────────────────────────────
interface IdentityAttrs { race?: string; gender?: string }

function reconcileIdentity(sections: WorkbookSections, issues: ReconciliationIssue[]): void {
  // Cross-section attribute bank keyed by ID: the authoritative race/gender for
  // a person, gathered wherever any section declared it.
  const bank = new Map<string, IdentityAttrs>();
  const raceConflicts = new Map<string, Set<string>>();
  const record = (id: string, race: string, gender: string) => {
    const e = bank.get(id) ?? {};
    if (race) {
      const norm = normalizeRace(race) || race;
      if (!e.race) e.race = norm;
      else if (e.race !== norm) {
        const s = raceConflicts.get(id) ?? new Set([e.race]);
        s.add(norm); raceConflicts.set(id, s);
      }
    }
    if (gender && !e.gender) e.gender = gender;
    bank.set(id, e);
  };
  for (const [key, section] of Object.entries(sections)) {
    if (!(key in PEOPLE_SECTIONS)) continue;
    for (const row of section.rows ?? []) {
      if (isId(row.idNumber)) record(idKey(row.idNumber), str(row.race), str(row.gender));
    }
  }

  // Merge duplicate rows WITHIN each people-section (same ID, or same name when
  // no ID), and stamp the banked race/gender onto every row of that person.
  for (const [key, section] of Object.entries(sections)) {
    if (!(key in PEOPLE_SECTIONS)) continue;
    const nameCols = PEOPLE_SECTIONS[key];
    const byKey = new Map<string, WorkbookRow>();
    const kept: WorkbookRow[] = [];
    let merged = 0;
    for (const row of section.rows ?? []) {
      const k = isId(row.idNumber)
        ? `id:${idKey(row.idNumber)}`
        : `nm:${nameCols.map((c) => normaliseEntityName(row[c])).filter(Boolean).join(" ")}`;
      if (k === "nm:") { kept.push(row); continue; }
      const existing = byKey.get(k);
      if (existing) {
        for (const [col, val] of Object.entries(row)) {
          if (col === "_id" || col === "_sourceFiles") continue;
          if (blank(existing[col]) && !blank(val)) existing[col] = val;
        }
        existing._sourceFiles = Array.from(new Set([...(existing._sourceFiles ?? []), ...(row._sourceFiles ?? [])]));
        merged++;
        continue;
      }
      byKey.set(k, row);
      kept.push(row);
    }
    // Stamp banked identity onto every kept row.
    for (const row of kept) {
      if (!isId(row.idNumber)) continue;
      const attrs = bank.get(idKey(row.idNumber));
      if (attrs?.race && blank(row.race) && "race" in (getSectionColumns(key))) row.race = attrs.race;
      if (attrs?.gender && blank(row.gender) && "gender" in (getSectionColumns(key))) row.gender = attrs.gender;
    }
    section.rows = kept;
    if (merged > 0) {
      issues.push({
        id: nextId(), invariant: "identity", severity: "resolved", section: key,
        statement: `Merged ${merged} duplicate ${merged === 1 ? "row" : "rows"} in ${sectionLabel(key)} — the same person appeared more than once.`,
      });
    }
  }

  // Race conflicts: a person recorded with two races. If BOTH map to black, the
  // scoring-relevant fact (black status) is stable → resolved with a note.
  // Otherwise it is genuinely ambiguous and must be answered → blocking.
  for (const [id, races] of Array.from(raceConflicts.entries())) {
    const list = Array.from(races);
    const allBlack = list.every((r) => isBlackRace(r));
    issues.push({
      id: nextId(), invariant: "identity", severity: allBlack ? "resolved" : "blocking",
      entity: `ID …${id.slice(-4)}`,
      statement: allBlack
        ? `One person is recorded as ${list.join(" in one place and ")} — both count as black, so ownership and management scores are unaffected.`
        : `One person is recorded as ${list.join(" and ")} in different documents — these score differently and need confirming.`,
      action: allBlack ? undefined : "Confirm the correct population group.",
    });
  }
}

function getSectionColumns(key: string): Record<string, true> {
  const def = getSection(key);
  const out: Record<string, true> = {};
  for (const c of def?.columns ?? []) out[c.key] = true;
  return out;
}

function sectionLabel(key: string): string {
  return getSection(key)?.label ?? key;
}

// ── Pass 3: WELL-FORMEDNESS ───────────────────────────────────────────────
const CATEGORY_LABEL = /\b(hiv|aids|poverty|awareness|education|bursar|housing|community|initiative|alleviation|development)\b/i;

function enforceWellFormedness(
  sections: WorkbookSections,
  summary: EntitySummary,
  issues: ReconciliationIssue[],
  entityAliases: string[] = [],
): void {
  // The measured entity is not a member of its own shareholder set. Match a
  // shareholder against EVERY name the entity is known by — the display name
  // plus the registered names/numbers from the documents — because the register
  // lists the entity under its registered name ("… Packers and Hauliers cc"),
  // not the display name the user typed ("Thandanani Transport").
  const nameKeys = new Set<string>();
  const numberKeys = new Set<string>();
  for (const alias of [summary.companyName, ...entityAliases]) {
    const s = str(alias);
    if (!s) continue;
    if (/^\d[\d/\s-]{4,}$/.test(s)) numberKeys.add(s.replace(/[\s/-]/g, "")); // a registration number
    else {
      const k = normaliseEntityName(s);
      if (k) nameKeys.add(k);
    }
  }
  const own = sections.ownership?.rows;
  if (own && (nameKeys.size > 0 || numberKeys.size > 0)) {
    const isSelf = (r: WorkbookRow): boolean => {
      if (nameKeys.has(normaliseEntityName(r.shareholderName))) return true;
      const reg = str(r.registrationNumber ?? r.idNumber).replace(/[\s/-]/g, "");
      return reg.length > 4 && numberKeys.has(reg);
    };
    const removed = own.filter(isSelf);
    if (removed.length > 0) {
      sections.ownership!.rows = own.filter((r) => !isSelf(r));
      const shares = removed.map((r) => str(r.numberOfShares ?? r.shares ?? r.shareholding)).filter(Boolean).join(", ");
      const label = str(removed[0].shareholderName) || summary.companyName;
      issues.push({
        id: nextId(), invariant: "well-formedness", severity: "resolved", section: "ownership",
        entity: label,
        statement: `Removed "${label}" from its own shareholder list${shares ? ` (it was listed holding ${shares})` : ""} — a company cannot own itself.`,
      });
    }
  }

  // A row with no ownership signal at all (no %, no shares) is not a shareholder
  // — usually an employee or contact swept into the ownership table. Remove it,
  // so it does not dilute the real holders or break the 100% sum.
  const own2 = sections.ownership?.rows;
  if (own2 && own2.length > 1) {
    const nonOwners = own2.filter(hasNoOwnershipSignal);
    if (nonOwners.length > 0 && nonOwners.length < own2.length) {
      sections.ownership!.rows = own2.filter((r) => !hasNoOwnershipSignal(r));
      issues.push({
        id: nextId(), invariant: "well-formedness", severity: "resolved", section: "ownership",
        statement: `Removed ${nonOwners.length} row${nonOwners.length === 1 ? "" : "s"} from the shareholder list with no holding recorded — ${nonOwners.map((r) => `"${str(r.shareholderName)}"`).join(", ")} carried no shares or percentage.`,
      });
    }
  }

  // A contribution with no amount is not (yet) a contribution — set it aside as
  // a coverage gap rather than scoring an empty line as R0.
  for (const key of CONTRIBUTION_SECTIONS) {
    const rows = sections[key]?.rows;
    if (!rows) continue;
    const scored: WorkbookRow[] = [];
    const amountless: WorkbookRow[] = [];
    for (const r of rows) {
      const amt = Number(String(r.amount ?? "").replace(/[R\s,]/g, ""));
      (Number.isFinite(amt) && amt > 0 ? scored : amountless).push(r);
    }
    if (amountless.length > 0) {
      sections[key]!.rows = scored;
      const looksTemplate = amountless.filter((r) => CATEGORY_LABEL.test(str(r.beneficiaryName ?? r.supplierName))).length;
      issues.push({
        id: nextId(), invariant: "well-formedness", severity: "coverage", section: key,
        statement: `${amountless.length} ${sectionLabel(key)} line${amountless.length === 1 ? "" : "s"} had no amount${looksTemplate ? " (they read as category headings, not actual contributions)" : ""} — left out of the score until an amount is supplied.`,
        action: "Add the Rand amount for any of these that are real contributions.",
        rowIds: amountless.map((r) => str(r._id)).filter(Boolean),
      });
    }
  }
}

// ── Pass 4 + 5: CONSERVATION + DERIVATION (ownership) ──────────────────────
function reconcileOwnership(sections: WorkbookSections, summary: EntitySummary, issues: ReconciliationIssue[]): void {
  const rows = sections.ownership?.rows ?? [];
  summary.shareholderCount = rows.length;
  if (rows.length === 0) {
    issues.push({
      id: nextId(), invariant: "conservation", severity: "coverage", section: "ownership",
      statement: "No shareholders on file — ownership cannot be scored yet.",
      action: "Upload a share register / certificate, or add shareholders.",
    });
    return;
  }

  // DERIVATION: flow-through. Each holder's three dimensions default to each
  // other when absent — economic interest = voting = shareholding — unless a
  // modified (debt-encumbered) structure is explicitly stated. Absent that flag
  // we apply straight flow-through, which is the Codes' default.
  let derived = 0;
  for (const row of rows) {
    const hold = holdingFraction(row);
    if (hold <= 0) continue;
    const pct = Math.round(hold * 10000) / 100; // percent, 2dp
    const set = (col: string) => {
      if (blank(row[col]) || Number(String(row[col]).replace(/[%\s,]/g, "")) === 0) {
        row[col] = pct; derived++;
      }
    };
    // Only fill blanks/zeros; never overwrite a stated non-zero figure.
    set("shareholding");
    set("economicInterest");
    set("votingRights");
  }
  if (derived > 0) {
    issues.push({
      id: nextId(), invariant: "derivation", severity: "resolved", section: "ownership",
      statement: `Filled ${derived} missing ownership figure${derived === 1 ? "" : "s"} by flow-through — a share of the company carries the same economic interest and voting rights unless stated otherwise.`,
    });
  }

  // CONSERVATION: shareholdings close to 100%.
  const totalHold = rows.reduce((a, r) => a + holdingFraction(r), 0);
  const totalPct = Math.round(totalHold * 10000) / 100;
  summary.ownershipClosesTo = totalPct;
  if (totalPct > 100.5) {
    issues.push({
      id: nextId(), invariant: "conservation", severity: "blocking", section: "ownership",
      statement: `The shareholdings on file add up to ${totalPct}%, not 100% — a holding is double-counted or overstated.`,
      action: "Check for a duplicated shareholder or a wrong percentage.",
    });
  } else if (totalPct < 99.5 && totalPct > 0) {
    issues.push({
      id: nextId(), invariant: "conservation", severity: "coverage", section: "ownership",
      statement: `The shareholders on file cover ${totalPct}% of the company — ${Math.round((100 - totalPct) * 100) / 100}% is unaccounted for.`,
      action: "Add the remaining shareholder(s), or correct a percentage.",
    });
  }

  // Entity-level black ownership (flow-through of black fraction × holding).
  let black = 0;
  let blackWomen = 0;
  for (const row of rows) {
    const hold = holdingFraction(row);
    const rowBlack = !blank(row.blackOwnership)
      ? Number(String(row.blackOwnership).replace(/[%\s,]/g, "")) > 1
        ? Number(String(row.blackOwnership).replace(/[%\s,]/g, "")) / 100
        : Number(String(row.blackOwnership).replace(/[%\s,]/g, ""))
      : isBlackRace(str(row.race)) ? 1 : 0;
    const female = str(row.gender).toLowerCase() === "female";
    black += hold * rowBlack;
    if (female) blackWomen += hold * rowBlack;
  }
  summary.blackOwnershipFraction = Math.round(black * 10000) / 10000;
  summary.blackWomenOwnershipFraction = Math.round(blackWomen * 10000) / 10000;

  // DERIVATION (entity-level): a ≥51%/100% black-owned QSE/EME is deemed
  // Level 2/1 by sworn affidavit whatever the scorecard says (Statement 000 §4).
  // Transport is excluded from the deemed regime (legacy code).
  const isTransport = /transport/i.test(summary.sectorCode);
  const isQseOrEme = /qse|eme/i.test(summary.scorecardType);
  if (!isTransport && isQseOrEme) {
    if (summary.blackOwnershipFraction >= 0.999) {
      summary.deemedLevel = 1;
      summary.deemedLevelReason = "100% black-owned QSE — deemed Level 1 by sworn affidavit.";
      issues.push({
        id: nextId(), invariant: "derivation", severity: "resolved", section: "ownership",
        statement: `This company is ${Math.round(summary.blackOwnershipFraction * 100)}% black-owned — a 100% black-owned QSE is deemed Level 1 by affidavit, regardless of the points.`,
      });
    } else if (summary.blackOwnershipFraction >= 0.51) {
      summary.deemedLevel = 2;
      summary.deemedLevelReason = "≥51% black-owned QSE — deemed Level 2 by sworn affidavit.";
    }
  }
}

/**
 * Reconcile a merged, extracted workbook into a coherent entity.
 */
export function reconcileEntity(input: WorkbookSections, opts: ReconcileOptions = {}): ReconcileResult {
  seq = 0;
  // Work on a deep-ish copy so callers keep their raw sections.
  const sections: WorkbookSections = {};
  for (const [k, v] of Object.entries(input)) {
    sections[k] = { meta: v.meta ? { ...v.meta } : undefined, rows: (v.rows ?? []).map((r) => ({ ...r })) };
  }
  const issues: ReconciliationIssue[] = [];
  const summary = pushSummaryDefaults(sections, opts);

  normaliseRepresentation(sections, issues);
  reconcileIdentity(sections, issues);
  enforceWellFormedness(sections, summary, issues, opts.entityAliases ?? []);
  reconcileOwnership(sections, summary, issues);

  summary.employeeCount = (sections["management-control"]?.rows ?? sections.employees?.rows ?? []).length;
  summary.supplierCount = (sections.procurement?.rows ?? []).length;
  summary.trainingProgrammeCount = (sections["skills-development"]?.rows ?? []).length;
  summary.scoredSedContributions = (sections.sed?.rows ?? []).length;
  summary.scoredEsdContributions = (sections.esd?.rows ?? []).length;

  // Rank: blocking first (needs the user), then coverage (gaps), then resolved.
  const rank: Record<IssueSeverity, number> = { blocking: 0, coverage: 1, resolved: 2 };
  issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const counts: Record<IssueSeverity, number> = { blocking: 0, coverage: 0, resolved: 0 };
  for (const i of issues) counts[i.severity]++;

  return { sections, issues, summary, counts };
}
