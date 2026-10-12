/**
 * Which AI review fills change the ESG score — measured, not guessed.
 *
 * The B-BBEE review guesses from the column type. The ESG calculators are
 * cheap enough to ask: each fill is laid over the workbook on its own and the
 * scorecard recomputed. A fill that moves the overall percentage or any
 * pillar's score is listed before it is applied, with the before and after.
 */
import { computeEsgScorecard } from "../../../EsgToolkit/src/lib/calculators";
import { applyEsgFillProposals, type EsgFillProposal, type EsgSectionPatches, type EsgWorkbookLike } from "./esgAiReviewFill";
import type { EsgWorkbookData } from "./esgWorkbookStorage";

export interface EsgScoreSnapshot {
  /** The overall score as a fraction: 0.45 is 45%. */
  overall: number;
  environmental: number;
  social: number;
  governance: number;
}

export function esgScoreSnapshot(workbook: EsgWorkbookLike): EsgScoreSnapshot | null {
  const sc = computeEsgScorecard({ companyId: "", updatedAt: "", sections: {}, ...workbook } as EsgWorkbookData);
  if (!sc) return null;
  return {
    overall: sc.overallPercent,
    environmental: sc.environmental.score,
    social: sc.social.score,
    governance: sc.governance.score,
  };
}

function overlay(workbook: EsgWorkbookLike, patches: EsgSectionPatches): EsgWorkbookLike {
  const sections = { ...(workbook.sections ?? {}) };
  for (const [id, cells] of Object.entries(patches)) sections[id] = { cells };
  return { sections };
}

const moved = (a: EsgScoreSnapshot | null, b: EsgScoreSnapshot | null) => {
  if (!a || !b) return a !== b;
  return (Object.keys(a) as Array<keyof EsgScoreSnapshot>).some((k) => Math.abs(a[k] - b[k]) > 1e-9);
};

/** The proposals that change the score, each measured on its own. */
export function esgScoreChangingFills(workbook: EsgWorkbookLike, proposals: EsgFillProposal[]): Set<string> {
  const before = esgScoreSnapshot(workbook);
  const out = new Set<string>();
  for (const p of proposals) {
    const { patches, applied } = applyEsgFillProposals(workbook, [p]);
    if (applied.length === 0) continue;
    if (moved(before, esgScoreSnapshot(overlay(workbook, patches)))) out.add(p.id);
  }
  return out;
}

/** The score before and after applying a set of fills together. */
export function esgScoreEffect(
  workbook: EsgWorkbookLike,
  proposals: EsgFillProposal[],
): { before: EsgScoreSnapshot | null; after: EsgScoreSnapshot | null } {
  const { patches } = applyEsgFillProposals(workbook, proposals);
  return { before: esgScoreSnapshot(workbook), after: esgScoreSnapshot(overlay(workbook, patches)) };
}
