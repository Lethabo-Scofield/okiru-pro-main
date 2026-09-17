/**
 * The grounding document for the ESG workbook assistant.
 *
 * WHY THIS EXISTS
 *
 * A chat that answers from its own imagination is worse than no chat: it will
 * happily invent a diesel figure or bless a workbook that fails submit. So the
 * SERVER builds this document from the workbook it just authorised — the same
 * scores the dashboard shows (`computeEsgScorecard`), the same validation the
 * panel renders (`validateEsgWorkbookForSubmit`, register hygiene included) —
 * and the model is instructed that this document is its only source of truth
 * about the workbook. Nothing the browser sends about workbook CONTENT is
 * trusted; the client contributes only the conversation and which section is
 * open.
 *
 * WHAT GOES IN, WHAT STAYS OUT
 *
 * Registers go in as compact rows (capped, with the truncation stated) because
 * "is this vehicle listed twice?" needs the rows themselves. E_Data goes in as
 * block totals, not 1,000 month cells — the questions people ask ("why is my
 * E score low?") are answered by totals plus the validation lines, and a
 * grounding document the size of the workbook would drown the model in noise.
 *
 * Pure and synchronous: workbook in, string out. Testable without a server.
 */
import { ESG_INPUT_SECTIONS } from "./esgSections";
import {
  ESG_GRID_SECTIONS,
  ESG_GRID_SECTION_IDS,
  type EsgGridSectionId,
} from "./esgGridSections";
import { readEsgGridRows } from "./esgGridRows";
import { deriveEsgSummaryCells } from "./esgDeriveSummary";
import { validateEsgWorkbookForSubmit } from "./esgValidation";
import type { EsgWorkbookData } from "./esgWorkbookStorage";
import { computeEsgScorecard } from "../../../EsgToolkit/src/lib/calculators";
import { ESG_DEFAULT_DEPOTS } from "./esgAxes";

/** Rows shown per register before "+N more". Enough for duplicates, not a dump. */
const REGISTER_ROW_CAP = 30;

function sectionTitle(id: string): string {
  return ESG_INPUT_SECTIONS.find((s) => s.id === id)?.title ?? id;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-ZA", { maximumFractionDigits: digits });
}

/** One register as header + capped TSV rows — or nothing when it is empty. */
function registerBlock(workbook: EsgWorkbookData, sectionId: EsgGridSectionId): string | null {
  const def = ESG_GRID_SECTIONS[sectionId];
  const rows = readEsgGridRows(workbook.sections?.[sectionId]?.cells, sectionId);
  if (rows.length === 0) return null;
  const cols = def.columns;
  const lines = [
    `### ${sectionTitle(sectionId)} (${rows.length} row${rows.length === 1 ? "" : "s"})`,
    cols.map((c) => c.label).join(" | "),
    ...rows
      .slice(0, REGISTER_ROW_CAP)
      .map((row) => cols.map((c) => cellText(row[c.key])).join(" | ")),
  ];
  if (rows.length > REGISTER_ROW_CAP) {
    lines.push(`(+${rows.length - REGISTER_ROW_CAP} more rows not shown)`);
  }
  return lines.join("\n");
}

/** The E_Data roll-ups a score question actually needs. */
function environmentalTotals(derived: EsgWorkbookData): string {
  const cells = derived.sections?.["e-data"]?.cells ?? {};
  const rows: Array<[string, string, string]> = [
    ["Fleet diesel YTD", "L19", "litres"],
    ["Generator diesel YTD", "L28", "litres"],
    ["LPG forklifts YTD", "L32", "kg"],
    ["Business cars YTD", "L37", "litres"],
    ["Electricity YTD", "L46", "kWh"],
    ["Water YTD", "L63", "kL"],
  ];
  const lines = rows
    .map(([label, ref, unit]) => {
      const v = num(cells[ref]);
      return v === null ? null : `- ${label}: ${fmt(v)} ${unit}`;
    })
    .filter((line): line is string => line !== null);

  // Per-site YTDs — "which depot uses the most water?" is a question clients
  // actually ask, and the derived L cells already hold the answer. Row order
  // is the site axis, same convention as every monthly grid.
  const perSite: Array<[string, number, string]> = [
    ["Diesel by site", 14, "litres"],
    ["Electricity by site", 41, "kWh"],
    ["Water by site", 58, "kL"],
  ];
  for (const [label, firstRow, unit] of perSite) {
    const split = ESG_DEFAULT_DEPOTS.map((depot, i) => {
      const v = num(cells[`L${firstRow + i}`]);
      return v === null ? null : `${depot} ${fmt(v)}`;
    }).filter((s): s is string => s !== null);
    if (split.length > 1) lines.push(`- ${label} (${unit} YTD): ${split.join(", ")}`);
  }

  return lines.length ? `### Environmental totals (derived)\n${lines.join("\n")}` : "";
}

