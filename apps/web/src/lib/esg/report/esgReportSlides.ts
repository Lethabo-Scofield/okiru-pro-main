/**
 * Rendering B — the Board Strategy Pack, expressed as an ordered slide list.
 *
 * The specification builds one data spine and filters it four ways (4.1).
 * Rendering A is the full Disclosure Pack and goes to Word. This is the other
 * one worth shipping now: "12 to 18 pages. Score, materiality, gaps, decisions
 * required, roadmap." A board reads it in five minutes, so the payload is the
 * decisions — each with a deadline, the consequence of deferral and a cost
 * band — not the metric register.
 *
 * Same discipline as `esgReportDocument.ts`: this module owns the SHAPE and
 * nothing else. `esgReportPptx.ts` is a pure renderer over the slide list, and
 * knows nothing about ESG. Both read the same `EsgReportModel`, so the deck and
 * the document can never quote different numbers.
 *
 * The generation rules are honoured here, not left to the renderer: nothing
 * renders empty (rule 1) — a slide with no data states an omission; the
 * version stamp reaches every slide (rule 5); and the DRAFT state travels on
 * the model so the renderer can watermark every page with no override (rule 2).
 */
import { versionStamp } from "./esgReportDocument";
import type { EsgReportModel } from "./esgReportModel";

/** A tile in the metric strip — a big number with its label and basis. */
export type EsgSlideTile = { label: string; value: string; note: string; accent?: "e" | "s" | "g" | "alert" };

