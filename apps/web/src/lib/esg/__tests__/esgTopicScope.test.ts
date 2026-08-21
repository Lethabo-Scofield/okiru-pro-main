import { describe, expect, it } from "vitest";
import {
  ALL_ESG_TOPIC_IDS,
  ESG_TOPIC_PILLARS,
  computeScopedSummary,
  parseReportMode,
  parseSelectedTopics,
  readReportScopeFromCells,
  serializeSelectedTopics,
  topicNavVisibility,
} from "../esgTopicScope";
import type { EsgScorecardResult } from "../../../../EsgToolkit/src/lib/calculators";

function fakeScorecard(rowValue = 1): EsgScorecardResult {
  const fill = (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, rowValue])) as Record<string, number>;
  return {
    environmentalRows: fill(["d5", "d6", "d7", "d8", "d9", "d11", "d12", "d13", "d15", "d16", "d17", "d19", "d20", "d21", "d23", "d24", "d26", "d27", "d28", "d29"]),
    socialRows: fill(["d5", "d6", "d7", "d8", "d9", "d10", "d12", "d13", "d14", "d15", "d17", "d18", "d19", "d20", "d22", "d23", "d24", "d26", "d27"]),
    governanceRows: fill(["d5", "d6", "d7", "d9", "d10", "d12", "d14", "d16", "d17", "d19", "d20", "d22", "d24", "d25"]),
  } as unknown as EsgScorecardResult;
}

describe("esgTopicScope taxonomy", () => {
  it("derives 15 topics across the three pillars from the nav tree", () => {
    expect(ALL_ESG_TOPIC_IDS).toHaveLength(15);
    expect(ESG_TOPIC_PILLARS.map((g) => g.topics.length)).toEqual([6, 4, 5]);
    expect(ALL_ESG_TOPIC_IDS).toContain("e-ghg");
    expect(ALL_ESG_TOPIC_IDS).toContain("s-mc");
    expect(ALL_ESG_TOPIC_IDS).toContain("g-king5");
  });
});

describe("parse/serialize", () => {
  it("defaults to framework mode for anything that is not 'topic'", () => {
    expect(parseReportMode(undefined)).toBe("framework");
    expect(parseReportMode("framework")).toBe("framework");
    expect(parseReportMode("banana")).toBe("framework");
    expect(parseReportMode("topic")).toBe("topic");
  });

  it("defaults to all topics selected when absent or blank (opt-out, not opt-in)", () => {
    expect(parseSelectedTopics(undefined)).toEqual(ALL_ESG_TOPIC_IDS);
    expect(parseSelectedTopics("")).toEqual(ALL_ESG_TOPIC_IDS);
    expect(parseSelectedTopics("   ")).toEqual(ALL_ESG_TOPIC_IDS);
  });

  it("parses a CSV subset and drops unknown ids", () => {
    expect(parseSelectedTopics("e-ghg, s-mc ,nonsense")).toEqual(["e-ghg", "s-mc"]);
  });

  it("falls back to all topics when every id is unknown", () => {
    expect(parseSelectedTopics("a,b,c")).toEqual(ALL_ESG_TOPIC_IDS);
  });

  it("serializes in canonical nav order and round-trips", () => {
    const csv = serializeSelectedTopics(["s-mc", "e-ghg"]);
    expect(csv).toBe("e-ghg,s-mc");
    expect(parseSelectedTopics(csv)).toEqual(["e-ghg", "s-mc"]);
  });

  it("reads scope from assumptions cells", () => {
    expect(
      readReportScopeFromCells({ _reportMode: "topic", _selectedTopics: "e-ghg,g-king5" }),
    ).toEqual({ mode: "topic", selectedTopics: ["e-ghg", "g-king5"] });
    expect(readReportScopeFromCells(undefined)).toEqual({
      mode: "framework",
      selectedTopics: ALL_ESG_TOPIC_IDS,
    });
  });
});

describe("topicNavVisibility", () => {
  const some = ["e-ghg", "s-mc"];

  it("shows everything in framework mode, including the B-BBEE Bridge", () => {
    for (const id of ["bbbee-bridge", "net-zero", "carbon-tax", "dashboard", "import", "environmental", "g-king5"]) {
      expect(topicNavVisibility(id, "framework", [])).toBe(true);
    }
  });

  it("hides the B-BBEE Bridge outright in topic mode", () => {
    expect(topicNavVisibility("bbbee-bridge", "topic", ALL_ESG_TOPIC_IDS)).toBe(false);
  });

  it("ties Net-Zero and Carbon Tax to the GHG topic", () => {
    expect(topicNavVisibility("net-zero", "topic", some)).toBe(true);
    expect(topicNavVisibility("carbon-tax", "topic", some)).toBe(true);
    expect(topicNavVisibility("net-zero", "topic", ["s-mc"])).toBe(false);
    expect(topicNavVisibility("carbon-tax", "topic", ["s-mc"])).toBe(false);
  });

  it("always shows Dashboard and Import", () => {
    expect(topicNavVisibility("dashboard", "topic", [])).toBe(true);
    expect(topicNavVisibility("import", "topic", [])).toBe(true);
  });

  it("shows a pillar only while it has a selected topic", () => {
    expect(topicNavVisibility("environmental", "topic", some)).toBe(true);
    expect(topicNavVisibility("social", "topic", some)).toBe(true);
    expect(topicNavVisibility("governance", "topic", some)).toBe(false);
    expect(topicNavVisibility("governance", "topic", [...some, "g-board"])).toBe(true);
  });

  it("shows a topic page only while selected", () => {
    expect(topicNavVisibility("e-ghg", "topic", some)).toBe(true);
    expect(topicNavVisibility("e-water", "topic", some)).toBe(false);
  });
});

describe("computeScopedSummary", () => {
  it("returns null without a scorecard", () => {
    expect(computeScopedSummary(null, ALL_ESG_TOPIC_IDS)).toBeNull();
  });

  it("sums only the selected topics' score groups", () => {
    const summary = computeScopedSummary(fakeScorecard(1), ["e-ghg"]);
    expect(summary).not.toBeNull();
    expect(summary!.pillars.environmental).toEqual({ score: 5, max: 33 });
    expect(summary!.pillars.social).toEqual({ score: 0, max: 0 });
    expect(summary!.pillars.governance).toEqual({ score: 0, max: 0 });
    expect(summary!.overallScore).toBe(5);
    expect(summary!.overallMax).toBe(33);
    // 0–1 fraction, same convention as EsgScorecardResult.overallPercent.
    expect(summary!.overallPercent).toBeCloseTo(5 / 33, 5);
  });

  it("covers every scored group at full selection (board has no score group)", () => {
    const summary = computeScopedSummary(fakeScorecard(1), ALL_ESG_TOPIC_IDS)!;
    expect(summary.pillars.environmental.max).toBe(108);
    expect(summary.pillars.social.max).toBe(100);
    expect(summary.pillars.governance.max).toBe(100);
    expect(summary.selectedCount).toBe(15);
    expect(summary.totalCount).toBe(15);
  });

  it("reports zero max (not NaN) when nothing is selected", () => {
    const summary = computeScopedSummary(fakeScorecard(1), [])!;
    expect(summary.overallMax).toBe(0);
    expect(summary.overallPercent).toBe(0);
  });
});
