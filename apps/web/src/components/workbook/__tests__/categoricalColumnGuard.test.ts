/**
 * Regression — every categorical column must render as a constrained
 * dropdown, not a free-text input. Plus a smoke check that the Toolkit
 * pages render the B-BBEE Level as a `<Select>` (not number input).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { SECTIONS } from "../sections";

const CATEGORICAL_KEYS = new Set([
  "race",
  "gender",
  "bbbeeLevel",
  "enterpriseType",
  "contributionType",
  "esdCategory",
  "province",
  "currentSize",
  "sizeAtFirstProcurement",
  "measuredUnder",
  "categoryCode",
  "designation",
  "occupationalLevel",
]);

describe("Categorical columns — type=select with non-empty options", () => {
  for (const section of SECTIONS) {
    const cols = section.columns ?? section.meta ?? [];
    for (const col of cols) {
      if (!CATEGORICAL_KEYS.has(col.key)) continue;
      it(`${section.key}.${col.key} is a constrained select`, () => {
        expect(col.type, `${section.key}.${col.key}.type`).toBe("select");
        expect(Array.isArray(col.options), `${section.key}.${col.key}.options`).toBe(true);
        expect(col.options!.length).toBeGreaterThan(0);
      });
    }
  }
});

describe("B-BBEE Level — canonical option list", () => {
  // Source of truth: SECTIONS PROCUREMENT_COLUMNS.bbbeeLevel options.
  const bbbeeCol = SECTIONS.find((s) => s.key === "procurement")!
    .columns!
    .find((c) => c.key === "bbbeeLevel")!;

  it("options match BBBEE_LEVEL_OPTIONS as declared in sections.ts", () => {
    expect(bbbeeCol.options).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "Non-compliant",
    ]);
  });
});

describe("Toolkit ESD / Procurement pages — B-BBEE Level renders as <Select>", () => {
  // We don't pull in @testing-library/react (not used by this repo's vitest
  // setup). Source-level smoke check: the JSX must include a Select for the
  // B-BBEE Level field and must NOT use an <Input type="number"> for it.
  // __dirname → apps/web/src/components/workbook/__tests__ → up 4 = apps/web
  const root = path.resolve(__dirname, "../../../..");
  const esd = readFileSync(path.join(root, "Toolkit/src/pages/pillars/ESD.tsx"), "utf8");
  const proc = readFileSync(path.join(root, "Toolkit/src/pages/pillars/Procurement.tsx"), "utf8");

  it("ESD.tsx renders B-BBEE Level via Select with full level list", () => {
    expect(esd).toMatch(/B-BBEE Level[\s\S]{0,200}<Select/);
    expect(esd).toContain("Non-compliant");
    expect(esd).not.toMatch(/B-BBEE Level[\s\S]{0,200}type=\{?["']number/);
  });

  it("Procurement.tsx renders B-BBEE Level via Select with full level list", () => {
    expect(proc).toMatch(/B-BBEE Level[\s\S]{0,200}<Select/);
    expect(proc).toContain("Non-compliant");
    expect(proc).not.toMatch(/B-BBEE Level[\s\S]{0,200}type=\{?["']number/);
  });
});