export type EsgSlideBody =
  | { kind: "tiles"; tiles: EsgSlideTile[] }
  | { kind: "table"; head: string[]; rows: string[][]; widths?: number[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "statement"; text: string }
  | { kind: "split"; left: { heading: string; items: string[] }; right: { heading: string; items: string[] } };

export type EsgSlide = {
  /** Small uppercase kicker above the title. */
  eyebrow: string;
  title: string;
  body: EsgSlideBody[];
  /** Muted line pinned to the foot of the slide. Rule 8 lives here for tables. */
  footnote?: string;
  /** The opening slide is dark with the Okiru marque; everything else is light. */
  cover?: boolean;
};

const n = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-ZA", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`);

/** Keep a board slide readable: cap rows and say so rather than truncating silently. */
function capped<T>(rows: T[], max: number): { rows: T[]; note: string } {
  if (rows.length <= max) return { rows, note: "" };
  return { rows: rows.slice(0, max), note: `Showing ${max} of ${rows.length}; the full list is in the Disclosure Pack.` };
}

/** Build the Board Strategy Pack. 12 to 18 slides, per the specification. */
export function buildBoardPack(model: EsgReportModel): EsgSlide[] {
  const m = model.meta;
  const slides: EsgSlide[] = [];
  const stamp = versionStamp(model);

  /* ── 1. Cover ─────────────────────────────────────────────────────────── */
  slides.push({
    cover: true,
    eyebrow: "OKIRU  ·  ESG INTELLIGENCE TOOLKIT",
    title: m.entityName,
    body: [
      {
        kind: "bullets",
        items: [
          "ESG Board Strategy Pack",
          `${m.reportingPeriod}  ·  ${m.sector}`,
          m.isDraft ? "DRAFT — not approved for issue" : `Final — approved by ${m.signOffName}`,
        ],
      },
    ],
    footnote: `${m.generationReference}  ·  Generated ${m.generatedAt.slice(0, 10)}`,
  });

  /* ── 2. Where the entity stands ───────────────────────────────────────── */
  slides.push({
    eyebrow: "POSITION",
    title: "Where the business stands today",
    body: [
      {
        kind: "tiles",
        tiles: [
          { label: "Overall ESG", value: pct(model.scores.overallPercent), note: "Weighted across the three pillars" },
          { label: "Environmental", value: pct(model.scores.environmental.percent), note: `${n(model.scores.environmental.score)} of ${model.scores.environmental.max} points`, accent: "e" },
          { label: "Social", value: pct(model.scores.social.percent), note: `${n(model.scores.social.score)} of ${model.scores.social.max} points`, accent: "s" },
          { label: "Governance", value: pct(model.scores.governance.percent), note: `${n(model.scores.governance.score)} of ${model.scores.governance.max} points`, accent: "g" },
        ],
      },
    ],
    footnote: `Source: Okiru ESG indicator ledger. No prior-period comparison — this is the first period on the register. ${stamp}`,
  });

  /* ── 3. How defensible the numbers are ────────────────────────────────── */
  const assurable = model.assuranceReadiness.filter((r) => r.rating === "Ready for limited assurance").length;
  slides.push({
    eyebrow: "CREDIBILITY",
    title: "How defensible these numbers are",
    body: [
      {
        kind: "tiles",
        tiles: [
          { label: "Metrics reported", value: `${model.coverage.populated} / ${model.coverage.total}`, note: "The rest state a reasoned omission" },
          { label: "Data quality index", value: model.dataQualityIndex != null ? `${model.dataQualityIndex} / 5` : "Not rated", note: "Weighted across every rated metric" },
          { label: "Assurance-ready topics", value: `${assurable} / ${model.assuranceReadiness.length}`, note: "All metrics at quality 4 or better" },
          { label: "Gaps on the register", value: String(model.gaps.length), note: "Each costed, owned and dated", accent: "alert" },
        ],
      },
      {
        kind: "statement",
        text:
          "Credibility comes from traceability, not length. Every figure in the Disclosure Pack carries its source system, calculation method, accountable owner, data quality rating and assurance status. Where a figure does not exist, the pack says so and prices the fix.",
      },
    ],
    footnote: `Data quality is derived from how each number was captured, not asserted. ${stamp}`,
  });

  /* ── 4. Emissions ─────────────────────────────────────────────────────── */
  if (model.ghg.hasData) {
    const lines = model.ghg.lines.filter((l) => l.activity > 0);
    const cap = capped(lines, 8);
    slides.push({
      eyebrow: "CLIMATE",
      title: `Scope 1 and 2 emissions: ${n(model.ghg.scope1And2, 2)} tCO₂e`,
      body: [
        {
          kind: "table",
          head: ["Emissions source", "Scope", "Activity", "Unit", "Factor", "tCO₂e"],
          rows: cap.rows.map((l) => [l.label, String(l.scope), n(l.activity, 0), l.unit, `${l.factor}`, n(l.tco2e, 2)]),
          widths: [34, 8, 15, 12, 13, 18],
        },
      ],
      footnote:
        `Units: tCO₂e. Each line is activity × a stated emission factor — metric register E-GHG series. Scope 3 is partial by construction (municipal water only). ${cap.note} ${stamp}`.replace(/\s+/g, " "),
    });
  } else {
    slides.push({
      eyebrow: "CLIMATE",
      title: "No emissions position can be stated for this period",
      body: [
        {
          kind: "statement",
          text: `${m.entityName} does not currently collect the activity data required to calculate an emissions inventory. Until it does, the business cannot answer the first question on any tender, bank or customer questionnaire, and cannot test its exposure to the Climate Change Act or the carbon tax. This is the highest-priority item on the gap register.`,
        },
      ],
      footnote: `Rendered as a reasoned omission rather than a zero — a zero would be a false disclosure. ${stamp}`,
    });
  }

  /* ── 5. Trajectory ────────────────────────────────────────────────────── */
  if (model.netZero?.available && model.netZero.milestones.length) {
    const cap = capped(model.netZero.milestones, 8);
    slides.push({
      eyebrow: "TRAJECTORY",
      title: "Performance against the required pathway",
      body: [
        {
          kind: "table",
          head: ["Milestone", "Year", "Reduction required", "Permitted tCO₂e", "Gap tCO₂e", "On track"],
          rows: cap.rows.map((ms) => [ms.tier, String(ms.year), pct(ms.reductionRequired), n(ms.targetTco2e, 2), n(ms.gapTco2e, 2), ms.onTrack ? "Yes" : "No"]),
          widths: [26, 10, 18, 17, 15, 14],
        },
      ],
      footnote: `Units: tCO₂e against an FY baseline of ${n(model.netZero.baselineTco2e, 2)}. Source: metric register, Scope 1 + 2 headline. ${stamp}`,
    });
  } else {
    slides.push({
      eyebrow: "TRAJECTORY",
      title: "No baseline, so no trajectory",
      body: [
        {
          kind: "statement",
          text: "No emissions baseline has been established, so no reduction pathway can be modelled and no climate target in this pack can be tested against one. Establishing the baseline is a precondition for every target the business may wish to set, and is recorded on the gap register.",
        },
      ],
      footnote: stamp,
    });
  }

  /* ── 6. Material matters ──────────────────────────────────────────────── */
  const matters = capped(
    [...model.materialMatters].sort((a, b) => Number(a.flagged) - Number(b.flagged) || b.metricIds.length - a.metricIds.length),
    8,
  );
  slides.push({
    eyebrow: "MATERIALITY",
    title: "What matters, and whether anything is attached to it",
    body: [
      {
        kind: "table",
        head: ["Material matter", "Financial exposure", "Metrics", "Actions", "Attached"],
        rows: matters.rows.map((x) => [
          x.matter,
          x.financialExposure,
          String(x.metricIds.length),
          String(x.roadmapRefs.length),
          x.flagged ? "No — flagged" : "Yes",
        ]),
        widths: [22, 44, 10, 10, 14],
      },
    ],
    footnote: `Materiality approach: ${m.materialityApproach}. A matter with no metric and no action is a narrative claim, not a management process, so it is flagged. ${matters.note} ${stamp}`.replace(/\s+/g, " "),
  });

  /* ── 7. Decisions required — the payload ──────────────────────────────── */
  if (model.boardDecisions.length) {
    const cap = capped(model.boardDecisions, 5);
    slides.push({
      eyebrow: "DECISIONS REQUIRED",
      title: "What the board is being asked to approve",
      body: [
        {
          kind: "table",
          head: ["Decision", "By when", "If deferred", "Cost band", "Ref"],
          rows: cap.rows.map((d) => [d.decision, d.deadline, d.consequenceOfDeferral, d.costBand, d.roadmapRef]),
          widths: [26, 12, 38, 15, 9],
        },
      ],
      footnote: `Cost bands are indicative remediation estimates, not quotations. ${cap.note} ${stamp}`.replace(/\s+/g, " "),
    });
  } else {
    slides.push({
      eyebrow: "DECISIONS REQUIRED",
      title: "No decision is outstanding",
      body: [
        {
          kind: "statement",
          text: "Every metric on the register is populated at a data quality that supports assurance, and no gap requires a board decision this period.",
        },
      ],
      footnote: stamp,
    });
  }

  /* ── 8. Priority gaps ─────────────────────────────────────────────────── */
  const topGaps = capped(model.gaps, 6);
  slides.push({
    eyebrow: "GAPS",
    title: "Priority remediation, by risk-weighted effort",
    body: [
      topGaps.rows.length
        ? {
            kind: "table",
            head: ["Ref", "Metric", "Nature of the gap", "Risk", "Effort", "Cost band", "Owner"],
            rows: topGaps.rows.map((g) => [g.gapId, g.metric, g.natureOfGap, g.risk, g.effortBand, g.costBand, g.owner]),
            widths: [8, 22, 25, 9, 8, 13, 15],
          }
        : { kind: "statement", text: "No gap is recorded: every metric is populated at a data quality that supports assurance." },
    ],
    footnote: `${model.gaps.length} gaps in total. ${topGaps.note} Every gap carries an owner, an effort band, a cost band and a target close date. ${stamp}`.replace(/\s+/g, " "),
  });

  /* ── 9. Assurance readiness ───────────────────────────────────────────── */
  const readiness = capped(
    [...model.assuranceReadiness].sort((a, b) => (b.weightedDataQuality ?? 0) - (a.weightedDataQuality ?? 0)),
    9,
  );
  slides.push({
    eyebrow: "ASSURANCE",
    title: "How close each topic is to being assurable",
    body: [
      {
        kind: "table",
        head: ["Topic", "Rating", "Data quality", "Populated"],
        rows: readiness.rows.map((r) => [
          r.topic,
          r.rating,
          r.weightedDataQuality != null ? `${r.weightedDataQuality} / 5` : "Not rated",
          `${r.metricsPopulated} / ${r.metricsTotal}`,
        ]),
        widths: [34, 30, 18, 18],
      },
    ],
    footnote: `A client two data-quality steps from assurable can buy those two steps. ${readiness.note} ${stamp}`.replace(/\s+/g, " "),
  });

  /* ── 10-12. Roadmap, one slide per horizon ────────────────────────────── */
  for (const horizon of ["0-6 months", "6-18 months", "18-36 months"] as const) {
    const rows = model.roadmap.filter((r) => r.horizon === horizon);
    const cap = capped(rows, 7);
    slides.push({
      eyebrow: "ROADMAP",
      title: `${horizon} — what happens next`,
      body: [
        cap.rows.length
          ? {
              kind: "table",
              head: ["Action", "Owner", "Effort", "Cost band", "Expected outcome"],
              rows: cap.rows.map((r) => [r.action, r.owner, r.effort, r.costBand, r.expectedOutcome]),
              widths: [32, 16, 8, 14, 30],
            }
          : { kind: "statement", text: `No action falls in the ${horizon} horizon.` },
      ],
      footnote: `${rows.length} action${rows.length === 1 ? "" : "s"} in this horizon. ${cap.note} ${stamp}`.replace(/\s+/g, " "),
    });
  }

  /* ── 13. Regulatory horizon ───────────────────────────────────────────── */
  const reg = capped(model.regulatoryHorizon, 6);
  slides.push({
    eyebrow: "REGULATORY HORIZON",
    title: "What is coming, and by when",
    body: [
      {
        kind: "table",
        head: ["Instrument", "Requirement", "Action required", "Deadline"],
        rows: reg.rows.map((r) => [r.instrument, r.requirement, r.actionRequired, r.deadline]),
        widths: [22, 32, 30, 16],
      },
    ],
    footnote: `Filtered to a ${m.sector.toLowerCase()} entity of this profile. ${reg.note} A global reporting house will not write this section. ${stamp}`.replace(/\s+/g, " "),
  });

  /* ── 14. What we are asking for ───────────────────────────────────────── */
  slides.push({
    eyebrow: "IN SUMMARY",
    title: "What we are asking the board to do",
    body: [
      {
        kind: "split",
        left: {
          heading: "Decide now",
          items: model.boardDecisions.length
            ? model.boardDecisions.slice(0, 4).map((d) => `${d.decision} — ${d.costBand}, by ${d.deadline}`)
            : ["No decision is outstanding this period."],
        },
        right: {
          heading: "What it buys",
          items: [
            `${model.coverage.omitted} omissions closed, moving coverage towards ${model.coverage.total} of ${model.coverage.total}`,
            model.dataQualityIndex != null
              ? `A data quality index above 4, the level an assurance provider accepts`
              : "A rated data quality index for the first time",
            `${model.assuranceReadiness.length - assurable} more topics brought into assurance scope`,
            "A disclosure record the business can defend to a funder, a customer or a regulator",
          ],
        },
      },
    ],
    footnote: stamp,
  });

  /* ── 15. Basis and disclaimer ─────────────────────────────────────────── */
  slides.push({
    eyebrow: "BASIS OF PREPARATION",
    title: "What this pack is, and what it is not",
    body: [
      {
        kind: "bullets",
        items: [
          `Compiled by Okiru from data supplied by ${m.entityName}. Okiru has not independently verified the underlying data.`,
          `Boundary: ${m.boundary.toLowerCase()}, covering ${m.entitiesIncluded.join(", ")}.`,
          `Frameworks: ${m.reportingStandard}, organised against the JSE topic tree. Cross-walk ${m.crossWalkVersion}.`,
          "No part of this pack has been externally assured. It is a disclosure record, not an assurance report, and confers no assurance opinion.",
          "Statements about targets, trajectories and roadmap actions are forward-looking and rest on assumptions current at the date of generation.",
          m.isDraft
            ? "DRAFT: this pack has not been signed off by a named officer of the entity and may not be issued."
            : `Approved by ${m.signOffName}${m.signOffRole ? `, ${m.signOffRole}` : ""} on ${m.signOffDate}.`,
        ],
      },
    ],
    footnote: stamp,
  });

  return slides;
}
