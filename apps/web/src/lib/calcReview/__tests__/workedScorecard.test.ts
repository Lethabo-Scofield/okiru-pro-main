import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  REVIEW_SCORECARDS,
  anchorIsRegistered,
  decisionAnchor,
  hasWorkedScorecard,
  loadWorkedScorecard,
  reviewScorecard,
  reviewScorecardsFor,
  scorecardAnchor,
} from "../registry";
import { RCOGP_GENERIC_DECISIONS } from "../decisions";
import { workedLines, type WorkedScorecard } from "../workedScorecard";
import { RCOGP_GENERIC_LINES } from "@toolkit/lib/parity/toolkitParity";
import { adaptFscToolkitCase } from "@toolkit/test/parity/caseAdapter.fsc";

// The notes api accepts only these anchors (apps/api calculationReview validAnchor).
const NOTE_ANCHOR = /^(indicator|pillar):[A-Za-z0-9._-]{1,80}$/;
// ...and only these sector codes, scorecard types and element keys (validCode).
const NOTE_CODE = /^[A-Za-z0-9 _-]{1,40}$/;

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

const worked = new Map<string, WorkedScorecard>();
beforeAll(async () => {
  for (const entry of REVIEW_SCORECARDS) worked.set(entry.id, await loadWorkedScorecard(entry.id));
});

