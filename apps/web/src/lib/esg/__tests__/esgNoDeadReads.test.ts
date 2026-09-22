/**
 * No scorer may read a cell that nothing writes.
 *
 * This is the bug shape that hides best. The read looks connected — it names a
 * real section and a real-looking cell — and returns `null` forever, so the
 * indicator quietly scores zero and no test notices, because a zero is a
 * perfectly ordinary answer. `deriveIfrs` spent its whole life reading
 * `IFRS_S1_S2!C` (the Pillar column) as though it were the Status column and
 * published `E29 = 0` for every imported workbook: ten governance points
 * unreachable, nothing failing.
 *
 * HOW THIS CHECKS, AND WHY NOT STATICALLY
 *
 * The first version of this test matched writes with regexes, and a write like
 * ``d.fill("g-data", `F${row}`)`` could only be reduced to the prefix
 * `g-data!F` — which then matched `g-data!F999` too. A deliberately planted
 * dead read walked straight through it. So the write side is now EMPIRICAL:
 * build a workbook with every input filled, through the app's own write path,
 * derive it, and see which cells actually exist. A read that does not resolve
 * against a maximally-filled workbook cannot resolve against any workbook.
 *
 * The read side stays static, because that is the side we want enumerated
 * exhaustively rather than exercised.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as Config from "@/components/esg-workbook/esgSectionConfigs";
import { ESG_GRID_SECTIONS, ESG_GRID_SECTION_IDS } from "../esgGridSections";
import { writeEsgGridCells } from "../esgGridRows";
import { deriveEsgSummaryCells } from "../esgDeriveSummary";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

const WEB = path.resolve(__dirname, "../../../..");
const readSource = (p: string) => fs.readFileSync(path.join(WEB, p), "utf8");

/**
 * Reads that legitimately resolve to nothing, each with the reason.
 * Anything else unresolved is a defect.
 */
const ACCEPTED: Record<string, string> = {
  // `cover` is the id this section used before it became
  // `company-reporting-setup`. Each read is the second half of a
  // `current || legacy` fallback, for a workbook cached under the old id.
  "cover!entity": "legacy section id, read only as a fallback",
  "cover!period": "legacy section id, read only as a fallback",
  "cover!baselineYear": "legacy section id, read only as a fallback",
  // Documented in esgValidationRules as the legacy month-count marker, kept so
  // a workbook stored before the per-series counts still validates.
  "e-data!_months_C_K": "legacy month-count marker, superseded by per-series counts",
  // `F26 = SUM(F5:F24)` is the sheet's own governance total. The derive layer
  // deliberately does not write it — `esgGovernanceMaturityTotal` recomputes
  // from the F-cells and prefers an explicitly IMPORTED F26 when one exists.
  "g-data!F26": "imported-only total; recomputed from F5:F24 when absent",
};

/** A plausible value for a scalar field, by its declared shape. */
function valueFor(field: { options?: readonly string[]; kind?: string; type?: string }): unknown {
  if (field.options?.length) return field.options[0];
  if (field.kind === "yn") return "Yes";
  if (field.kind === "count") return 0;
  if (field.type === "text") return "Filled";
  return 12;
}

/**
 * Every input the product collects, filled. Registers go through
 * `writeEsgGridCells` so `syncDerivedFields` stamps its derived cells — the
 * step a hand-built fixture skips, and the reason an earlier analysis wrongly
 * read `driver-debrief` as inert.
 */
