/**
 * "All notes": every note lands in exactly one scorecard's group, under the
 * scorecard's readable name, and says in words which line or ruling it is on —
 * read from the registry, from the worked scorecard once it is loaded, or from
 * the sector configuration — falling back to plain words, never to a code.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  groupNotes,
  lineNamesOf,
  resolveNote,
  scorecardsWithLineNotes,
  type LineName,
  type ResolveContext,
  type ReviewNoteSummary,
} from "../allNotes";
import { loadWorkedScorecard } from "../registry";
import { buildLedger, type SectorConfigView } from "../ledger";
import type { WorkedScorecard } from "../workedScorecard";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

let seq = 0;
function note(over: Partial<ReviewNoteSummary>): ReviewNoteSummary {
  seq += 1;
  return {
    id: `n${seq}`,
    sectorCode: "RCOGP",
    scorecardType: "Generic",
    pillarKey: "ownership",
    anchor: "pillar:scorecard",
    body: `Note ${seq}`,
    verdict: "note",
    authorName: "Reviewer A",
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
    ...over,
  };
}

/** A scorecard not checked against a toolkit, as GET /api/sectors serves it. */
const TOURISM_QSE: SectorConfigView = {
  code: "TOURISM",
  name: "Tourism Sector Code (TOURISM)",
  type: "QSE",
  totalPoints: 100,
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
  },
  targets: {},
  levelThresholds: [],
};

let rcogp: WorkedScorecard;
let banks: WorkedScorecard;
let ctx: ResolveContext;
beforeAll(async () => {
  rcogp = await loadWorkedScorecard("rcogp-generic");
  banks = await loadWorkedScorecard("fsc-banks");
  const names = new Map<string, Map<string, LineName>>([
    ["rcogp-generic", lineNamesOf(rcogp)],
    ["fsc-banks", lineNamesOf(banks)],
  ]);
  ctx = { lineNames: (id) => names.get(id), sectors: [TOURISM_QSE] };
});

describe("what a note is about", () => {
  it("names a line by its label and element once its scorecard is loaded", () => {
    const pillar = rcogp.pillars[0];
    const line = pillar.lines[0];
    const r = resolveNote(note({ anchor: line.anchor, pillarKey: pillar.key }), ctx);
    expect(r.subject).toBe("line");
    expect(r.about).toBe(line.label);
    expect(r.element).toBe(pillar.label);
    expect(r.groupTitle).toBe("RCOGP Generic");
    expect(r.target).toEqual({ kind: "worked", id: "rcogp-generic" });
    expect(r.revealAnchor).toBe(line.anchor);
    expect(r.containerAnchor).toBe(`pillar:${pillar.key}`);
  });

  it("finds an FSC line on the right one of the four FSC scorecards", () => {
    const pillar = banks.pillars.find((p) => p.lines.length > 0)!;
    const line = pillar.lines[0];
    expect(line.anchor).toMatch(/^indicator:banks\.line-/);
    const r = resolveNote(note({ sectorCode: "FSC", anchor: line.anchor, pillarKey: pillar.key }), ctx);
    expect(r.groupTitle).toBe("FSC Banks (FS701)");
    expect(r.target).toEqual({ kind: "worked", id: "fsc-banks" });
    expect(r.about).toBe(line.label);
  });

  it("still lists a line in plain words before its scorecard is loaded", () => {
    const r = resolveNote(note({ anchor: "indicator:line-20" }), {});
    expect(r.subject).toBe("line");
    expect(r.about).toBe("A line on this scorecard");
    expect(r.element).toBeUndefined();
    expect(r.groupTitle).toBe("RCOGP Generic");
  });

  it("names a ruling by its title, on the scorecard that asks it", () => {
    const r = resolveNote(note({ anchor: "indicator:decision-net-value-target", pillarKey: "decisions" }), ctx);
    expect(r.subject).toBe("ruling");
    expect(r.about).toBe("Net value is scored against 100%");
    expect(r.element).toBe("Ownership");
    expect(r.groupTitle).toBe("RCOGP Generic");
    expect(r.appliesTo).toBeUndefined();
  });

  it("files a ruling the FSC scorecards share once, under the scorecards that share it", () => {
    const all = resolveNote(
      note({ sectorCode: "FSC", anchor: "indicator:decision-fsc-skills-within-year", pillarKey: "decisions" }),
      ctx,
    );
    expect(all.groupTitle).toBe("FSC rulings shared by all four scorecards");
    expect(all.target).toEqual({ kind: "worked", id: "fsc-others" });
    expect(all.appliesTo).toMatch(/one ruling covers all four/);

    const three = resolveNote(
      note({ sectorCode: "FSC", anchor: "indicator:decision-fsc-ownership-bonus-negative", pillarKey: "decisions" }),
      ctx,
    );
    expect(three.groupTitle).toBe("FSC rulings shared by Banks, Long-term insurers and Short-term insurers");
    expect(three.target).toEqual({ kind: "worked", id: "fsc-banks" });

    const own = resolveNote(
      note({ sectorCode: "FSC", anchor: "indicator:decision-fsc-banks-electronic-access", pillarKey: "decisions" }),
      ctx,
    );
    expect(own.groupTitle).toBe("FSC Banks (FS701)");
  });

  it("names a note on a scorecard as a whole", () => {
    const r = resolveNote(note({ sectorCode: "FSC", anchor: "pillar:sti.scorecard", pillarKey: "scorecard" }), ctx);
    expect(r.subject).toBe("scorecard");
    expect(r.about).toBe("The scorecard as a whole");
    expect(r.groupTitle).toBe("FSC Short-term Insurers (FS703)");
    expect(r.revealAnchor).toBe("pillar:sti.scorecard");
  });

  it("names an indicator on a scorecard not checked yet from its sector configuration", () => {
    const ledger = buildLedger(TOURISM_QSE);
    const pillar = ledger[0];
    const row = pillar.rows[0];
    const r = resolveNote(
      note({ sectorCode: "TOURISM", scorecardType: "QSE", anchor: `indicator:${row.code}`, pillarKey: pillar.key }),
      ctx,
    );
    expect(r.subject).toBe("indicator");
    expect(r.about).toBe(row.name);
    expect(r.element).toBe(pillar.name);
    expect(r.groupTitle).toBe("Tourism Sector Code · QSE");
    expect(r.target).toEqual({ kind: "described", sectorCode: "TOURISM", scorecardType: "QSE" });
    expect(r.containerAnchor).toBe(`pillar:${pillar.key}`);

    const element = resolveNote(
      note({ sectorCode: "TOURISM", scorecardType: "QSE", anchor: `pillar:${pillar.key}`, pillarKey: pillar.key }),
      ctx,
    );
    expect(element.about).toBe(`${pillar.name} as a whole`);
  });

  it("falls back to plain words, never a code, when nothing can name it", () => {
    const unknownSector = resolveNote(
      note({ sectorCode: "MARINE", scorecardType: "Generic", anchor: "indicator:own-vr-01", pillarKey: "ownership" }),
      ctx,
    );
    expect(unknownSector.groupTitle).toBe("A scorecard not checked against a toolkit yet");
    expect(unknownSector.about).toBe("An indicator on this scorecard");

    const earlier = resolveNote(note({ anchor: "indicator:own-vr-01" }), ctx);
    expect(earlier.subject).toBe("earlier");
    expect(earlier.about).toBe("An indicator in the earlier description");
    expect(earlier.groupTitle).toBe("RCOGP Generic");
    expect(earlier.revealAnchor).toBeNull();

    const gone = resolveNote(note({ anchor: "indicator:decision-no-longer-asked", pillarKey: "decisions" }), ctx);
    expect(gone.subject).toBe("earlier");

    for (const r of [unknownSector, earlier, gone]) {
      expect(`${r.groupTitle} ${r.about}`).not.toMatch(/indicator:|pillar:|line-\d|decision-|own-vr|MARINE/);
    }
  });
});

