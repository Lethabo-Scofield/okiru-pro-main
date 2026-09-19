/**
 * The auditor workbook must foot.
 *
 * Every pillar row used to take its score from a fresh re-run of the
 * calculators, while the TOTAL row took state.scorecard.total.score. The store
 * applies three things the bare re-run does not — pipelineOverrides,
 * choose-one elective zeroing, and the extra pillars (employmentEquity, AFS,
 * empowermentFinancing) — so the rows and the total in one and the same sheet
 * disagreed, and an auditor reconciling them found a gap the document did not
 * explain.
 *
 * These read the generated workbook and check the arithmetic, which is the
 * property that was broken rather than any particular line of code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

const written: { rows: unknown[][]; name: string }[] = [];

vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return {
    ...actual,
    writeFile: vi.fn(),
    utils: {
      ...actual.utils,
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => {
        written.push({ name, rows: actual.utils.sheet_to_json(ws as never, { header: 1 }) as unknown[][] });
        return actual.utils.book_append_sheet(wb as never, ws as never, name);
      },
    },
  };
});

const { exportAuditorExcel } = await import("../exportExcel");
const { makeCalculatorConfig } = await import("../../test/makeCalculatorConfig");

/** A scorecard whose pillars deliberately sum to the stated total. */
function scorecardFixture() {
  const pillar = (score: number, target: number, subMinimumMet?: boolean) => ({
    score,
    target,
    weighting: target,
    ...(subMinimumMet === undefined ? {} : { subMinimumMet }),
  });
  return {
    ownership: pillar(20, 25, true),
    managementControl: pillar(15, 19),
    skillsDevelopment: pillar(18, 25, true),
    procurement: pillar(22, 29, true),
    supplierDevelopment: pillar(8, 10, true),
    enterpriseDevelopment: pillar(5, 7, true),
    socioEconomicDevelopment: pillar(4, 5),
    yesInitiative: pillar(0, 0),
    total: pillar(92, 120),
    achievedLevel: 4,
    discountedLevel: 4,
    isDiscounted: false,
    recognitionLevel: "100%",
  };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    client: { id: "c1", name: "Test Co", revenue: 1e8, npat: 1e7, leviableAmount: 5e6, financialYear: "2025" },
    ownership: { id: "", clientId: "c1", shareholders: [], companyValue: 0, outstandingDebt: 0, yearsHeld: 0 },
    management: { id: "", clientId: "c1", employees: [] },
    skills: { id: "", clientId: "c1", leviableAmount: 5e6, trainingPrograms: [] },
    procurement: { id: "", clientId: "c1", tmps: 5e7, suppliers: [] },
    esd: { id: "", clientId: "c1", contributions: [], graduationBonus: false, jobsCreatedBonus: false },
    sed: { id: "", clientId: "c1", contributions: [] },
    calculatorConfig: makeCalculatorConfig(),
    scorecard: scorecardFixture(),
    ...overrides,
  } as never;
}

function sheet(name: string) {
  const s = written.find((w) => w.name === name);
  if (!s) throw new Error(`no sheet "${name}" — got ${written.map((w) => w.name).join(", ")}`);
  return s.rows;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, "")));

beforeEach(() => {
  written.length = 0;
});

describe("auditor workbook footing", () => {
  it("reports each pillar's score from the same result the total is built from", () => {
    exportAuditorExcel(baseState());

    const rows = sheet("Scorecard");
    const find = (label: string) => rows.find((r) => String(r[0] ?? "").trim() === label);

    // Scores, straight off the scorecard fixture.
    expect(num(find("Ownership")?.[4])).toBeCloseTo(20, 2);
    expect(num(find("Management Control")?.[4])).toBeCloseTo(15, 2);
    expect(num(find("Skills Development")?.[4])).toBeCloseTo(18, 2);
    expect(num(find("Preferential Procurement")?.[4])).toBeCloseTo(22, 2);
    expect(num(find("TOTAL")?.[4])).toBeCloseTo(92, 2);
  });

  it("the pillar rows add up to the TOTAL row", () => {
    // The invariant that was broken. The scorecard fixture's pillars sum to
    // its stated total, and the calculators — run against empty pillar data —
    // would produce zeros. So if any row were still sourced from a re-run, the
    // sum would fall short of the total and this fails.
    exportAuditorExcel(baseState());
    const rows = sheet("Scorecard");

    const PILLARS = [
      "Ownership",
      "Management Control",
      "Skills Development",
      "Preferential Procurement",
      "Supplier Development",
      "Enterprise Development",
      "Socio-Economic Development",
      "YES Initiative",
    ];
    const summed = PILLARS.reduce((acc, label) => {
      const row = rows.find((r) => String(r[0] ?? "").trim() === label);
      expect(row, `missing pillar row: ${label}`).toBeDefined();
      return acc + num(row?.[4]);
    }, 0);

    const total = num(rows.find((r) => String(r[0] ?? "").trim() === "TOTAL")?.[4]);
    expect(summed).toBeCloseTo(total, 2);
  });

  it("does not invent a 25-point denominator for a 0-weighted elective", () => {
    exportAuditorExcel(baseState());
    const rows = sheet("Scorecard");
    const yes = rows.find((r) => String(r[0] ?? "").trim() === "YES Initiative");
    // `target || 25` used to report "0.0 / 25 — 0%" for an element the entity
    // is not measured on at all.
    expect(num(yes?.[2])).toBe(0);
  });

  it("gives Employment Equity a row when the sector scores it", () => {
    const sc = scorecardFixture() as Record<string, unknown>;
    sc.employmentEquity = { score: 6, target: 8, weighting: 8 };
    exportAuditorExcel(baseState({ scorecard: sc }));

    const rows = sheet("Scorecard");
    const ee = rows.find((r) => String(r[0] ?? "").trim() === "Employment Equity");
    // It was absent entirely, so its points sat inside the total unaccounted for.
    expect(ee).toBeDefined();
    expect(num(ee?.[4])).toBeCloseTo(6, 2);
  });

  it("the audit sheet agrees with the scorecard sheet", () => {
    exportAuditorExcel(baseState());

    const scorecardTotal = num(sheet("Scorecard").find((r) => String(r[0] ?? "").trim() === "TOTAL")?.[4]);
    const auditTotal = num(sheet("Audit Trail").find((r) => String(r[0] ?? "").trim() === "TOTAL")?.[1]);

    expect(auditTotal).toBeCloseTo(scorecardTotal, 2);
  });

  it("does not flag a sub-minimum failure for a sector that has no sub-minimum", () => {
    const sc = scorecardFixture() as Record<string, Record<string, unknown>>;
    // undefined means "this sector has no sub-minimum here", not "failed".
    delete sc.ownership.subMinimumMet;
    delete sc.skillsDevelopment.subMinimumMet;
    sc.isDiscounted = true as never;
    exportAuditorExcel(baseState({ scorecard: sc }));

    const flags = sheet("Audit Trail").filter((r) => String(r[0] ?? "").trim() === "SUB-MIN FAIL");
    expect(flags).toHaveLength(0);
  });
});
