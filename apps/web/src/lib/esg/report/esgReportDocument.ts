/**
 * Rendering A — the Disclosure Pack, expressed as an ordered block list.
 *
 * The specification's first design choice is "build one data spine and render
 * it four ways" (4.1). That only holds if the SHAPE of the document lives in
 * one place too — otherwise the DOCX and the PDF drift apart within a release
 * and "the same report in two formats" becomes a claim nobody can check.
 *
 * So this module owns the structure and nothing else. It emits a flat list of
 * typed blocks (headings, paragraphs, tables, legends, callouts, omissions),
 * and `esgReportDocx.ts` and `esgReportPdf.ts` are pure renderers over that
 * list. Adding a section here adds it to both outputs; neither renderer knows
 * what an ESG metric is.
 *
 * Section order follows 7.1 to 7.13 exactly: front matter F1-F4, sections 1
 * through 11, then appendices A to H.
 */
import {
  CLAIM_TIER_LEGEND,
  DATA_QUALITY_LEGEND,
  GENERATION_RULES,
  RAG_LEGEND,
  provenanceParagraph,
  type EsgReportModel,
} from "./esgReportModel";

export type EsgDocBlock =
  | { kind: "cover"; title: string; subtitle: string; rows: [string, string][] }
  | { kind: "h1"; text: string; pageBreakBefore?: boolean }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "numbered"; items: string[] }
  | { kind: "callout"; label: string; text: string }
  | { kind: "table"; caption?: string; head: string[]; rows: string[][]; widths?: number[] }
  | { kind: "kv"; rows: [string, string][] }
  | { kind: "note"; text: string }
  | { kind: "spacer" };

