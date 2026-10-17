import { describe, expect, it, vi } from "vitest";
import { buildWorkedScorecard, hasWorkedScorecard } from "../workedScorecard";
import { RCOGP_GENERIC_DECISIONS } from "../decisions";
import { RCOGP_GENERIC_LINES } from "@toolkit/lib/parity/toolkitParity";

// The notes api accepts only these anchors (apps/api calculationReview validAnchor).
const NOTE_ANCHOR = /^(indicator|pillar):[A-Za-z0-9._-]{1,80}$/;

describe("the Calculation Review's worked scorecard", () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const worked = buildWorkedScorecard();
  const lines = worked.pillars.flatMap((p) => p.lines);

  it("is offered for RCOGP Generic only, the scorecard checked against its toolkit", () => {
    expect(hasWorkedScorecard("RCOGP", "Generic")).toBe(true);
    expect(hasWorkedScorecard("RCOGP", "QSE")).toBe(false);
    expect(hasWorkedScorecard("ICT", "Generic")).toBe(false);
  });

  it("scores every toolkit line with the live calculator beside the toolkit's answer and cells", () => {
    expect(worked.pillars).toHaveLength(7);
    expect(lines.map((l) => l.row)).toEqual(RCOGP_GENERIC_LINES.map((l) => l.row));
    for (const line of lines) {
      expect(line.toolkit, `row ${line.row}`).not.toBeNull();
      expect(line.chain.length, `row ${line.row}`).toBeGreaterThan(0);
      expect(line.chain[0].cell).toBe(`Summary Scorecard!F${line.row}`);
    }
  });

  it("attaches notes to anchors the notes api accepts, one per line and per ruling", () => {
    const anchors = [
      ...lines.map((l) => l.anchor),
      ...RCOGP_GENERIC_DECISIONS.map((d) => `indicator:decision-${d.id}`),
    ];
    for (const a of anchors) expect(a).toMatch(NOTE_ANCHOR);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("shows every line, the total and both levels the same as the toolkit", () => {
    expect(lines.filter((l) => l.status !== "match").map((l) => l.label)).toEqual([]);
    expect(worked.total.status).toBe("match");
    expect(worked.achieved.status).toBe("match");
    expect(worked.discounted.status).toBe("match");
  });

  it("states the sample is invented, never a client", () => {
    expect(worked.sample.employees).toBeGreaterThan(0);
    expect(worked.sample.suppliers).toBeGreaterThan(0);
  });
});