describe("grouping every note", () => {
  it("puts each note in one scorecard group, newest first, the group with the newest note first", () => {
    const line = rcogp.pillars[0].lines[0];
    const notes = [
      note({ id: "old-rcogp", anchor: line.anchor, updatedAt: "2026-10-02T09:00:00.000Z" }),
      note({ id: "fsc-shared-a", sectorCode: "FSC", anchor: "indicator:decision-fsc-skills-within-year", pillarKey: "decisions", updatedAt: "2026-10-05T09:00:00.000Z" }),
      note({ id: "new-rcogp", anchor: "indicator:decision-net-value-target", pillarKey: "decisions", updatedAt: "2026-10-07T09:00:00.000Z", mine: true }),
      note({ id: "fsc-shared-b", sectorCode: "FSC", anchor: "indicator:decision-fsc-skills-within-year", pillarKey: "decisions", authorName: "Reviewer B", updatedAt: "2026-10-03T09:00:00.000Z" }),
      note({ id: "tourism", sectorCode: "TOURISM", scorecardType: "QSE", anchor: "pillar:scorecard", pillarKey: "scorecard", updatedAt: "2026-10-04T09:00:00.000Z" }),
    ];
    const groups = groupNotes(notes, ctx);
    expect(groups.map((g) => g.title)).toEqual([
      "RCOGP Generic",
      "FSC rulings shared by all four scorecards",
      "Tourism Sector Code · QSE",
    ]);
    expect(groups[0].notes.map((r) => r.note.id)).toEqual(["new-rcogp", "old-rcogp"]);
    expect(groups[1].notes.map((r) => r.note.id)).toEqual(["fsc-shared-a", "fsc-shared-b"]);
    expect(groups.flatMap((g) => g.notes).length).toBe(notes.length);
    expect(groups[0].target).toEqual({ kind: "worked", id: "rcogp-generic" });
  });

  it("is empty when there are no notes", () => {
    expect(groupNotes([], ctx)).toEqual([]);
  });

  it("loads only the scorecards whose lines carry notes", () => {
    const notes = [
      note({ anchor: "indicator:line-20" }),
      note({ sectorCode: "FSC", anchor: "indicator:banks.line-21" }),
      note({ sectorCode: "FSC", anchor: "indicator:banks.line-22" }),
      note({ sectorCode: "ICT", anchor: "indicator:decision-anything", pillarKey: "decisions" }),
      note({ sectorCode: "TOURISM", scorecardType: "QSE", anchor: "indicator:own-vr-01" }),
    ];
    expect(scorecardsWithLineNotes(notes).sort()).toEqual(["fsc-banks", "rcogp-generic"]);
  });
});