const dash = (s: string | null | undefined) => (s == null || s === "" ? "—" : s);
const n = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-ZA", { minimumFractionDigits: d, maximumFractionDigits: d });
const pctOf = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`);

function fmtDate(iso: string): string {
  // Deterministic, locale-independent — the same string in every renderer.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Build the ordered Disclosure Pack. */
export function buildDisclosurePack(model: EsgReportModel): EsgDocBlock[] {
  const b: EsgDocBlock[] = [];
  const m = model.meta;
  const entity = m.entityName;

  /* ───────────────────────── F1. Cover ───────────────────────────────── */
  b.push({
    kind: "cover",
    title: entity,
    subtitle: "ESG Disclosure Pack",
    rows: [
      ["Reporting period", m.reportingPeriod],
      ["Sector", m.sector],
      ["Reporting boundary", m.boundary],
      ["Frameworks applied", m.reportingStandard],
      ["Prepared by", m.preparedBy],
      ["Report version", m.reportVersion],
      ["Generation reference", m.generationReference],
      ["Generated", fmtDate(m.generatedAt)],
      ["Status", m.isDraft ? "DRAFT — not approved for issue" : `Final — approved by ${m.signOffName}`],
    ],
  });

  /* ───────────────────────── F2. About this report ───────────────────── */
  b.push({ kind: "h1", text: "About this report", pageBreakBefore: true });

  b.push({ kind: "h2", text: "1. Scope and boundary" });
  b.push({
    kind: "p",
    text: `This report covers ${m.entitiesIncluded.join(", ")} on an ${m.boundary.toLowerCase()} basis. Entities, sites, subsidiaries and joint ventures outside that boundary are excluded and are not consolidated into any figure in this document. Where a metric covers a narrower set of sites than the boundary, the metric record in Appendix C names the entities included.`,
  });

  b.push({ kind: "h2", text: "2. Reporting period" });
  b.push({
    kind: "p",
    text: `The reporting period is ${m.reportingPeriod}.${
      m.dataMonths ? ` Monthly activity data was captured for ${m.dataMonths} periods.` : ""
    }${
      m.baselineYear ? ` The emissions baseline year is ${m.baselineYear}.` : " No emissions baseline year has been set; targets in this report are therefore stated without a baseline comparison."
    } Comparative periods are presented only where a prior-year figure exists in the register; no comparative has been estimated.`,
  });

  b.push({ kind: "h2", text: "3. Frameworks applied" });
  b.push({
    kind: "p",
    text: `Disclosure is organised against the JSE Sustainability and Climate Change Disclosure Guidance topic tree, cross-referenced to ${m.reportingStandard}. The framework cross-walk used is ${m.crossWalkVersion}, and this report records the version it was generated against so that a later standards update does not silently change what a past report meant.`,
  });

  b.push({ kind: "h2", text: "4. Basis of preparation" });
  b.push({
    kind: "p",
    text: `${entity} supplied the underlying activity data through the Okiru ESG Intelligence Toolkit. Okiru calculated the derived figures — emissions, intensities, scores, data quality and gap analysis — from that data using the methods stated per metric in Appendix C and the emission factors in Appendix B. Greenhouse gas figures are computed as activity multiplied by an emission factor; no figure in this report is carried from a spreadsheet summary cell whose unit could not be verified.`,
  });

  b.push({ kind: "h2", text: "5. Data provenance statement" });
  b.push({ kind: "callout", label: "Data provenance", text: provenanceParagraph(entity, "C", "the executive summary dashboard") });

  b.push({ kind: "h2", text: "6. Assurance status" });
  b.push({
    kind: "p",
    text: `No part of this report has been externally assured. ${
      model.assuranceReadiness.filter((r) => r.rating === "Ready for limited assurance").length
    } of ${model.assuranceReadiness.length} topics are assessed as ready for limited assurance; the remainder require remediation, set out in Section 10. Assurance status is stated per metric in Appendix C, including where the answer is "unassured".`,
  });

  b.push({ kind: "h2", text: "7. Limitations and exclusions" });
  b.push({
    kind: "bullets",
    items: [
      `Scope 3 emissions are partial by construction — municipal water supply and treatment only. Upstream fuel and energy, purchased goods and services, and subcontracted freight are not captured and are stated as omissions rather than reported as zero.`,
      `${model.coverage.omitted} of ${model.coverage.total} metrics in the register are not populated for this period. Each renders a reasoned omission and a gap-register entry rather than a blank.`,
      `Okiru has not independently verified the client-supplied data underlying any figure.`,
      m.scopeMode === "topic"
        ? `This report covers ${m.selectedTopics.length} selected sustainability topics. Topics outside that selection are not scored and appear in the disclosure index as out of scope.`
        : `All framework topics are in scope for this report.`,
    ],
  });

  b.push({ kind: "h2", text: "8. Restatements" });
  const restated = model.metrics.filter((x) => x.restated);
  b.push({
    kind: "p",
    text: restated.length
      ? `${restated.length} prior-period figures have been restated. Each is footnoted at the point of disclosure and listed in Appendix E with its reason.`
      : `No prior-period figure has been restated. Where a prior-year value is absent, this is because no prior-period register exists for this entity, not because a figure has been withdrawn.`,
  });

  b.push({ kind: "h2", text: "9. Forward-looking statements" });
  b.push({
    kind: "p",
    text: `Statements in this report about targets, trajectories, roadmap actions and intended outcomes are forward-looking. They rest on assumptions current at the date of generation and on data supplied by ${entity}. Actual outcomes may differ. Nothing in this report constitutes a representation that any target will be met.`,
  });

  b.push({ kind: "h2", text: "10. Approval and sign-off" });
  if (m.isDraft) {
    b.push({
      kind: "callout",
      label: "Sign-off gate — not satisfied",
      text: `This report is in DRAFT. It asserts disclosure facts on Okiru letterhead from data Okiru has not verified, and it cannot be issued in Final state until a named officer of ${entity} has signed it off. Every page carries a DRAFT watermark until then. There is no override.`,
    });
  } else {
    b.push({
      kind: "kv",
      rows: [
        ["Approved by", m.signOffName],
        ["Role", dash(m.signOffRole)],
        ["Date of approval", m.signOffDate],
        ["Version approved", m.reportVersion],
      ],
    });
  }

  /* ───────────────────────── F3. How to use this report ──────────────── */
  b.push({ kind: "h1", text: "How to use this report", pageBreakBefore: true });
  b.push({
    kind: "p",
    text: `Section 1 is the board-readable summary. Section 2 sets the South African regulatory horizon. Sections 3 to 5 cover governance, materiality and strategy. Sections 6 to 8 carry environmental, social and governance performance. Section 9 is the consolidated KPI table, Section 10 the gap register and assurance readiness, and Section 11 the roadmap. The disclosure index below is the cross-reference of record: it names, for every required disclosure, where it is reported or why it is not.`,
  });
  b.push({ kind: "h3", text: "Data quality legend" });
  b.push({
    kind: "table",
    head: ["Score", "Definition"],
    rows: DATA_QUALITY_LEGEND.map((d) => [String(d.score), d.definition]),
    widths: [12, 88],
  });
  b.push({ kind: "h3", text: "RAG legend" });
  b.push({
    kind: "table",
    head: ["Status", "Definition"],
    rows: RAG_LEGEND.map((d) => [d.status, d.definition]),
    widths: [14, 86],
  });
  b.push({ kind: "h3", text: "Claim tier legend" });
  b.push({
    kind: "table",
    head: ["Tier", "Type", "What it asserts", "What binds it"],
    rows: CLAIM_TIER_LEGEND.map((c) => [c.tier, c.type, c.asserts, c.bindsTo]),
    widths: [8, 16, 36, 40],
  });

  /* ───────────────────────── F4. Disclosure index ────────────────────── */
  b.push({ kind: "h1", text: "Disclosure index", pageBreakBefore: true });
  b.push({
    kind: "p",
    text: `Generated last, from the populated data spine. A disclosure that is omitted still appears here with its reason — suppression is visible by design, so that a topic cannot be removed quietly.`,
  });
  b.push({
    kind: "table",
    head: ["Required disclosure", "Framework refs", "Where reported", "Status", "Data quality", "Omission reason"],
    rows: model.disclosureIndex.map((r) => [
      r.requiredDisclosure,
      r.frameworkRefs,
      r.whereReported,
      r.status,
      r.dataQuality,
      r.omissionReason,
    ]),
    widths: [24, 16, 22, 11, 10, 17],
  });

  /* ───────────────────── Section 1 — Executive summary ───────────────── */
  b.push({ kind: "h1", text: "Section 1 — Executive summary", pageBreakBefore: true });

  b.push({ kind: "h2", text: "1.1 Maturity position" });
  b.push({
    kind: "table",
    caption: "ESG maturity position and pillar sub-scores",
    head: ["Pillar", "Score", "Maximum", "Achievement"],
    rows: [
      ["Environmental", n(model.scores.environmental.score), String(model.scores.environmental.max), pctOf(model.scores.environmental.percent)],
      ["Social", n(model.scores.social.score), String(model.scores.social.max), pctOf(model.scores.social.percent)],
      ["Governance", n(model.scores.governance.score), String(model.scores.governance.max), pctOf(model.scores.governance.percent)],
      ["Overall", "—", "—", pctOf(model.scores.overallPercent)],
    ],
    widths: [34, 22, 22, 22],
  });
  b.push({
    kind: "note",
    text: `Movement against a prior period is not shown: no prior-period register exists for this entity. From the next reporting cycle this table carries the year-on-year movement.`,
  });

  b.push({ kind: "h2", text: "1.2 Performance dashboard" });
  b.push({
    kind: "table",
    caption: "Report-level performance and data quality",
    head: ["Measure", "Value", "Basis"],
    rows: [
      ["Overall ESG position", pctOf(model.scores.overallPercent), "Weighted across the three pillars"],
      ["Scope 1 emissions", model.ghg.hasData ? `${n(model.ghg.scope1, 2)} tCO2e` : "Not reported", "Activity x emission factor, operational control"],
      ["Scope 2 emissions (net of solar)", model.ghg.hasData ? `${n(model.ghg.scope2, 2)} tCO2e` : "Not reported", "Purchased electricity, location-based"],
      ["Scope 1 + 2 emissions", model.ghg.hasData ? `${n(model.ghg.scope1And2, 2)} tCO2e` : "Not reported", "The figure a tender or lender asks for first"],
      ["Scope 3 (partial — water only)", model.ghg.hasData ? `${n(model.ghg.scope3, 2)} tCO2e` : "Not reported", "Municipal water supply and treatment only"],
      ["Weighted data quality index", model.dataQualityIndex != null ? `${model.dataQualityIndex} of 5` : "Not rated", "Mean data quality across all rated metrics"],
      ["Metrics populated", `${model.coverage.populated} of ${model.coverage.total}`, "Unpopulated metrics render an omission and a gap"],
      ["Gaps on the register", String(model.gaps.length), "Every omission and every data quality of 3 or below"],
      ["Topics ready for limited assurance", `${model.assuranceReadiness.filter((r) => r.rating === "Ready for limited assurance").length} of ${model.assuranceReadiness.length}`, "All metrics populated at data quality 4 or better"],
    ],
    widths: [34, 24, 42],
  });
  b.push({
    kind: "table",
    caption: "Distribution of data quality across the metric set",
    head: ["Data quality", "Metrics", "Share"],
    rows: (["5", "4", "3", "2", "1", "unrated"] as const).map((k) => {
      const count = model.dataQualityDistribution[k];
      return [
        k === "unrated" ? "Not rated (not measured)" : `${k} of 5`,
        String(count),
        model.coverage.total ? `${((count / model.coverage.total) * 100).toFixed(1)}%` : "—",
      ];
    }),
    widths: [40, 25, 35],
  });

  b.push({ kind: "h2", text: "1.3 What changed this period" });
  const statements: string[] = [];
  if (model.ghg.hasData) {
    statements.push(
      `Scope 1 and 2 emissions of ${n(model.ghg.scope1And2, 2)} tCO2e were calculated for the period from activity data and stated emission factors, giving the entity a defensible emissions position for the first time.`,
    );
  } else {
    statements.push(`No emissions activity was captured for the period, so no emissions position can be stated. This is the single highest-priority gap on the register.`);
  }
  statements.push(
    `The metric register carries ${model.coverage.total} metrics, of which ${model.coverage.populated} are populated and ${model.coverage.omitted} render a reasoned omission.`,
  );
  if (model.dataQualityIndex != null) {
    statements.push(
      `The weighted data quality index is ${model.dataQualityIndex} of 5. ${model.dataQualityDistribution["4"] + model.dataQualityDistribution["5"]} metrics are at the level an assurance provider will accept without remediation.`,
    );
  }
  if (model.netZero?.available) {
    statements.push(
      `A net-zero pathway is in place against a baseline of ${n(model.netZero.baselineTco2e, 2)} tCO2e, with ${model.netZero.milestones.length} milestones and ${model.netZero.levers.length} named reduction levers carried into the roadmap at Section 11.`,
    );
  }
  statements.push(
    `${model.gaps.length} gaps are recorded, each with an owner, an effort band, a cost band and a target close date, forming the scope of work for the next cycle.`,
  );
  b.push({ kind: "numbered", items: statements });

  b.push({ kind: "h2", text: "1.4 Decisions required of the board" });
  if (model.boardDecisions.length) {
    b.push({
      kind: "table",
      head: ["Decision", "Deadline", "Consequence of deferral", "Cost band", "Roadmap ref"],
      rows: model.boardDecisions.map((d) => [d.decision, d.deadline, d.consequenceOfDeferral, d.costBand, d.roadmapRef]),
      widths: [28, 12, 36, 14, 10],
    });
  } else {
    b.push({ kind: "p", text: "No board decision is outstanding: every metric in the register is populated at a data quality that supports assurance." });
  }

  /* ────────────── Section 2 — Operating and regulatory context ───────── */
  b.push({ kind: "h1", text: "Section 2 — Operating and regulatory context", pageBreakBefore: true });
  b.push({
    kind: "p",
    text: `The instruments below are filtered to those that bear on a ${m.sector.toLowerCase()} entity of this profile. Each states the requirement, whether it applies to ${entity}, what action follows and by when.`,
  });
  b.push({
    kind: "table",
    head: ["Instrument", "Status", "Requirement", "Applicability", "Action required", "Deadline"],
    rows: model.regulatoryHorizon.map((r) => [r.instrument, r.status, r.requirement, r.applicability, r.actionRequired, r.deadline]),
    widths: [17, 14, 21, 21, 17, 10],
  });
  b.push({ kind: "h2", text: "2.1 Compliance calendar — next 24 months" });
  b.push({
    kind: "table",
    head: ["Obligation", "Cycle", "Owner"],
    rows: [
      ["Employment Equity report (EEA2/EEA4)", "Annual — 15 January", "Human Resources Executive"],
      ["B-BBEE verification", "Annual — after measurement period end", "Managing Director"],
      ["Carbon tax return, where the threshold is met", "Annual — July", "Financial Manager"],
      ["Social and Ethics Committee report (Reg 43)", "Annual — with the AFS", "Company Secretary"],
      ["Workplace Skills Plan / Annual Training Report", "Annual — 30 April", "Human Resources Executive"],
      ["This ESG disclosure pack", "Annual — after period end", "Company Secretary"],
    ],
    widths: [46, 30, 24],
  });

  /* ───────────────────── Section 3 — Governance ──────────────────────── */
  b.push({ kind: "h1", text: "Section 3 — Governance", pageBreakBefore: true });
  const govClaims = model.claims.filter((c) => c.tier === "B");
  for (const c of govClaims) b.push({ kind: "p", text: c.text });
  b.push({ kind: "h2", text: "3.1 Management accountability" });
  b.push({
    kind: "p",
    text: `Accountability below is drawn from the source-owner field of each metric record, so the report proves accountability rather than asserting it. Every figure in this document has a named role behind it.`,
  });
  const owners = Array.from(new Set(model.metrics.map((x) => x.sourceOwner)));
  b.push({
    kind: "table",
    head: ["Accountable role", "Metrics owned", "Populated", "Topics"],
    rows: owners.map((o) => {
      const set = model.metrics.filter((x) => x.sourceOwner === o);
      const topics = Array.from(new Set(set.map((x) => x.topic)));
      return [o, String(set.length), String(set.filter((x) => x.value != null).length), topics.slice(0, 4).join(", ")];
    }),
    widths: [26, 14, 14, 46],
  });
  b.push({ kind: "h2", text: "3.2 Social and Ethics Committee (Regulation 43)" });
  b.push({
    kind: "p",
    text: `Companies Act Regulation 43 requires a Social and Ethics Committee and an annual report to shareholders for companies above the public interest score threshold. That report draws on this same spine — social performance, ethics, the environment, consumer relationships and labour — and is separately extractable at no additional data cost.`,
  });

  /* ───────────────────── Section 4 — Materiality ─────────────────────── */
  b.push({ kind: "h1", text: "Section 4 — Materiality", pageBreakBefore: true });
  b.push({
    kind: "p",
    text: `Materiality approach: ${m.materialityApproach}. Each material matter below links to at least one metric and one roadmap action. A matter with nothing attached is flagged, because a material matter with no metric and no action is a narrative claim rather than a management process.`,
  });
  b.push({
    kind: "table",
    head: ["Material matter", "Pillar", "Financial exposure", "Metrics", "Roadmap actions", "Flagged"],
    rows: model.materialMatters.map((mm) => [
      mm.matter,
      mm.pillar,
      mm.financialExposure,
      String(mm.metricIds.length),
      mm.roadmapRefs.length ? mm.roadmapRefs.slice(0, 4).join(", ") + (mm.roadmapRefs.length > 4 ? ` +${mm.roadmapRefs.length - 4}` : "") : "None",
      mm.flagged ? "Yes — nothing attached" : "No",
    ]),
    widths: [20, 12, 28, 9, 20, 11],
  });

  /* ───────────── Section 5 — Strategy and value creation ─────────────── */
  b.push({ kind: "h1", text: "Section 5 — Strategy and value creation", pageBreakBefore: true });
  const commitmentClaims = model.claims.filter((c) => c.tier === "C");
  if (commitmentClaims.length) {
    for (const c of commitmentClaims) b.push({ kind: "p", text: c.text });
  } else {
    b.push({
      kind: "p",
      text: `No board-approved target with a date and an owner is recorded for this entity, so no commitment is asserted in this report. A commitment without a target, a date and an owner does not render — that is the class of statement a regulator circles.`,
    });
  }
  if (model.netZero?.available) {
    b.push({ kind: "h2", text: "5.1 Transition plan" });
    b.push({
      kind: "table",
      caption: "Net-zero milestones against the required trajectory",
      head: ["Tier", "Year", "Requirement", "Reduction required", "Permitted tCO2e", "Gap tCO2e", "On track"],
      rows: model.netZero.milestones.map((ms) => [
        ms.tier,
        String(ms.year),
        ms.requirement,
        pctOf(ms.reductionRequired),
        n(ms.targetTco2e, 2),
        n(ms.gapTco2e, 2),
        ms.onTrack ? "Yes" : "No",
      ]),
      widths: [12, 8, 30, 12, 13, 13, 12],
    });
    b.push({ kind: "h2", text: "5.2 Reduction levers" });
    b.push({
      kind: "table",
      head: ["Lever", "Action", "Target", "Timeline", "Owner"],
      rows: model.netZero.levers.map((l) => [l.lever, l.action, l.target, l.timeline, l.owner]),
      widths: [16, 34, 20, 15, 15],
    });
  } else {
    b.push({ kind: "h2", text: "5.1 Transition plan" });
    b.push({
      kind: "note",
      text: `No emissions baseline has been established, so no transition plan can be modelled. Establishing the baseline is recorded on the gap register and is a precondition for every climate target in this report.`,
    });
  }

  /* ───────────── Sections 6-8 — performance by pillar ────────────────── */
  const pillarSections: [EsgReportModel["metrics"][number]["pillar"], string][] = [
    ["Environmental", "Section 6 — Environmental performance"],
    ["Social", "Section 7 — Social performance"],
    ["Governance", "Section 8 — Governance metrics"],
  ];
  for (const [pillar, title] of pillarSections) {
    b.push({ kind: "h1", text: title, pageBreakBefore: true });
    const set = model.metrics.filter((x) => x.pillar === pillar);
    const byTopic = Array.from(new Set(set.map((x) => x.topic)));
    for (const topic of byTopic) {
      const rows = set.filter((x) => x.topic === topic);
      b.push({ kind: "h2", text: topic });
      b.push({
        kind: "table",
        head: ["Metric", "Value", "Unit", "Boundary", "Source system", "Owner", "Data quality", "RAG"],
        rows: rows.map((x) => [
          x.metricName,
          x.value == null ? "Not reported" : typeof x.value === "number" ? n(x.value, x.unit === "count" || x.unit === "employees" ? 0 : 2) : String(x.value),
          x.unit,
          x.boundary,
          x.sourceSystem,
          x.sourceOwner,
          x.dataQualityScore == null ? "Not rated" : `${x.dataQualityScore}/5`,
          x.ragStatus,
        ]),
        widths: [22, 10, 10, 12, 18, 14, 8, 6],
      });
      // Rule 1 — a topic with no data renders an omission statement, never a blank.
      const omitted = rows.filter((x) => x.omissionCode);
      if (omitted.length) {
        b.push({ kind: "h3", text: "Omissions" });
        b.push({ kind: "bullets", items: omitted.map((x) => `${x.metricName} — ${x.commentary}`) });
      }
      const commented = rows.filter((x) => !x.omissionCode && x.commentary);
      if (commented.length) {
        b.push({ kind: "h3", text: "Commentary" });
        b.push({ kind: "bullets", items: commented.slice(0, 12).map((x) => x.commentary as string) });
      }
    }
    if (pillar === "Environmental" && model.ghg.hasData) {
      b.push({ kind: "h2", text: "Greenhouse gas inventory — the defensible detail" });
      b.push({
        kind: "table",
        caption: "Every emissions line, with the activity and factor behind it",
        head: ["Line", "Scope", "Activity", "Unit", "Factor", "Factor unit", "tCO2e"],
        rows: model.ghg.lines.map((l: EsgReportModel["ghg"]["lines"][number]) => [
          l.label,
          String(l.scope),
          n(l.activity, 0),
          l.unit,
          String(l.factor),
          l.factorUnit,
          n(l.tco2e, 2),
        ]),
        widths: [28, 7, 13, 10, 10, 18, 14],
      });
      b.push({
        kind: "note",
        text: `Source: metric register E-GHG series. Scope 3 is partial by construction — municipal water only. On-site solar is credited at the difference between the grid factor and solar's own lifecycle factor, never at the full grid factor.`,
      });
    }
  }

  /* ────────── Section 9 — Metrics, targets and performance ───────────── */
  b.push({ kind: "h1", text: "Section 9 — Metrics, targets and performance", pageBreakBefore: true });
  b.push({
    kind: "p",
    text: `One row per tracked metric, grouped by pillar. This is the page a funder or a customer photographs.`,
  });
  for (const [pillar] of pillarSections) {
    const rows = model.kpiTable.filter((r) => r.pillar === pillar);
    if (!rows.length) continue;
    b.push({ kind: "h2", text: pillar });
    b.push({
      kind: "table",
      head: ["Metric", "Baseline", "Prior year", "Current", "Target", "Target year", "Trajectory", "RAG", "Data quality", "Assurance", "Owner"],
      rows: rows.map((r) => [
        r.metric,
        r.baseline,
        r.priorYear,
        r.current,
        r.target,
        r.targetYear,
        r.trajectory,
        r.rag,
        r.dataQuality,
        r.assurance,
        r.owner,
      ]),
      widths: [18, 8, 7, 11, 9, 6, 10, 5, 8, 9, 9],
    });
  }

  /* ────────── Section 10 — Gap register and assurance readiness ──────── */
  b.push({ kind: "h1", text: "Section 10 — Gap register and assurance readiness", pageBreakBefore: true });
  b.push({
    kind: "p",
    text: `Generated from every omission, every grey RAG status and every data quality score of 3 or below. Each gap carries an owner, an effort band, a cost band and a target close date, so the register doubles as a costed scope of work.`,
  });
  b.push({ kind: "h2", text: "10.1 Priority remediation — top five by risk-weighted effort" });
  b.push({
    kind: "table",
    head: ["Gap ID", "Metric", "Nature of gap", "Risk", "Effort", "Cost band", "Owner", "Target close", "Roadmap ref"],
    rows: model.gaps.slice(0, 5).map((g) => [g.gapId, g.metric, g.natureOfGap, g.risk, g.effortBand, g.costBand, g.owner, g.targetClose, g.roadmapRef]),
    widths: [8, 20, 22, 7, 6, 12, 12, 8, 5],
  });
  b.push({ kind: "h2", text: "10.2 Full gap register" });
  b.push({
    kind: "table",
    head: ["Gap ID", "Metric", "Nature of gap", "Requirement not met", "Risk", "Effort", "Cost band", "Owner", "Target close", "Roadmap ref"],
    rows: model.gaps.map((g) => [
      g.gapId,
      g.metric,
      g.natureOfGap,
      g.requirementNotMet,
      g.risk,
      g.effortBand,
      g.costBand,
      g.owner,
      g.targetClose,
      g.roadmapRef,
    ]),
    widths: [7, 17, 18, 16, 6, 5, 10, 11, 6, 4],
  });
  b.push({ kind: "h2", text: "10.3 Assurance readiness by topic" });
  b.push({
    kind: "table",
    head: ["Topic", "Rating", "Weighted data quality", "Populated", "Basis"],
    rows: model.assuranceReadiness.map((r) => [
      r.topic,
      r.rating,
      r.weightedDataQuality != null ? `${r.weightedDataQuality} of 5` : "Not rated",
      `${r.metricsPopulated} of ${r.metricsTotal}`,
      r.reason,
    ]),
    widths: [20, 18, 14, 10, 38],
  });

  /* ───────────────────── Section 11 — Roadmap ────────────────────────── */
  b.push({ kind: "h1", text: "Section 11 — Roadmap", pageBreakBefore: true });
  for (const horizon of ["0-6 months", "6-18 months", "18-36 months"] as const) {
    const rows = model.roadmap.filter((r) => r.horizon === horizon);
    b.push({ kind: "h2", text: horizon });
    if (!rows.length) {
      b.push({ kind: "p", text: "No action falls in this horizon." });
      continue;
    }
    b.push({
      kind: "table",
      head: ["Action", "Material matter", "Metric", "Owner", "Start", "Due", "Dependencies", "Effort", "Cost band", "Expected outcome", "Status"],
      rows: rows.map((r) => [
        r.action,
        r.materialMatter,
        r.metric,
        r.owner,
        r.start,
        r.due,
        r.dependencies,
        r.effort,
        r.costBand,
        r.expectedOutcome,
        r.status,
      ]),
      widths: [17, 9, 12, 10, 7, 7, 10, 5, 8, 10, 5],
    });
  }

  /* ───────────────────────── Appendices ──────────────────────────────── */
  b.push({ kind: "h1", text: "Appendix A — Methodology", pageBreakBefore: true });
  b.push({
    kind: "p",
    text: `Scores are computed against the Okiru ESG indicator ledger, transcribed from the pillar scorecards: Environmental ${model.scores.environmental.max} points, Social ${model.scores.social.max} points and Governance ${model.scores.governance.max} points. Data quality is derived from how a number was captured, not asserted: a monthly grid complete for the period rates 4; a partial grid rates 3; a lone totals cell rates 2. RAG status is derived from trajectory and data quality together, so a figure on trajectory but poorly evidenced cannot show green.`,
  });
  b.push({ kind: "h2", text: "A.1 Generation rules applied to this report" });
  b.push({
    kind: "table",
    head: ["#", "Rule", "What it prevents"],
    rows: GENERATION_RULES.map((r) => [String(r.n), r.rule, r.prevents]),
    widths: [5, 60, 35],
  });

  b.push({ kind: "h1", text: "Appendix B — Emission factors and sources", pageBreakBefore: true });
  if (model.emissionFactors.length) {
    b.push({
      kind: "table",
      head: ["Applied to", "Factor", "Unit", "Source"],
      rows: model.emissionFactors.map((f) => [f.factor, String(f.value), f.unit, f.source]),
      widths: [30, 12, 20, 38],
    });
  } else {
    b.push({ kind: "p", text: "No emission factor was applied — no emissions activity was captured for the period." });
  }

  b.push({ kind: "h1", text: "Appendix C — Full metric register (Data Book extract)", pageBreakBefore: true });
  b.push({
    kind: "p",
    text: `The complete section-5 record for every metric. This is what an assurance provider asks for first.`,
  });
  b.push({
    kind: "table",
    head: ["Metric ID", "Metric", "Value", "Unit", "Boundary", "Source system", "Owner", "Calculation method", "Factor", "Data quality", "Assurance", "Target", "RAG", "Evidence"],
    rows: model.metrics.map((x) => [
      x.metricId,
      x.metricName,
      x.value == null ? "Not reported" : String(x.value),
      x.unit,
      x.boundary,
      x.sourceSystem,
      x.sourceOwner,
      x.calculationMethod,
      x.emissionFactor != null ? `${x.emissionFactor}` : "—",
      x.dataQualityScore == null ? "Not rated" : `${x.dataQualityScore}/5`,
      x.assuranceStatus,
      x.targetValue != null ? `${x.targetValue}` : "—",
      x.ragStatus,
      x.evidenceIds.join(", ") || "—",
    ]),
    widths: [7, 14, 7, 7, 7, 10, 8, 12, 5, 6, 7, 5, 4, 8],
  });

  b.push({ kind: "h1", text: "Appendix D — Framework index", pageBreakBefore: true });
  b.push({ kind: "p", text: `Cross-walk version ${m.crossWalkVersion}. Each metric records the version it was generated against.` });
  b.push({
    kind: "table",
    head: ["Metric", "Topic", "Tier", "Framework references"],
    rows: model.metrics.map((x) => [x.metricName, x.topic, x.tier, x.frameworkRefs.join(" · ")]),
    widths: [32, 22, 10, 36],
  });

  b.push({ kind: "h1", text: "Appendix E — Restatements", pageBreakBefore: true });
  if (restated.length) {
    b.push({
      kind: "table",
      head: ["Metric", "Prior value", "Restated value", "Reason"],
      rows: restated.map((x) => [x.metricName, n(x.priorYearValue, 2), String(x.value ?? "—"), dash(x.restatementReason)]),
      widths: [30, 18, 18, 34],
    });
  } else {
    b.push({ kind: "p", text: "No prior-period figure has been restated in this report." });
  }

  b.push({ kind: "h1", text: "Appendix F — Evidence register", pageBreakBefore: true });
  b.push({
    kind: "p",
    text: `Every claim in this report binds to one or more of the items below. A narrative block whose evidence reference does not resolve is blocked from rendering, not softened.`,
  });
  b.push({
    kind: "table",
    head: ["Evidence ID", "Description", "Sheet", "Range", "Cells populated", "Captured"],
    rows: model.evidence.map((e) => [e.evidenceId, e.description, e.sheet, e.range, String(e.cellsPopulated), fmtDate(e.capturedAt)]),
    widths: [10, 34, 14, 12, 12, 18],
  });
  b.push({ kind: "h2", text: "F.1 Claims register" });
  b.push({
    kind: "table",
    head: ["Claim ID", "Tier", "Claim", "Bound to", "Evidence"],
    rows: model.claims.map((c) => [c.claimId, c.tier, c.text, c.boundTo.join(", "), c.evidenceIds.join(", ")]),
    widths: [8, 6, 54, 16, 16],
  });

  b.push({ kind: "h1", text: "Appendix G — Glossary", pageBreakBefore: true });
  b.push({
    kind: "table",
    head: ["Term", "Meaning"],
    rows: [
      ["tCO2e", "Tonnes of carbon dioxide equivalent — the common unit for greenhouse gases"],
      ["Scope 1", "Direct emissions from sources the entity owns or controls"],
      ["Scope 2", "Indirect emissions from purchased electricity, heat or steam"],
      ["Scope 3", "Other indirect emissions in the value chain. Partial in this report — municipal water only"],
      ["Operational control", "A consolidation boundary covering operations the entity has authority to direct"],
      ["Data quality", "A 1 to 5 rating of how a figure was captured, defined in the legend at F3"],
      ["RAG", "Red, amber, green or grey status derived from trajectory and data quality"],
      ["LTIFR", "Lost-time injury frequency rate, per 200 000 hours worked"],
      ["EEA2", "The Employment Equity Act workforce profile return"],
      ["ISSB / IFRS S1 and S2", "The International Sustainability Standards Board's disclosure standards"],
      ["Limited assurance", "An assurance conclusion expressed negatively, based on reduced procedures"],
    ],
    widths: [24, 76],
  });

  b.push({ kind: "h1", text: "Appendix H — Legal and disclaimers", pageBreakBefore: true });
  b.push({ kind: "callout", label: "Data provenance", text: provenanceParagraph(entity, "C", "the executive summary dashboard") });
  b.push({
    kind: "p",
    text: `This report was generated by the Okiru ESG Intelligence Toolkit from data supplied by ${entity}. It is a disclosure record, not an assurance report, and confers no assurance opinion. Okiru accepts no liability for a decision taken on the basis of unverified client data. Forward-looking statements are subject to the qualification at F2 item 9.`,
  });
  b.push({
    kind: "kv",
    rows: [
      ["Toolkit version", m.toolkitVersion],
      ["Cross-walk version", m.crossWalkVersion],
      ["Report version", m.reportVersion],
      ["Data extract date", fmtDate(m.generatedAt)],
      ["Generation reference", m.generationReference],
      ["Status", m.isDraft ? "DRAFT — sign-off gate not satisfied" : `Final — approved by ${m.signOffName} on ${m.signOffDate}`],
    ],
  });

  return b;
}

/** The stamp that appears in the footer of every page of every rendering. */
export function versionStamp(model: EsgReportModel): string {
  const m = model.meta;
  return `${m.toolkitVersion} · ${m.crossWalkVersion} · Report v${m.reportVersion} · Extract ${fmtDate(m.generatedAt)} · ${m.generationReference}`;
}
