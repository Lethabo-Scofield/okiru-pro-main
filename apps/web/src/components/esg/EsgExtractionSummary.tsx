/**
 * The reveal: what we read out of the ESG documents, and where it went.
 *
 * WHY THIS IS A FORK OF `scorecard/ExtractionConfidence` RATHER THAN A REUSE
 *
 * `ExtractionConfidence` takes a `ParserToWorkbookResult` — the B-BBEE
 * injector's output — and labels its findings with the five B-BBEE scorecard
 * sections. Neither the input type nor the labels exist on the ESG side, so
 * reusing it would have meant faking a B-BBEE injection result out of ESG data,
 * which is exactly the class of quiet lie this whole flow exists to avoid.
 *
 * HOW IT IS ORGANISED, AND WHY
 *
 * A findings panel earns its place by being READ, and a flat list of forty
 * `field: value` bullets is not read — it is scrolled past. So findings are
 * grouped by the thing the user is actually thinking in (the ESG element the
 * evidence belongs to), each group collapses, and the groups that need a
 * decision sort above the ones that are merely informational.
 *
 * Two rules this panel does not bend:
 *  - Never show a placeholder where a value belongs. "structured data" told the
 *    user nothing and looked like a bug; a register renders its row count and
 *    opens to show the rows.
 *  - Never let colour be the only signal — each state carries an icon and a word.
 */
import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, FileWarning, HelpCircle } from "lucide-react";
import { esgSectionById } from "@/lib/esg/esgSections";
import { Disclosure } from "@/components/upload/flow/Disclosure";
import {
  esgCaseFileNames,
  esgUnplacedKinds,
  type EsgInjectionResult,
  type EsgParserCaseLike,
  type EsgUnplacedValue,
} from "./esgParserInjection";

interface Props {
  injection: EsgInjectionResult;
  parserCase: EsgParserCaseLike | null;
  /**
   * Headline only — counts, the nothing-read warning and element coverage.
   * The lists (disagreements, unplaced values, exceptions, unread files) are
   * shown per document in the side-by-side review instead, beside the
   * document they are about.
   */
  compact?: boolean;
  /** The step's main button, on the summary line — never below the review. */
  action?: ReactNode;
  /** One line that belongs with the summary (documents that couldn't be read). */
  notice?: ReactNode;
}

/** Element code → the wording a practitioner would recognise. */
const ELEMENT_LABELS: Record<string, string> = {
  GHG_ENERGY: "Energy & emissions",
  FLEET: "Fleet",
  WASTE: "Waste",
  WATER: "Water",
  ISO_ENVIRONMENTAL: "Environmental management",
  EMPLOYMENT_EQUITY: "Employment equity",
  HEALTH_SAFETY: "Health & safety",
  TRAINING: "Skills & training",
  COMMUNITY_CSI: "Community & CSI",
  SUPPLIER_ESG: "Supplier ESG",
  BOARD_GOVERNANCE: "Board & governance",
  ETHICS_COMPLIANCE: "Ethics & compliance",
  RISK_ASSURANCE: "Risk & assurance",
  FINANCIAL: "Financials",
};

function elementLabel(code: string): string {
  return ELEMENT_LABELS[code] ?? (code || "Unclassified");
}

/** `electricity_kwh` → `Electricity kWh`. Names, never invented values. */
function humanizeField(field: string): string {
  return field
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bKwh\b/g, "kWh")
    .replace(/\bKl\b/g, "kl")
    .replace(/\bKg\b/g, "kg")
    .replace(/\bKm\b/g, "km")
    .replace(/\bTco2e\b/gi, "tCO2e")
    .replace(/\bIso\b/g, "ISO")
    .replace(/\bLtifr\b/g, "LTIFR")
    .replace(/\bEsg\b/g, "ESG")
    .trim();
}

/** A register row rendered the way a person reads it, not as a JSON blob. */
function describeRow(row: Record<string, unknown>): string {
  return Object.entries(row)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .slice(0, 4)
    .map(([k, v]) => `${humanizeField(k)}: ${String(v)}`)
    .join(" · ");
}

/**
 * A scalar rendered as itself.
 *
 * Anything with internal structure is handled by the caller, which can open it
 * — returning the word "structured data" here was a placeholder standing where
 * the user expected their number.
 */
function formatScalar(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function isRowArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null;
}

