/**
 * Pure parsing helper for Skills Development bulk-upload.
 *
 * Extracted from `SkillsDevelopment.tsx#handleBulkUpload` so the row-mapping
 * logic can be unit-tested without React / FileReader. The component now wraps
 * this with a FileReader and toasts.
 *
 * Header matching is case- and punctuation-insensitive; unrecognised columns
 * are ignored. Rows missing required fields (program / learner / >0 cost) are
 * skipped.
 */
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { isBlackRace, normalizeRace, normalizeSpendFraction } from "@toolkit/lib/calculators/shared";
import type { TrainingProgram, TrainingCategoryCode } from "@toolkit/lib/types";

export type SkillsBulkUploadResult = {
  programs: TrainingProgram[];
  skipped: number;
  error?: string;
};

/**
 * Pure helper extracted from `SkillsDevelopment.tsx` so the
 * `targetSpend = leviableAmount * overallTargetPct` and
 * `bursaryTarget = leviableAmount * bursaryTargetPct` formulas (used by the
 * Skills KPI cards) are unit-testable. Mirrors the in-component derivation
 * at sections.ts lines around 191–194:
 *
 *   const overallTargetPct = sc?.overallSpendPercent ?? sc?.overallTarget ?? 0.035;
 *   const targetSpend       = leviableAmount * overallTargetPct;
 *   const bursaryTarget     = leviableAmount * bursaryTargetPct;
 */