/**
 * Build the assistant's grounding document for one workbook.
 *
 * `activeSectionId` — the section the user has open, so "this section" in a
 * question resolves to something concrete.
 */
export function buildEsgAssistantContext(
  workbook: EsgWorkbookData,
  activeSectionId?: string,
): string {
  const derived = deriveEsgSummaryCells(workbook);
  const parts: string[] = [];

  // Scores — the numbers the dashboard shows, from the same calculators.
  const scorecard = computeEsgScorecard(workbook);
  if (scorecard) {
    parts.push(
      [
        "### Scores (computed now, same engine as the dashboard)",
        `- Environmental: ${fmt(scorecard.environmental.score)} / ${fmt(scorecard.environmental.max, 0)}`,
        `- Social: ${fmt(scorecard.social.score)} / ${fmt(scorecard.social.max, 0)}`,
        `- Governance: ${fmt(scorecard.governance.score)} / ${fmt(scorecard.governance.max, 0)}`,
        `- Overall: ${fmt(scorecard.overallPercent)}%`,
      ].join("\n"),
    );
  } else {
    parts.push("### Scores\nNo scores yet — the workbook has no data the calculators can read.");
  }

  // Section fill map — what exists at all.
  const fill = ESG_INPUT_SECTIONS.map((section) => {
    const cells = workbook.sections?.[section.id]?.cells ?? {};
    const isRegister = (ESG_GRID_SECTION_IDS as readonly string[]).includes(section.id);
    if (isRegister) {
      const count = readEsgGridRows(cells, section.id as EsgGridSectionId).length;
      return `- ${section.title}: ${count === 0 ? "empty" : `${count} rows`}`;
    }
    const count = Object.keys(cells).filter((k) => !k.startsWith("_")).length;
    return `- ${section.title}: ${count === 0 ? "empty" : `${count} cells captured`}`;
  });
  parts.push(`### Sections\n${fill.join("\n")}`);

  const env = environmentalTotals(derived);
  if (env) parts.push(env);

  // Validation — blockers, warnings, and the hygiene rules' row-level detail.
  const validation = validateEsgWorkbookForSubmit(workbook);
  const failing = [...validation.blockers, ...validation.warnings];
  if (failing.length) {
    const lines = failing.map((issue) => {
      const where = issue.sectionId ? ` [${sectionTitle(issue.sectionId)}]` : "";
      const detail =
        issue.actual && issue.actual !== "No" && issue.actual !== "Pending"
          ? ` — ${issue.actual}`
          : "";
      return `- ${issue.severity === "critical" ? "BLOCKER" : "warning"}: ${issue.label}${where}${detail}`;
    });
    parts.push(`### Validation findings\n${lines.join("\n")}`);
  } else {
    parts.push("### Validation findings\nNone — every evaluated rule passes.");
  }

  // Registers, row by row (capped) — duplicates and gaps live here.
  for (const id of ESG_GRID_SECTION_IDS) {
    const block = registerBlock(workbook, id);
    if (block) parts.push(block);
  }

  if (activeSectionId) {
    parts.push(`### Currently open section\n${sectionTitle(activeSectionId)}`);
  }
  if (workbook.submittedAt) {
    parts.push(`### Status\nSubmitted on ${workbook.submittedAt} — inputs are locked.`);
  }

  return parts.join("\n\n");
}