/** One extracted reading: its name, its value, and where it came from. */
function ValueRow({ entry }: { entry: EsgUnplacedValue }) {
  const { value } = entry;
  const rows = isRowArray(value) ? value : null;
  const plainObject =
    !rows && value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  return (
    <li className="border-t border-white/[0.04] py-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[12.5px] text-[color:var(--body)]">{humanizeField(entry.field)}</span>
        <span className="tabular-nums text-[12.5px] font-medium text-[var(--esg-text,#fff)]">
          {rows
            ? `${rows.length} row${rows.length === 1 ? "" : "s"}`
            : plainObject
              ? describeRow(plainObject)
              : formatScalar(value)}
        </span>
        {entry.sourceFile && (
          <span className="ml-auto shrink-0 text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
            {entry.sourceFile}
          </span>
        )}
      </div>

      {/* A register opens to show what is actually in it. The count alone is
          not evidence — the rows are. */}
      {rows && (
        <details className="mt-1">
          <summary className="cursor-pointer list-none text-[11px] text-[var(--esg-text2,rgba(255,255,255,0.56))] hover:text-[color:var(--body)]">
            Show rows
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {rows.slice(0, 6).map((row, i) => (
              <li key={i} className="text-[11px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]">
                {describeRow(row)}
              </li>
            ))}
            {rows.length > 6 && (
              <li className="text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
                +{rows.length - 6} more row{rows.length - 6 === 1 ? "" : "s"}
              </li>
            )}
          </ul>
        </details>
      )}
    </li>
  );
}

