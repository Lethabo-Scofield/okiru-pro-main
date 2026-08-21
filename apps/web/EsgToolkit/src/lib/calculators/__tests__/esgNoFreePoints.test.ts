/**
 * THE PROOF THAT NO FREE POINTS REMAIN.
 *
 * A workbook with no evidence in it must score exactly 0 on every one of the 53
 * indicators. Three defects used to break that:
 *
 *   E d9  5 pts — `Assumptions!B107` fell back to the config's 2050, so every
 *                 company had "formally set an SBTi net-zero target".
 *   S d18 8 pts — `OR(G28=0, G28="—", G28="")` treats "never reported" as
 *                 "zero fatalities".
 *   G d25 5 pts — `IF(G_Data!B25="",5,…)` against a row that does not exist.
 *
 * 18 of 308 points, awarded to a company that had entered nothing at all.
 */
import { describe, expect, it } from "vitest";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeEsgScorecard } from "../index";
import { computeBbbeeBridge } from "../bbbeeBridge";
import { computeCarbonTax } from "../carbonTax";
import { computeNetZeroRoadmap } from "../netZero";
import { scoreEnvironmental } from "../environmental";
import { scoreGovernance } from "../governance";
import { scoreSocial } from "../social";

function workbookOf(sections: Record<string, Record<string, string | number | boolean | null>>): EsgWorkbookData {
  return {
    companyId: "blank",
    sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])),
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** A workbook a real user can produce: named the company, nothing else. */
const NAMED_ONLY = workbookOf({
  "company-reporting-setup": { entity: "Test Co (Pty) Ltd", period: "FY 2026" },
});

/** The next realistic state: thresholds and a scoring stance chosen, no data. */
const STANCE_ONLY = workbookOf({
  "company-reporting-setup": { entity: "Test Co (Pty) Ltd" },
  assumptions: {
    B8: "Standard", B9: 0.5, B43: 0.1, B44: 0.2, B45: 1.05, B46: 0.05, B48: 0.75,
    B50: 0.6, B51: 0.3, B52: 0.02, B53: 40, B54: 0.8, B55: 2, B56: 0.01,
    B37: 236, B38: 640, B39: 0.6,
  },
});

/** Every input section present but completely empty — the app's own empty shape. */
const EMPTY_SECTIONS = workbookOf({
  "company-reporting-setup": { entity: "Test Co (Pty) Ltd" },
  assumptions: {},
  "e-data": {},
  "s-data": {},
  "g-data": {},
  ee: {},
  fleet: {},
  waste: {},
  king5: {},
  ifrs: {},
  "driver-debrief": {},
  "s-data-csi": {},
});

describe.each([
  ["named only", NAMED_ONLY],
  ["stance + thresholds, no data", STANCE_ONLY],
  ["all sections present but empty", EMPTY_SECTIONS],
])("a blank workbook (%s) scores 0 on every indicator", (_label, blank) => {
  const derived = deriveEsgSummaryCells(blank);
  const e = scoreEnvironmental(derived);
  const s = scoreSocial(derived);
  const g = scoreGovernance(derived);

  it("Environmental — every row is 0", () => {
    expect(Object.entries(e.rows).filter(([, v]) => v !== 0)).toEqual([]);
    expect(e.score).toBe(0);
  });

  it("Social — every row is 0", () => {
    expect(Object.entries(s.rows).filter(([, v]) => v !== 0)).toEqual([]);
    expect(s.score).toBe(0);
  });

  it("Governance — every row is 0", () => {
    expect(Object.entries(g.rows).filter(([, v]) => v !== 0)).toEqual([]);
    expect(g.score).toBe(0);
  });

  it("all 53 indicators are accounted for", () => {
    const count =
      Object.keys(e.rows).length + Object.keys(s.rows).length + Object.keys(g.rows).length;
    expect(count).toBe(53);
  });

  it("the whole scorecard is 0%", () => {
    const result = computeEsgScorecard(blank)!;
    expect(result.environmental.score).toBe(0);
    expect(result.social.score).toBe(0);
    expect(result.governance.score).toBe(0);
    expect(result.overallPercent).toBe(0);
  });

  it("carbon tax is R0 — no emissions were entered", () => {
    const tax = computeCarbonTax(derived);
    expect(tax.ytdTco2e).toBe(0);
    expect(tax.taxableTco2e).toBe(0);
    expect(tax.tier1Liability).toBe(0);
    expect(tax.tier2Liability).toBe(0);
  });

  it("the net-zero roadmap reports unavailable rather than a gap of 0", () => {
    const nz = computeNetZeroRoadmap(derived);
    expect(nz.available).toBe(false);
    expect(nz.milestones.every((m) => m.onTrack === false)).toBe(true);
    expect(nz.levers).toEqual([]);
  });

  it("the B-BBEE bridge reports 'not determined' rather than a level", () => {
    const bridge = computeBbbeeBridge(derived);
    expect(bridge.statusLevel).toBeNull();
    expect(bridge.statusLevelNote).toMatch(/not determined/i);
  });
});

describe("the specific unconditional scores that were removed", () => {
  it("E d9 no longer inherits a net-zero target year from the sector config", () => {
    expect(scoreEnvironmental(deriveEsgSummaryCells(STANCE_ONLY)).rows.d9).toBe(0);
  });

  it("S d18 no longer reads 'nothing reported' as 'zero fatalities'", () => {
    expect(scoreSocial(deriveEsgSummaryCells(STANCE_ONLY)).rows.d18).toBe(0);
  });

  it("G d25 no longer scores a G_Data row that does not exist", () => {
    expect(scoreGovernance(deriveEsgSummaryCells(STANCE_ONLY)).rows.d25).toBe(0);
  });

  it("S d23 no longer defaults the CSI initiative count to its own threshold", () => {
    expect(scoreSocial(deriveEsgSummaryCells(STANCE_ONLY)).rows.d23).toBe(0);
  });

  it("together they were worth 18 points to an empty workbook", () => {
    const derived = deriveEsgSummaryCells(STANCE_ONLY);
    const parity =
      scoreEnvironmental(derived, { mode: "workbook-parity" }).score +
      scoreSocial(derived, { mode: "workbook-parity" }).score +
      scoreGovernance(derived, { mode: "workbook-parity" }).score;
    // Parity mode still gives S d18 (8) + G d25 (5) = 13; E d9's 5 was a config
    // fallback rather than a workbook formula, so it is gone in both modes.
    expect(parity).toBe(13);
  });
});