export function computeSkillsTargets(input: {
  leviableAmount: number;
  overallTargetPct?: number;
  bursaryTargetPct?: number;
}): { targetSpend: number; bursaryTarget: number; overallTargetPct: number; bursaryTargetPct: number } {
  const leviable = Number.isFinite(input.leviableAmount) ? Math.max(0, input.leviableAmount) : 0;
  const overallTargetPct = normalizeSpendFraction(input.overallTargetPct, 0.035);
  const bursaryTargetPct = normalizeSpendFraction(input.bursaryTargetPct, 0.025);
  return {
    targetSpend: leviable * overallTargetPct,
    bursaryTarget: leviable * bursaryTargetPct,
    overallTargetPct,
    bursaryTargetPct,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const yes = (v: unknown): boolean => /^(y|yes|true|1)$/i.test(String(v ?? "").trim());

const numAt = (r: unknown[], i: number): number => {
  if (i < 0) return 0;
  const n = Number(String(r[i] ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const strAt = (r: unknown[], i: number): string => (i < 0 ? "" : String(r[i] ?? "").trim());

const normalizeRaceForProgram = (v: string): TrainingProgram["race"] => {
  const mapped = normalizeRace(v);
  if (mapped === "African" || mapped === "Coloured" || mapped === "Indian" || mapped === "White") {
    return mapped;
  }
  const lower = v.toLowerCase();
  if (lower.startsWith("afr")) return "African";
  if (lower.startsWith("col")) return "Coloured";
  if (lower.startsWith("ind")) return "Indian";
  return "White";
};

const normalizeGender = (v: string): "Male" | "Female" =>
  /^f/i.test(v) ? "Female" : "Male";

const normalizeCategory = (v: string): TrainingCategoryCode => {
  const c = v.toUpperCase().trim().charAt(0);
  return (["A", "B", "C", "D", "E", "F", "G"].includes(c) ? c : "C") as TrainingCategoryCode;
};

/**
 * Parses an xlsx/csv ArrayBuffer that matches the downloaded Information
 * Request "Skills Development" sheet headers. Returns the list of valid
 * `TrainingProgram` rows and the number of skipped/invalid rows.
 *
 * Errors (no recognisable sheet, missing required headers) surface via
 * `result.error` with `programs: []`.
 */
export function parseSkillsBulkUploadBuffer(
  data: ArrayBuffer | Uint8Array,
): SkillsBulkUploadResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: "array" });
  } catch {
    return { programs: [], skipped: 0, error: "Could not read the file. Use the downloaded template format." };
  }
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return { programs: [], skipped: 0, error: "No sheets found in workbook." };
  }
  const sheetName = wb.SheetNames.find((n) => /skills/i.test(n)) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  if (matrix.length < 2) {
    return { programs: [], skipped: 0, error: "Empty file: no rows found." };
  }
  let headerIdx = matrix.findIndex((r) =>
    r.some((c) => /program\s*name|training\s*program/i.test(String(c))),
  );
  if (headerIdx < 0) headerIdx = 0;
  const headers = matrix[headerIdx].map((h) => String(h).trim());
  const rows = matrix.slice(headerIdx + 1);

  const idx = (...names: string[]): number => {
    const want = names.map(norm);
    return headers.findIndex((h) => want.includes(norm(h)));
  };
  const col = {
    program: idx("Training Program Name *", "Training Program Name", "Program Name", "Programme"),
    category: idx("Category *", "Category"),
    provider: idx("Training Provider", "Provider"),
    learner: idx("Learner Name *", "Learner Name"),
    idNumber: idx("ID Number", "ID"),
    gender: idx("Gender *", "Gender"),
    race: idx("Race *", "Race"),
    disabled: idx("Disabled?", "Disabled", "Is Disabled"),
    foreign: idx("Foreign?", "Foreign", "Is Foreign"),
    employed: idx("Employed?", "Employed"),
    completed: idx("Completed?", "Completed"),
    absorbed: idx("Absorbed?", "Absorbed"),
    courseCost: idx("Course Cost"),
    travelCost: idx("Travel Cost"),
    accomCost: idx("Accommodation Cost"),
    cateringCost: idx("Catering Cost"),
    stationeryCost: idx("Stationery Cost"),
    facilityCost: idx("Training Facility Cost", "Facility Cost"),
    salaryCost: idx("Salary Cost (category B,C,D only)", "Salary Cost"),
    otherCosts: idx("Other Costs", "Other Cost"),
    startDate: idx("Start Date (dd/mm/yyyy)", "Start Date"),
    endDate: idx("End Date (dd/mm/yyyy)", "End Date"),
  };
  if (col.program < 0 || col.learner < 0) {
    return {
      programs: [],
      skipped: 0,
      error: "Could not find required Program / Learner columns.",
    };
  }

  const programs: TrainingProgram[] = [];
  let skipped = 0;
  for (const r of rows) {
    const program = strAt(r, col.program);
    const learner = strAt(r, col.learner);
    if (!program || !learner) {
      skipped++;
      continue;
    }
    const categoryCode = normalizeCategory(strAt(r, col.category) || "C");
    const race = normalizeRaceForProgram(strAt(r, col.race) || "African");
    const courseCost = numAt(r, col.courseCost);
    const travelCost = numAt(r, col.travelCost);
    const accommodationCost = numAt(r, col.accomCost);
    const cateringCost = numAt(r, col.cateringCost);
    const stationeryCost = numAt(r, col.stationeryCost);
    const facilityCost = numAt(r, col.facilityCost);
    const salaryCost = numAt(r, col.salaryCost);
    const otherCosts = numAt(r, col.otherCosts);
    const totalCost =
      courseCost + travelCost + accommodationCost + cateringCost + stationeryCost + facilityCost + salaryCost + otherCosts;
    if (totalCost <= 0) {
      skipped++;
      continue;
    }

    const intervention: TrainingProgram = {
      id: uuidv4(),
      programName: program,
      trainingProvider: strAt(r, col.provider),
      categoryCode,
      learnerName: learner,
      learnerIdNumber: strAt(r, col.idNumber) || undefined,
      gender: normalizeGender(strAt(r, col.gender)),
      race,
      isDisabled: yes(r[col.disabled]),
      isForeign: yes(r[col.foreign]),
      employmentStatus: yes(r[col.employed]) ? "Permanent" : "Unemployed",
      isYesEmployee: false,
      isCompleted: yes(r[col.completed]),
      isAbsorbed: yes(r[col.absorbed]),
      transactionDate: new Date().toISOString().split("T")[0],
      startDate: strAt(r, col.startDate) || undefined,
      endDate: strAt(r, col.endDate) || undefined,
      courseCost,
      travelCost,
      accommodationCost,
      cateringCost,
      stationeryCost,
      facilityCost,
      salaryCost,
      otherCosts,
      isAbet: false,
      isMandatory: false,
      isBursary: categoryCode === "A",
      totalCost,
      name: program,
      category: categoryCode === "A" ? "bursary" : categoryCode === "B" ? "learnership" : "short_course",
      cost: totalCost,
      isEmployed: yes(r[col.employed]),
      isBlack: isBlackRace(race),
    };
    programs.push(intervention);
  }

  return { programs, skipped };
}