function maximallyFilledWorkbook(): EsgWorkbookData {
  const sections: Record<string, { cells: Record<string, unknown> }> = {};
  const put = (section: string, ref: string, value: unknown) => {
    (sections[section] ??= { cells: {} }).cells[ref] = value;
  };

  const scalars: Array<[string, ReadonlyArray<any>]> = [
    ["company-reporting-setup", Config.COVER_FIELDS],
    ["assumptions", Config.ASSUMPTIONS_FIELDS],
    [
      "s-data",
      [
        ...Config.S_DATA_HS_FIELDS,
        ...Config.S_DATA_TRAINING_FIELDS,
        ...Config.S_DATA_PAYROLL_FIELDS,
        ...Config.S_DATA_HEADCOUNT_FIELDS,
        ...Config.S_DATA_SCALAR_FIELDS,
      ],
    ],
    [
      "e-data",
      [
        ...Config.E_DATA_SUMMARY_FIELDS,
        ...Config.E_DATA_ENERGY_BASELINE_FIELDS,
        ...Config.E_DATA_WATER_INITIATIVE_FIELDS,
        ...Config.E_DATA_SCOPE_FIELDS,
      ],
    ],
    ["g-data", Config.G_DATA_MATURITY_ROWS],
    ["ee", Config.EE_MATURITY_ROWS],
    ["waste", Config.WASTE_SCALAR_FIELDS],
  ];
  for (const [section, fields] of scalars) {
    for (const f of fields) put(section, f.cell, valueFor(f));
  }

  // Monthly activity grids and the EEA2 headcount matrix.
  for (const prefix of ["s1a", "s1b", "s1c", "s1d", "s2", "solar", "water", "waste"]) {
    for (const col of ["C", "D", "E", "F", "G", "H", "I", "J", "K"]) {
      put("e-data", `${prefix}_${col}14`, 100);
    }
  }
  for (let level = 0; level < 7; level++) {
    for (let col = 0; col < 10; col++) put("s-data", `hc_${level}_${col}`, 3);
  }

  for (const id of ESG_GRID_SECTION_IDS) {
    const def = ESG_GRID_SECTIONS[id];
    const rows = [0, 1, 2, 3].map((i) => {
      const row: Record<string, unknown> = { _id: `r${i}` };
      for (const col of def.columns) {
        if (col.options?.length) row[col.key] = col.options[0];
        else if (col.type === "number") row[col.key] = 10;
        else if (col.type === "date") row[col.key] = "2026-01-05";
        else row[col.key] = `${col.key}${i}`;
      }
      /*
       * The ISO tracker is matched by CLAUSE, not by row position, so a
       * register of placeholder text has no clause 5.2 or 6.1.2 in it and
       * `deriveIsoTracker` correctly publishes nothing. "Maximally filled"
       * has to mean filled with the clauses the rules name.
       */
      if (id === "iso-tracker") row.clause = ["6.1.2", "5.2", "6.1.3", "10"][i] ?? "4.1";
      return row;
    });
    sections[id] = { cells: writeEsgGridCells(id, rows) };
  }

  return { companyId: "DEADREADS", sections, updatedAt: "2026-01-01T00:00:00.000Z" };
}

const CONSUMERS = [
  "EsgToolkit/src/lib/calculators/environmental.ts",
  "EsgToolkit/src/lib/calculators/social.ts",
  "EsgToolkit/src/lib/calculators/governance.ts",
  "EsgToolkit/src/lib/calculators/dashboard.ts",
  "EsgToolkit/src/lib/calculators/bbbeeBridge.ts",
  "src/lib/esg/esgValidationRules.ts",
];

/** Every `section!ref` the scoring and validation layers read by literal. */
function readCells(): Array<{ file: string; section: string; ref: string }> {
  const out: Array<{ file: string; section: string; ref: string }> = [];
  for (const file of CONSUMERS) {
    const src = readSource(file);
    for (const m of src.matchAll(
      /read(?:EsgCell|EsgText)\(\s*\w+\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"/g,
    )) {
      out.push({ file, section: m[1], ref: m[2] });
    }
    // The scorers' own helpers take the REF first and the section second.
    for (const m of src.matchAll(/\b(?:num|str)\(\s*\w+\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)) {
      out.push({ file, section: m[2], ref: m[1] });
    }
    // `fCell` is governance.ts's G_Data accessor.
    for (const m of src.matchAll(/\bfCell\(\s*\w+\s*,\s*"([^"]+)"\s*\)/g)) {
      out.push({ file, section: "g-data", ref: m[1] });
    }
  }
  return out;
}

function unresolvedReads(workbook: EsgWorkbookData): Map<string, string> {
  const derived = deriveEsgSummaryCells(workbook);
  const offenders = new Map<string, string>();
  for (const { file, section, ref } of readCells()) {
    const key = `${section}!${ref}`;
    if (ACCEPTED[key]) continue;
    if (derived.sections?.[section]?.cells?.[ref] !== undefined) continue;
    offenders.set(key, file.replace(/^.*\//, ""));
  }
  return offenders;
}

describe("no scorer reads a cell that nothing writes", () => {
  it("every read resolves against a maximally-filled workbook", () => {
    const offenders = unresolvedReads(maximallyFilledWorkbook());
    expect(
      [...offenders].map(([key, file]) => `${key} (read by ${file}) — nothing ever writes this`),
    ).toEqual([]);
  });

  it("catches a dead read that is planted in a scorer", () => {
    // Guards the guard. The previous version of this test matched writes with
    // regexes and reduced ``d.fill("g-data", `F${row}`)`` to the prefix
    // `g-data!F`, which then matched `g-data!F999` — a planted dead read
    // walked straight through. This asserts the check has teeth.
    const workbook = deriveEsgSummaryCells(maximallyFilledWorkbook());
    expect(workbook.sections?.["g-data"]?.cells?.F13).toBeDefined(); // really written
    expect(workbook.sections?.["g-data"]?.cells?.F999).toBeUndefined(); // never written
    expect(readCells().length).toBeGreaterThan(40);
  });

  it("keeps every accepted exception justified", () => {
    // An exception that has since gained a writer should be deleted from the
    // list, not left to rot into a lie about the code.
    const derived = deriveEsgSummaryCells(maximallyFilledWorkbook());
    for (const key of Object.keys(ACCEPTED)) {
      const [section, ref] = key.split("!");
      expect(`${key}:${derived.sections?.[section]?.cells?.[ref] !== undefined}`).toBe(
        `${key}:false`,
      );
    }
  });
});