/** One collapsible element group. Open on first render when it is the only one. */
function ElementGroup({
  code,
  entries,
  defaultOpen,
}: {
  code: string;
  entries: EsgUnplacedValue[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-[var(--esg-text3,rgba(255,255,255,0.32))] transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="text-[12.5px] font-medium text-[color:var(--body)]">{elementLabel(code)}</span>
        <span className="ml-auto tabular-nums text-[11.5px] text-[var(--esg-text2,rgba(255,255,255,0.56))]">
          {entries.length}
        </span>
      </button>
      {open && (
        <ul className="px-3 pb-2">
          {entries.map((entry, index) => (
            <ValueRow key={`${entry.documentId}-${entry.field}-${index}`} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The element each placed figure came from. A placed value carries its
 * document, not its element, so it is looked up on the extraction it was read
 * in — counting only the unplaced ones (as this panel used to) made the
 * "Covered" line under-report exactly the elements that worked best.
 */
function elementOfPlaced(parserCase: EsgParserCaseLike | null): (placed: { documentId: string; sourceFile: string }) => string {
  const byDocAndFile = new Map<string, string>();
  const byDoc = new Map<string, string>();
  for (const extraction of parserCase?.ai_entities?.extractions ?? []) {
    const element = String((extraction as { element?: unknown }).element ?? "");
    if (!element) continue;
    const documentId = String((extraction as { documentId?: unknown }).documentId ?? "");
    byDocAndFile.set(`${documentId}\u0000${String(extraction.sourceFile ?? "")}`, element);
    if (!byDoc.has(documentId)) byDoc.set(documentId, element);
  }
  return (placed) => byDocAndFile.get(`${placed.documentId}\u0000${placed.sourceFile}`) ?? byDoc.get(placed.documentId) ?? "";
}

export function EsgExtractionSummary({ injection, parserCase, compact = false, action, notice }: Props) {
  const { placed, unplaced, conflicts, valuesRead } = injection;
  // What needs a person: figures to place, values to check, disagreements.
  // Evidence no cell needs is not outstanding — it is kept, and said so.
  const kinds = esgUnplacedKinds(unplaced);
  const outstanding = kinds.toPlace + kinds.toCheck + conflicts.length;
  /** Figures written to the workbook — one per cell (a dashboard is one reading holding many). */
  const figures = injection.figuresPlaced ?? placed.length;

  // Which elements the evidence actually covered, and how many values each
  // contributed — placed and unplaced alike. Counted from the extraction
  // itself, never from a wish list.
  const elementOf = elementOfPlaced(parserCase);
  const byElement = new Map<string, number>();
  for (const value of unplaced) {
    const code = String(value.element ?? "");
    if (code) byElement.set(code, (byElement.get(code) ?? 0) + 1);
  }
  for (const value of placed) {
    const code = elementOf(value);
    if (code) byElement.set(code, (byElement.get(code) ?? 0) + 1);
  }
  const elementRows = Array.from(byElement.entries()).sort((a, b) => b[1] - a[1]);

  // The unplaced readings, grouped the way the user thinks about them. A flat
  // list of every reading across every element is the thing this replaces.
  const unplacedByElement = new Map<string, EsgUnplacedValue[]>();
  for (const entry of unplaced) {
    const code = String(entry.element ?? "");
    const bucket = unplacedByElement.get(code) ?? [];
    bucket.push(entry);
    unplacedByElement.set(code, bucket);
  }
  const unplacedGroups = Array.from(unplacedByElement.entries()).sort((a, b) => b[1].length - a[1].length);

  // Documents the parser could not read anything useful out of. A document we
  // recognised but got nothing from is not evidence, and saying so is the
  // difference between "your score is low" and "add this one file".
  const productive = new Set(
    (parserCase?.ai_entities?.extractions ?? [])
      .filter((e) => (e.values?.length ?? 0) > 0)
      .map((e) => String(e.sourceFile ?? "")),
  );
  const readNothing = esgCaseFileNames(parserCase).filter((name) => !productive.has(name));

  // Notes the extraction itself raised — a total the rows do not sum to, the
  // same workbook uploaded twice. Advisory, and specific enough to act on.
  const exceptions = (parserCase?.ai_entities?.extractions ?? []).flatMap((extraction) =>
    (extraction.exceptions ?? [])
      .map((note) => String(note ?? "").trim())
      .filter(Boolean)
      .map((note) => ({ sourceFile: String(extraction.sourceFile ?? ""), note })),
  );

  // One sentence: how many figures are ready, and what needs a person.
  const headline = `${figures} figure${figures === 1 ? "" : "s"} ready for your workbook`;
  const status =
    valuesRead === 0
      ? "nothing could be read"
      : outstanding === 0
        ? "nothing needs a look"
        : `${outstanding} need${outstanding === 1 ? "s" : ""} a look`;

  const kindsLine =
    kinds.toPlace > 0 || kinds.evidence > 0 || kinds.held > 0 ? (
      <p className="text-[12px] leading-5 text-[color:var(--body)]" data-testid="esg-unplaced-kinds">
        {[
          kinds.toPlace > 0 ? `${kinds.toPlace} figure${kinds.toPlace === 1 ? "" : "s"} need${kinds.toPlace === 1 ? "s" : ""} you to say where ${kinds.toPlace === 1 ? "it goes" : "they go"}` : "",
          kinds.evidence > 0 ? `${kinds.evidence} value${kinds.evidence === 1 ? "" : "s"} kept with ${kinds.evidence === 1 ? "its document" : "their documents"} (not needed in the workbook)` : "",
          kinds.held > 0 ? `${kinds.held} figure${kinds.held === 1 ? "" : "s"} held as context (another year, or no monthly cell)` : "",
        ].filter(Boolean).join(" · ")}
      </p>
    ) : null;

  // Added from inside a section (C1): what was read for another part of the
  // workbook was not written, and says where it belongs.
  const outsideFocus =
    (injection.outsideFocus?.length ?? 0) > 0 ? (
      <p className="text-[12px] leading-5 text-[color:var(--body)]" data-testid="esg-outside-focus">
        Not written from here:{" "}
        {injection.outsideFocus!
          .map(({ sectionId, figures: n }) => `${n} figure${n === 1 ? "" : "s"} for ${esgSectionById(sectionId)?.title ?? sectionId}`)
          .join(", ")}
        {" "}— add these documents there, or to the whole workbook, to place them.
      </p>
    ) : null;

  // ZERO EXTRACTION. The documents were read and produced nothing we can use —
  // say it, and say what to do, rather than an empty panel that reads like a
  // loading state that never finished.
  const zero =
    valuesRead === 0 ? (
      <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3" data-testid="esg-zero-extraction">
        <p className="text-[13px] font-semibold text-amber-200">We could not extract any values from these documents</p>
        <p className="mt-1 text-[12px] leading-5 text-[color:var(--body)]">
          Nothing has been written to your workbook. This usually means the files were scans we could not read, or
          documents outside the ESG evidence set. You can add different documents above, or continue and complete
          the workbook by hand — the score is calculated the same way either way.
        </p>
      </div>
    ) : null;

  // Coverage BY ELEMENT — one line of text, counted from the extraction.
  const covered =
    elementRows.length > 0 ? (
      <p className="text-[12px] leading-5 text-[color:var(--body)]" data-testid="esg-element-coverage">
        <span className="font-medium text-[color:var(--hi)]">Covered:</span>{" "}
        {elementRows.map(([code, count], i) => (
          <span key={code}>
            {i > 0 ? " · " : ""}
            <CheckCircle2 className="mr-1 inline h-3 w-3 align-[-1px] text-emerald-400" aria-hidden />
            {elementLabel(code)} <span className="tabular-nums text-[color:var(--muted)]">{count}</span>
          </span>
        ))}
      </p>
    ) : null;

  if (compact) {
    return (
      <div className="rounded-[18px] border border-white/[0.08] bg-[color:var(--ink-3)] px-4 py-3" data-testid="esg-extraction-summary">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-[14px] leading-6 text-[color:var(--body)]">
            <span className="font-semibold text-white">{headline}</span>
            {" · "}
            <span className={valuesRead === 0 || outstanding > 0 ? "text-amber-200" : ""}>{status}</span>
          </p>
          {action}
        </div>
        <div className="mt-2 space-y-2 empty:hidden">
          {notice}
          {outsideFocus}
          {zero}
          {covered}
        </div>
        {(kindsLine || valuesRead > 0) && (
          <Disclosure summary="Details" className="mt-2" summaryClassName="text-[12px]" testId="esg-summary-details">
            <div className="space-y-1">
              <p className="text-[12px] leading-5 text-[color:var(--body)]">
                {valuesRead} value{valuesRead === 1 ? "" : "s"} read in all; each document is reviewed below — what we
                took from it, what we couldn&apos;t place, and why anything wasn&apos;t read.
              </p>
              {kindsLine}
            </div>
          </Disclosure>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-[color:var(--ink-2)] p-5" data-testid="esg-extraction-summary">
      <div className="flex items-start justify-between gap-4">
        <h4 className="text-[18px] font-semibold leading-tight text-white">
          {headline}
          <span className="block text-[13px] font-normal text-[color:var(--body)]">
            {status} · {valuesRead} value{valuesRead === 1 ? "" : "s"} read
          </span>
        </h4>
        {action}
      </div>
      <div className="mt-3 space-y-3">
        {kindsLine}
        {notice}
        {outsideFocus}
        {zero}
        {covered}
      </div>

      {/* FIGURES THE DOCUMENTS DISAGREE ON. Left blank rather than guessed.
          One candidate per line: `a (src) vs b (src)` on one wrapping line was
          unreadable at exactly the moment the user had to choose between them. */}
      {conflicts.length > 0 && (
        <div className="mt-4" data-testid="esg-value-conflicts">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--hi)]">
            <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
            Your documents disagree on {conflicts.length} figure{conflicts.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-[11.5px] text-[color:var(--body)]">We left them blank. Pick the right one in the workbook.</p>
          <div className="mt-2 space-y-2">
            {conflicts.map((conflict) => (
              <div key={`${conflict.sectionId}.${conflict.cellRef}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <p className="text-[12px] font-medium text-[color:var(--hi)]">{conflict.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {conflict.candidates.map((candidate, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12px] leading-5">
                      <span className="tabular-nums text-white">{formatScalar(candidate.value)}</span>
                      <span className="text-[11px] text-[color:var(--muted)]">{candidate.sources.join(", ") || "unknown source"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* THE VALUES THEMSELVES, grouped by element and collapsible. */}
      {unplaced.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--hi)]">
            <FileWarning className="h-4 w-4 text-amber-300" aria-hidden />
            Read, but could not be placed automatically
          </p>
          <p className="mt-1 text-[11.5px] text-[color:var(--body)]">
            Enter the ones you need in the workbook — nothing here has been guessed for you.
          </p>
          <div className="mt-2 space-y-1.5" data-testid="esg-unplaced-values">
            {/* The biggest group opens on arrival: a panel whose every group is
                shut shows the user nothing and reads as empty. */}
            {unplacedGroups.map(([code, entries], index) => (
              <ElementGroup key={code || "unclassified"} code={code} entries={entries} defaultOpen={index === 0} />
            ))}
          </div>
        </div>
      )}

      {/* Evidence that did not reconcile — exactly what an assurance provider
          asks about, and the person who can answer is here. */}
      {exceptions.length > 0 && (
        <div className="mt-4" data-testid="esg-extraction-exceptions">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--hi)]">
            <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
            {exceptions.length} thing{exceptions.length === 1 ? "" : "s"} worth checking in your evidence
          </p>
          <ul className="mt-2 space-y-1">
            {exceptions.slice(0, 8).map((entry, index) => (
              <li key={`${entry.sourceFile}-${index}`} className="text-[11.5px] leading-5 text-[color:var(--body)]">
                <span className="text-[color:var(--hi)]">{entry.sourceFile || "This case"}:</span> {entry.note}
              </li>
            ))}
            {exceptions.length > 8 && <li className="text-[11px] text-[color:var(--muted)]">+{exceptions.length - 8} more</li>}
          </ul>
        </div>
      )}

      {/* Documents that produced nothing, named one per line. */}
      {readNothing.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--hi)]">
            <HelpCircle className="h-4 w-4 text-amber-300" aria-hidden />
            {readNothing.length} document{readNothing.length === 1 ? "" : "s"} we read nothing from
          </p>
          <ul className="mt-2 space-y-0.5">
            {readNothing.slice(0, 6).map((name) => (
              <li key={name} className="truncate font-mono text-[11px] leading-5 text-[color:var(--body)]" title={name}>
                {name}
              </li>
            ))}
            {readNothing.length > 6 && <li className="text-[11px] text-[color:var(--muted)]">+{readNothing.length - 6} more</li>}
          </ul>
        </div>
      )}

      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-5 text-[color:var(--muted)]">
        Everything above is editable in the workbook. A value we could not place is left blank rather than guessed — a
        wrong entry would score as nothing without telling you.
      </p>
    </div>
  );
}

export default EsgExtractionSummary;
