import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  ESG_SCORECARD_PILLAR_MAX,
  SCORECARD_INDICATORS,
  esgIndicatorMaxPoints,
  esgPillarMaxPoints,
  sumIndicatorMaxPoints,
  type EsgScorecardPillar,
} from "../esgScorecardDefinitions";
import { ESG_PILLAR_MAX } from "../esgScoringDefaults";
import { ESG_TOOLKIT_PILLAR_NAV } from "../esgToolkitNav";
import {
  PILLAR_MAX_ENVIRONMENTAL,
  PILLAR_MAX_GOVERNANCE,
  PILLAR_MAX_SOCIAL,
} from "../../../../EsgToolkit/src/lib/esgConfig/consumer-goods";

/**
 * THE ANTI-DIVERGENCE GATE.
 *
 * ESG points allocation was hand-maintained in four places that disagreed:
 * `esgScorecardDefinitions.ts`, the dashboard's private pillar-row table, the
 * nav `scoreGroup.max` literals, and the `PILLAR_MAX_*` constants. The dashboard
 * copy summed E to 106 (declared 108) and S to 93 (declared 100), so the same
 * indicator showed a different "Max Pts" and "% Achieved" depending on which
 * page you were looking at.
 *
 * `esgScorecardDefinitions.ts` is now the single source of truth and everything
 * else derives from it. This suite is what keeps it that way: it checks the
 * definitions against the extracted workbook itself, then checks that every
 * derived consumer still reconciles to the same totals.
 */

const EXTRACTED = resolve(import.meta.dirname, "../../../../../../docs/esg/extracted");

/** Workbook pillar maxima — Σ column B on each `*_Scorecard` sheet. */
const EXPECTED_PILLAR_MAX = { environmental: 108, social: 100, governance: 100 } as const;

const SHEET: Record<EsgScorecardPillar, string> = {
  environmental: "E_Scorecard",
  social: "S_Scorecard",
  governance: "G_Scorecard",
};

const PILLARS: EsgScorecardPillar[] = ["environmental", "social", "governance"];

type ExtractedCell = { value?: unknown };
type ExtractedRow = { row: number; cells: Record<string, ExtractedCell | undefined> };

/**
 * Read column A (label) + column B (max points) for the scored rows of a sheet.
 * A row is "scored" when column B holds a number — the `── GHG ──` band headers
 * and the TOTAL row have no B value and are correctly excluded.
 */
function readWorkbookColumnB(pillar: EsgScorecardPillar): Map<number, { a: string; b: number }> {
  const raw = readFileSync(resolve(EXTRACTED, `${SHEET[pillar]}.json`), "utf8");
  const parsed = JSON.parse(raw) as { rows: ExtractedRow[] };
  const out = new Map<number, { a: string; b: number }>();
  for (const row of parsed.rows) {
    const a = row.cells?.["1"]?.value;
    const b = row.cells?.["2"]?.value;
    if (typeof a !== "string") continue;
    const n = Number(b);
    if (b === undefined || b === null || b === "" || !Number.isFinite(n)) continue;
    out.set(row.row, { a, b: n });
  }
  return out;
}