describe("the Calculation Review's scorecards", () => {
  it("are the nine scorecards checked against an Empower toolkit, under the codes the app uses", () => {
    expect(REVIEW_SCORECARDS.map((e) => `${e.id} ${e.sectorCode}/${e.scorecardType}`)).toEqual([
      "rcogp-generic RCOGP/Generic",
      "rcogp-qse RCOGP/QSE",
      "ict-generic ICT/Generic",
      "ict-qse ICT/QSE",
      "agri-generic AGRI/Generic",
      "fsc-others FSC/Generic",
      "fsc-banks FSC/Generic",
      "fsc-lti FSC/Generic",
      "fsc-sti FSC/Generic",
    ]);
    for (const e of REVIEW_SCORECARDS) {
      expect(e.sectorCode).toMatch(NOTE_CODE);
      expect(e.scorecardType).toMatch(NOTE_CODE);
      expect(e.spec.sectorCode).toBe(e.sectorCode);
      expect(e.spec.scorecardType).toBe(e.scorecardType);
    }
  });

  it("offers a worked scorecard only where a toolkit was checked", () => {
    expect(hasWorkedScorecard("RCOGP", "Generic")).toBe(true);
    expect(hasWorkedScorecard("RCOGP", "QSE")).toBe(true);
    expect(hasWorkedScorecard("ICT", "Generic")).toBe(true);
    expect(hasWorkedScorecard("ICT", "QSE")).toBe(true);
    expect(hasWorkedScorecard("AGRI", "Generic")).toBe(true);
    expect(hasWorkedScorecard("FSC", "Generic")).toBe(true);
    expect(hasWorkedScorecard("FSC", "QSE")).toBe(false);
    expect(hasWorkedScorecard("TRANSPORT", "Generic")).toBe(false);
    expect(hasWorkedScorecard("MAC", "QSE")).toBe(false);
    expect(reviewScorecardsFor("FSC", "Generic").map((e) => e.id)).toEqual(["fsc-others", "fsc-banks", "fsc-lti", "fsc-sti"]);
  });

  it("keeps RCOGP Generic's worked scorecard exactly as it was before the other sectors joined", () => {
    // Written by the branch base's buildWorkedScorecard() (95a6965c), before this change.
    const base = JSON.parse(
      readFileSync(path.join(__dirname, "fixtures", "rcogp-generic.worked.base.json"), "utf8"),
    );
    expect(JSON.parse(JSON.stringify(worked.get("rcogp-generic")))).toEqual(base);
  });

  it("keeps RCOGP Generic's note anchors, so the notes already written stay on their lines", () => {
    const lines = workedLines(worked.get("rcogp-generic")!);
    expect(lines.map((l) => l.anchor)).toEqual(RCOGP_GENERIC_LINES.map((l) => `indicator:line-${l.row}`));
    expect(reviewScorecard("rcogp-generic")!.decisions).toBe(RCOGP_GENERIC_DECISIONS);
    expect(scorecardAnchor(reviewScorecard("rcogp-generic")!)).toBe("pillar:scorecard");
  });

  for (const entry of REVIEW_SCORECARDS) {
    describe(entry.title, () => {
      it("scores every toolkit line with the live calculator, the same as the toolkit", () => {
        const w = worked.get(entry.id)!;
        const lines = workedLines(w);
        expect(lines.length).toBeGreaterThan(15);
        expect(lines.filter((l) => l.status !== "match").map((l) => `${l.label}: ${l.ours} vs ${l.toolkit}`)).toEqual([]);
        expect(w.pillars.filter((p) => p.status !== "match").map((p) => p.label)).toEqual([]);
        expect(w.total.status).toBe("match");
        expect(w.achieved.status).toBe("match");
        expect(w.discounted.status).toBe("match");
        expect(w.sectorCode).toBe(entry.sectorCode);
        expect(w.scorecardType).toBe(entry.scorecardType);
      });

      it("shows every line of its line map, each with the toolkit's chain of cells", () => {
        const w = worked.get(entry.id)!;
        for (const line of workedLines(w)) {
          expect(line.chain.length, line.label).toBeGreaterThan(0);
          expect(line.chain[0].cell, line.label).toBe(`Summary Scorecard!F${line.row}`);
          expect(line.label.length).toBeGreaterThan(0);
        }
        // Most lines score something on the sample picked to show the scorecard.
        const scored = workedLines(w).filter((l) => (l.toolkit ?? 0) !== 0).length;
        expect(scored / workedLines(w).length).toBeGreaterThan(0.6);
      });

      it("attaches notes to anchors the notes api accepts, unique within the scorecard", () => {
        const w = worked.get(entry.id)!;
        const anchors = [
          ...workedLines(w).map((l) => l.anchor),
          ...entry.decisions.map(decisionAnchor),
          scorecardAnchor(entry),
        ];
        for (const a of anchors) expect(a).toMatch(NOTE_ANCHOR);
        expect(new Set(anchors).size).toBe(anchors.length);
        for (const p of w.pillars) expect(p.key).toMatch(NOTE_CODE);
        for (const a of anchors) expect(anchorIsRegistered(a, entry.sectorCode, entry.scorecardType), a).toBe(true);
      });

      it("asks for its rulings in plain English, each with a unique anchor", () => {
        expect(entry.decisions.length).toBeGreaterThan(5);
        const ids = entry.decisions.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const d of entry.decisions) {
          for (const text of [d.title, d.element, d.toolkit, d.okiru, d.question, d.codes ?? "", d.appliesTo ?? ""]) {
            // No code identifiers, file names or cell addresses in anything the reviewer reads
            // (a rand amount such as R4,052.73 is not a cell address).
            expect(text, d.id).not.toMatch(/\btbl[A-Z]|\b[a-z]+[A-Z][A-Za-z]*\b|\.(ts|tsx|py|json|md)\b|\b(?!R\d)[A-Z]{1,2}\d{1,3}\b|![A-Z]+\d|[{}<>_]/);
          }
          expect(d.question.trim().length, d.id).toBeGreaterThan(10);
          expect(d.toolkit.trim().length, d.id).toBeGreaterThan(10);
          expect(d.okiru.trim().length, d.id).toBeGreaterThan(5);
        }
      });
    });
  }

  it("keeps the four FSC scorecards' line notes apart, and shares a ruling only where it is the same ruling", () => {
    const fsc = reviewScorecardsFor("FSC", "Generic");
    const lineAnchors = fsc.map((e) => new Set(workedLines(worked.get(e.id)!).map((l) => l.anchor)));
    for (let i = 0; i < lineAnchors.length; i++) {
      for (let j = i + 1; j < lineAnchors.length; j++) {
        expect(Array.from(lineAnchors[i]).filter((a) => lineAnchors[j].has(a))).toEqual([]);
      }
    }
    const byId = new Map<string, unknown>();
    for (const e of fsc) {
      for (const d of e.decisions) {
        if (byId.has(d.id)) expect(d).toEqual(byId.get(d.id));
        else byId.set(d.id, d);
      }
    }
    // A ruling shared between FSC scorecards says so.
    const counts = new Map<string, number>();
    for (const e of fsc) for (const d of e.decisions) counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
    for (const e of fsc) for (const d of e.decisions) if ((counts.get(d.id) ?? 0) > 1) expect(d.appliesTo, d.id).toBeTruthy();
  });

  it("asks for the procurement sub-minimum ruling only where the scorecard has that sub-minimum", () => {
    // Banks and long-term insurers test empowerment financing in procurement's
    // place (the toolkit's procurement test cells are blank for them).
    const has = (id: string) => reviewScorecard(id)!.decisions.some((d) => d.id === "fsc-pp-sub-minimum");
    expect(["fsc-others", "fsc-banks", "fsc-lti", "fsc-sti"].map(has)).toEqual([true, false, false, true]);
    const ruling = reviewScorecard("fsc-others")!.decisions.find((d) => d.id === "fsc-pp-sub-minimum")!;
    expect(ruling.appliesTo).toBe("Others and short-term insurers: one ruling covers both.");
    expect(decisionAnchor(ruling)).toBe("indicator:decision-fsc-pp-sub-minimum");
    expect(reviewScorecard("fsc-banks")!.decisions).toHaveLength(17);
    expect(reviewScorecard("fsc-lti")!.decisions).toHaveLength(18);
    for (const id of ["fsc-banks", "fsc-lti"]) {
      const w = worked.get(id)!;
      expect(`${w.achieved.note ?? ""} ${w.discounted.note ?? ""}`, id).not.toMatch(/procurement/i);
    }
  });

  it("prints no floating-point noise in a line's target or working", () => {
    for (const entry of REVIEW_SCORECARDS) {
      for (const l of workedLines(worked.get(entry.id)!)) {
        expect(`${l.target ?? ""} ${l.working ?? ""}`, `${entry.id} ${l.label}`).not.toMatch(/\d\.\d{7,}/);
      }
    }
  });

  it("says why a line carries no points, instead of dividing by a 0% target", () => {
    let seen = 0;
    for (const entry of REVIEW_SCORECARDS) {
      for (const l of workedLines(worked.get(entry.id)!).filter((x) => x.weighting === 0)) {
        seen++;
        expect(l.working, `${entry.id} ${l.label}`).toMatch(/^No points on this scorecard: .{20,}\.$/);
        expect(l.working, `${entry.id} ${l.label}`).not.toMatch(/÷ 0%/);
      }
    }
    // Every FSC sample has one (the toolkit's unlabelled other-executive African
    // row), and the long-term insurer's senior, middle and junior bands nine more.
    expect(seen).toBe(13);
    expect(workedLines(worked.get("fsc-lti")!).filter((l) => l.weighting === 0).map((l) => l.row))
      .toEqual([38, 39, 40, 41, 42, 43, 44, 45, 46, 47]);
    expect(reviewScorecard("fsc-lti")!.note).toMatch(/no senior, middle or junior managers/);
  });

  it("says the long-term insurer's senior, middle and junior points went to other executive management, as its note and the toolkit do", () => {
    // The sample reports other executive and senior management together and
    // employs no senior, middle or junior manager: the toolkit gives other
    // executive management 10 + 4 and management control stays out of 21.
    const w = worked.get("fsc-lti")!;
    const mc = w.pillars.find((p) => p.key === "managementControl")!;
    expect(mc.lines.reduce((s, l) => s + l.weighting, 0)).toBe(21);
    expect(mc.lines.filter((l) => l.row === 36 || l.row === 37).map((l) => l.weighting)).toEqual([10, 4]);
    for (const l of mc.lines.filter((x) => x.row >= 39 && x.row <= 47)) {
      expect(l.working, l.label).toMatch(/moves this band's points to other executive management\.$/);
      expect(l.working, l.label).not.toMatch(/no band/);
    }
    for (const l of mc.lines.filter((x) => x.row >= 39 && x.row <= 41)) {
      expect(l.working, l.label).toMatch(/reported together with other executive management/);
    }
    // The ruling on a combined band losing 4 points names the case it is about,
    // which this sample is not, and says the sample's case loses nothing.
    const ruling = reviewScorecard("fsc-lti")!.decisions.find((d) => d.id === "fsc-mc-combined-band")!;
    expect(ruling.title).toMatch(/middle or junior managers but no senior manager/);
    expect(ruling.toolkit).toMatch(/does employ middle or junior managers/);
    expect(ruling.toolkit).toMatch(/stays out of 21/);
    expect(reviewScorecard("fsc-lti")!.note).toMatch(/stays out of 21/);
  });

  it("scores each FSC scorecard's sample as that sub-sector", async () => {
    const want: Record<string, string> = { "fsc-others": "Others", "fsc-banks": "Banks", "fsc-lti": "LTI", "fsc-sti": "STI" };
    for (const [id, sub] of Object.entries(want)) {
      const entry = reviewScorecard(id)!;
      const mod = (await entry.load()) as { default: { sampleCase: Parameters<typeof adaptFscToolkitCase>[0] } };
      const { state } = adaptFscToolkitCase(mod.default.sampleCase);
      expect(state.client.fscSubSector ?? "Others", id).toBe(sub);
    }
  });

  it("does not claim notes written against the earlier written description", () => {
    expect(anchorIsRegistered("indicator:own.voting.black", "RCOGP", "Generic")).toBe(false);
    expect(anchorIsRegistered("pillar:ownership", "RCOGP", "Generic")).toBe(false);
    expect(anchorIsRegistered("pillar:scorecard", "FSC", "Generic")).toBe(false);
    expect(anchorIsRegistered("indicator:banks.line-21", "FSC", "Generic")).toBe(true);
    expect(anchorIsRegistered("indicator:line-21", "FSC", "Generic")).toBe(false);
    expect(anchorIsRegistered("indicator:line-64-65", "ICT", "Generic")).toBe(true);
  });

  it("states the sample is invented, never a client", () => {
    for (const entry of REVIEW_SCORECARDS) {
      const s = worked.get(entry.id)!.sample;
      expect(s.employees, entry.id).toBeGreaterThan(0);
      expect(s.suppliers, entry.id).toBeGreaterThan(0);
      expect(s.shareholders, entry.id).toBeGreaterThan(0);
    }
  });
});
