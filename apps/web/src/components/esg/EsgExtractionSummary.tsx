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
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, FileWarning, HelpCircle } from "lucide-react";
import {
  esgCaseFileNames,
  type EsgInjectionResult,
  type EsgParserCaseLike,
  type EsgUnplacedValue,
} from "./esgParserInjection";

interface Props {
  injection: EsgInjectionResult;
  parserCase: EsgParserCaseLike | null;
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
        <span className="text-[12.5px] text-[#d1d1d6]">{humanizeField(entry.field)}</span>
        <span className="tabular-nums text-[12.5px] font-medium text-[var(--esg-text,#fff)]">
          {rows
            ? `${rows.length} row${rows.length === 1 ? "" : "s"}`
            : plainObject
              ? describeRow(plainObject)
              : formatScalar(value)}
        </span>
        {entry.sourceFile && (
          <span className="ml-auto shrink-0 text-[11px] text-[var(--esg-text3,#636366)]">
            {entry.sourceFile}
          </span>
        )}
      </div>

      {/* A register opens to show what is actually in it. The count alone is
          not evidence — the rows are. */}
      {rows && (
        <details className="mt-1">
          <summary className="cursor-pointer list-none text-[11px] text-[var(--esg-text2,#8e8e93)] hover:text-[#d1d1d6]">
            Show rows
          </summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {rows.slice(0, 6).map((row, i) => (
              <li key={i} className="text-[11px] leading-5 text-[var(--esg-text2,#8e8e93)]">
                {describeRow(row)}
              </li>
            ))}
            {rows.length > 6 && (
              <li className="text-[11px] text-[var(--esg-text3,#636366)]">
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
          className={`h-3.5 w-3.5 shrink-0 text-[var(--esg-text3,#636366)] transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="text-[12.5px] font-medium text-[#d1d1d6]">{elementLabel(code)}</span>
        <span className="ml-auto tabular-nums text-[11.5px] text-[var(--esg-text2,#8e8e93)]">
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

export function EsgExtractionSummary({ injection, parserCase }: Props) {
  const { placed, unplaced, conflicts, valuesRead } = injection;

  // Which elements the evidence actually covered, and how many values each
  // contributed. Counted from the extraction itself — never from a wish list.
  const byElement = new Map<string, number>();
  for (const value of [...unplaced, ...placed.map((p) => ({ ...p, element: "" }))]) {
    const code = String((value as { element?: string }).element ?? "");
    byElement.set(code, (byElement.get(code) ?? 0) + 1);
  }
  const elementRows = Array.from(byElement.entries())
    .filter(([code]) => code)
    .sort((a, b) => b[1] - a[1]);

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

  return (
    <div
      className="rounded-[22px] border border-[var(--esg-glass-border,#2c2c2e)] bg-[var(--esg-input-bg,#0e0e10)] p-5"
      data-testid="esg-extraction-summary"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--esg-text3,#636366)]">
            What we read from your documents
          </p>
          <h4
            className="mt-2 text-[22px] font-semibold leading-none text-[var(--esg-text,#fff)]"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
          >
            {valuesRead} value{valuesRead === 1 ? "" : "s"} read · {placed.length} placed
          </h4>
        </div>
        {valuesRead === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/[0.12] px-3 py-1.5 text-[12px] font-medium text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Nothing extracted
          </span>
        ) : unplaced.length === 0 && conflicts.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#30d158]/[0.12] px-3 py-1.5 text-[12px] font-medium text-[#30d158]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Nothing outstanding
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/[0.12] px-3 py-1.5 text-[12px] font-medium text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> {unplaced.length + conflicts.length} to review
          </span>
        )}
      </div>

      {/* ZERO EXTRACTION. The documents were read and produced nothing we can
          use — say it, and say what to do, rather than showing an empty panel
          that reads like a loading state that never finished. */}
      {valuesRead === 0 && (
        <div
          className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3"
          data-testid="esg-zero-extraction"
        >
          <p className="text-[13px] font-semibold text-amber-200">
            We could not extract any values from these documents
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--esg-text2,#8e8e93)]">
            Nothing has been written to your workbook. This usually means the files were scans we
            could not read, or documents outside the ESG evidence set. You can add different
            documents above, or continue and complete the workbook by hand — the score is
            calculated the same way either way.
          </p>
        </div>
      )}

      {/* Coverage BY ELEMENT — counted from the extraction, so it can never
          claim an element the documents did not speak to. */}
      {elementRows.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-[#d1d1d6]">Evidence by element</p>
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="esg-element-coverage">
            {elementRows.map(([code, count]) => (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#30d158]/25 bg-[#30d158]/[0.07] px-2.5 py-1 text-[11.5px] text-[#a8e6c0]"
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden />
                {elementLabel(code)}
                <span className="tabular-nums text-[var(--esg-text2,#8e8e93)]">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* FIGURES THE DOCUMENTS DISAGREE ON. Left blank rather than guessed.
          One candidate per line: `a (src) vs b (src)` on one wrapping line was
          unreadable at exactly the moment the user had to choose between them. */}
      {conflicts.length > 0 && (
        <div className="mt-4" data-testid="esg-value-conflicts">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#d1d1d6]">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            {conflicts.length} figure{conflicts.length === 1 ? "" : "s"} your documents disagree on
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--esg-text2,#8e8e93)]">
            Left blank rather than guessed — pick the right one in the workbook.
          </p>
          <div className="mt-2 space-y-2">
            {conflicts.map((conflict) => (
              <div
                key={`${conflict.sectionId}.${conflict.cellRef}`}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <p className="text-[12px] font-medium text-[#d1d1d6]">{conflict.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {conflict.candidates.map((candidate, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12px] leading-5">
                      <span className="tabular-nums text-[var(--esg-text,#fff)]">
                        {formatScalar(candidate.value)}
                      </span>
                      <span className="text-[11px] text-[var(--esg-text3,#636366)]">
                        {candidate.sources.join(", ") || "unknown source"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* THE VALUES THEMSELVES, grouped by element and collapsible. Forty
          readings in one flat list is a wall; the same forty behind four
          element headings is a summary someone will actually open. */}
      {unplaced.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#d1d1d6]">
            <FileWarning className="h-4 w-4 text-amber-300" />
            Read, but could not be placed automatically
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--esg-text2,#8e8e93)]">
            Enter the ones you need in the workbook — nothing here has been guessed for you.
          </p>
          <div className="mt-2 space-y-1.5" data-testid="esg-unplaced-values">
            {/* The biggest group opens on arrival: a panel whose every group is
                shut shows the user nothing and reads as empty. */}
            {unplacedGroups.map(([code, entries], index) => (
              <ElementGroup
                key={code || "unclassified"}
                code={code}
                entries={entries}
                defaultOpen={index === 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Evidence that did not reconcile. Not hidden behind a toggle: a total
          the rows do not sum to is exactly the thing an assurance provider will
          ask about, and the person who can answer is standing here with the
          documents open. */}
      {exceptions.length > 0 && (
        <div className="mt-4" data-testid="esg-extraction-exceptions">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#d1d1d6]">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            {exceptions.length} thing{exceptions.length === 1 ? "" : "s"} worth checking in your
            evidence
          </p>
          <ul className="mt-2 space-y-1">
            {exceptions.slice(0, 8).map((entry, index) => (
              <li
                key={`${entry.sourceFile}-${index}`}
                className="text-[11.5px] leading-5 text-[var(--esg-text2,#8e8e93)]"
              >
                <span className="text-amber-300/80">{entry.sourceFile || "This case"}:</span>{" "}
                {entry.note}
              </li>
            ))}
            {exceptions.length > 8 && (
              <li className="text-[11px] text-[var(--esg-text3,#636366)]">
                +{exceptions.length - 8} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Documents that produced nothing. Named one per line, so the user can
          replace the specific file rather than re-uploading everything — a
          comma-joined run of filenames truncated exactly where it mattered. */}
      {readNothing.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#d1d1d6]">
            <HelpCircle className="h-4 w-4 text-amber-300" />
            {readNothing.length} document{readNothing.length === 1 ? "" : "s"} we read nothing from
          </p>
          <ul className="mt-2 space-y-0.5">
            {readNothing.slice(0, 6).map((name) => (
              <li
                key={name}
                className="truncate font-mono text-[11px] leading-5 text-[var(--esg-text2,#8e8e93)]"
                title={name}
              >
                {name}
              </li>
            ))}
            {readNothing.length > 6 && (
              <li className="text-[11px] text-[var(--esg-text3,#636366)]">
                +{readNothing.length - 6} more
              </li>
            )}
          </ul>
        </div>
      )}

      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-5 text-[var(--esg-text3,#636366)]">
        Everything above is editable in the workbook. A value we could not place is left blank
        rather than guessed — a wrong entry would score as nothing without telling you.
      </p>
    </div>
  );
}

export default EsgExtractionSummary;