describe("ESG points allocation — single source of truth", () => {
  describe.each(PILLARS)("%s definitions vs workbook", (pillar) => {
    const workbook = readWorkbookColumnB(pillar);
    const defs = SCORECARD_INDICATORS[pillar];

    it(`covers exactly the scored rows of ${SHEET[pillar]} — no extra, none missing`, () => {
      expect(defs.map((d) => d.row).sort((x, y) => x - y)).toEqual(
        Array.from(workbook.keys()).sort((x, y) => x - y),
      );
    });

    it(`maxPoints matches ${SHEET[pillar]}!B{row} for every indicator`, () => {
      const mismatches = defs
        .filter((d) => workbook.get(d.row)?.b !== d.maxPoints)
        .map((d) => `${d.key}: def=${d.maxPoints} workbook=${workbook.get(d.row)?.b}`);
      expect(mismatches).toEqual([]);
    });

    it(`label matches ${SHEET[pillar]}!A{row} verbatim for every indicator`, () => {
      const mismatches = defs
        .filter((d) => workbook.get(d.row)?.a !== d.indicator)
        .map((d) => `${d.key}: def=${JSON.stringify(d.indicator)}`);
      expect(mismatches).toEqual([]);
    });

    it("key is d{row}, so the key encodes its own source cell", () => {
      expect(defs.filter((d) => d.key !== `d${d.row}`)).toEqual([]);
    });
  });

  describe("pillar totals", () => {
    it.each(PILLARS)("%s indicator maxPoints sum to the pillar maximum", (pillar) => {
      expect(esgPillarMaxPoints(pillar)).toBe(EXPECTED_PILLAR_MAX[pillar]);
      expect(ESG_SCORECARD_PILLAR_MAX[pillar]).toBe(EXPECTED_PILLAR_MAX[pillar]);
    });

    it("E=108, S=100, G=100 explicitly", () => {
      expect(ESG_SCORECARD_PILLAR_MAX).toEqual({
        environmental: 108,
        social: 100,
        governance: 100,
      });
    });

    it("agrees with ESG_PILLAR_MAX in esgScoringDefaults", () => {
      expect({ ...ESG_PILLAR_MAX }).toEqual(ESG_SCORECARD_PILLAR_MAX);
    });

    it("agrees with PILLAR_MAX_* in esgConfig/consumer-goods", () => {
      expect({
        environmental: PILLAR_MAX_ENVIRONMENTAL,
        social: PILLAR_MAX_SOCIAL,
        governance: PILLAR_MAX_GOVERNANCE,
      }).toEqual(ESG_SCORECARD_PILLAR_MAX);
    });
  });

  describe("nav score groups derive from the definitions", () => {
    const groups = ESG_TOOLKIT_PILLAR_NAV.flatMap((p) =>
      (p.children ?? []).map((c) => ({ id: c.id, group: c.scoreGroup })),
    );

    it("every score-group key is a real indicator", () => {
      for (const { id, group } of groups) {
        if (!group) continue;
        for (const key of group.keys) {
          expect(() => esgIndicatorMaxPoints(group.pillar, key), `${id} → ${key}`).not.toThrow();
        }
      }
    });

    it("every score-group max equals the sum of its members' maxPoints", () => {
      for (const { id, group } of groups) {
        if (!group) continue;
        expect(group.max, `${id}`).toBe(sumIndicatorMaxPoints(group.pillar, group.keys));
      }
    });

    it.each(PILLARS)("%s nav score-group maxima sum to the pillar total", (pillar) => {
      const total = groups
        .filter((g) => g.group?.pillar === pillar)
        .reduce((sum, g) => sum + (g.group?.max ?? 0), 0);
      expect(total).toBe(EXPECTED_PILLAR_MAX[pillar]);
    });

    it.each(PILLARS)(
      "%s nav score groups partition the pillar — every indicator owned exactly once",
      (pillar) => {
        const claimed = groups
          .filter((g) => g.group?.pillar === pillar)
          .flatMap((g) => g.group?.keys ?? []);
        const defined = SCORECARD_INDICATORS[pillar].map((d) => d.key);

        // No indicator claimed by two pages (that would double-count points).
        expect(claimed).toHaveLength(new Set(claimed).size);
        // No indicator orphaned (that would make it unreachable in the UI).
        expect(claimed.slice().sort()).toEqual(defined.slice().sort());
      },
    );
  });

  describe("g-board has no indicators of its own", () => {
    const governance = ESG_TOOLKIT_PILLAR_NAV.find((p) => p.id === "governance");
    const board = governance?.children?.find((c) => c.id === "g-board");

    it("exists as an input-only page", () => {
      expect(board).toBeDefined();
      expect(board?.sectionKey).toBe("g-data");
    });

    /**
     * Documented absence, not an oversight: all 14 G_Scorecard rows are claimed
     * by g-king5 / g-ifrs / g-garp / g-ethics (asserted by the partition test
     * above). Board Composition edits the G_Data maturity cells that feed those
     * indicators, so scoring it too would double-count. If the ledger ever
     * assigns G_Scorecard rows to this page, the partition test fails first and
     * this expectation is the deliberate thing to revisit.
     */
    it("carries no scoreGroup, and governance is still fully covered without it", () => {
      expect(board?.scoreGroup).toBeUndefined();
      const covered = (governance?.children ?? [])
        .filter((c) => c.scoreGroup)
        .reduce((sum, c) => sum + (c.scoreGroup?.max ?? 0), 0);
      expect(covered).toBe(100);
    });
  });

  describe("guardrails", () => {
    it("an unknown indicator key throws instead of silently scoring 0", () => {
      expect(() => esgIndicatorMaxPoints("environmental", "d999")).toThrow(/Unknown ESG indicator/);
      expect(() => sumIndicatorMaxPoints("social", ["d5", "nope"])).toThrow(/Unknown ESG indicator/);
    });
  });
});
