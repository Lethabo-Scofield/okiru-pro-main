/**
 * The reveal: what we read out of the ESG documents, and where it went.
 *
 * WHY THIS IS A FORK OF `scorecard/ExtractionConfidence` RATHER THAN A REUSE
 *
 * `ExtractionConfidence` takes a `ParserToWorkbookResult` — the B-BBEE
 * injector's output — and labels its findings with the five B-BBEE scorecard
 * sections. Neither the input type nor the labels exist on the ESG side, and
 * the ESG mapping layer is deliberately still a stub, so there is no equivalent
 * object to hand it. Reusing it would have meant faking a B-BBEE injection
 * result out of ESG data, which is exactly the class of quiet lie this whole
 * flow exists to avoid.
 *
 * So this panel reports what is ACTUALLY known today: per-document, what the
 * parser read, what it could not read, and how much of it reached the
 * workbook. While `applyEsgParserResult` is stubbed that last number is zero,
 * and this says so in the largest text on the panel rather than letting the
 * user infer from a pre-filled workbook that never got filled.
 *
 * Colour is never the only signal: each state carries an icon and a word.
 */
import { AlertTriangle, CheckCircle2, FileWarning, HelpCircle } from "lucide-react";
import {
  esgCaseFileNames,
  type EsgInjectionResult,
  type EsgParserCaseLike,
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

/** `electricity_kwh` → `Electricity Kwh`. Names, never invented values. */
function humanizeField(field: string): string {
  return field
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function EsgExtractionSummary({ injection, parserCase }: Props) {
  const { implemented, placed, unplaced, conflicts, valuesRead } = injection;

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
            {valuesRead} value{valuesRead === 1 ? "" : "s"} read
            {implemented ? ` · ${placed.length} placed` : ""}
          </h4>
        </div>
        {valuesRead === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/[0.12] px-3 py-1.5 text-[12px] font-medium text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Nothing extracted
          </span>
        ) : implemented && unplaced.length === 0 && conflicts.length === 0 ? (
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

      {/* THE STUB, STATED PLAINLY. This is the whole reason the panel leads
          with "read" rather than "placed": until the mapping layer lands, read
          and placed are different numbers and the user must not have to guess
          which one they are looking at. */}
      {!implemented && valuesRead > 0 && (
        <div
          className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3"
          data-testid="esg-mapping-not-implemented"
        >
          <p className="text-[13px] font-semibold text-amber-200">
            Read, but not yet written into the workbook
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--esg-text2,#8e8e93)]">
            Your documents were read and are saved to your document library, but the step that
            places ESG values into workbook cells is not built yet — so none of the{" "}
            {valuesRead} value{valuesRead === 1 ? "" : "s"} below has been filled in for you. They
            are listed here so you can enter the ones you need. Nothing has been guessed or
            written on your behalf.
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

      {/* FIGURES THE DOCUMENTS DISAGREE ON. Left blank rather than guessed. */}
      {conflicts.length > 0 && (
        <div className="mt-4" data-testid="esg-value-conflicts">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#d1d1d6]">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            {conflicts.length} figure{conflicts.length === 1 ? "" : "s"} your documents disagree on
          </p>
          <p className="mt-1 text-[11.5px] text-[var(--esg-text2,#8e8e93)]">
            Left blank rather than guessed — pick the right one in the workbook.
          </p>
          <ul className="mt-2 space-y-1.5">
            {conflicts.map((conflict) => (
              <li
                key={`${conflict.sectionId}.${conflict.cellRef}`}
                className="text-[12px] leading-5 text-[#d1d1d6]"
              >
                <span className="text-[var(--esg-text2,#8e8e93)]">{conflict.label}:</span>{" "}
                {conflict.candidates
                  .map(
                    (candidate) =>
                      `${String(candidate.value)} (${candidate.sources.join(", ") || "unknown source"})`,
                  )
                  .join("  vs  ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* THE VALUES THEMSELVES. While the mapping is stubbed this is the only
          way the reading is worth anything to the user, so it is not hidden
          behind a "show more" — it is capped and counted instead. */}
      {unplaced.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#d1d1d6]">
            <FileWarning className="h-4 w-4 text-amber-300" />
            {implemented
              ? "Read, but could not be placed automatically"
              : "Values read from your documents"}
          </p>
          <ul className="mt-2 space-y-1.5" data-testid="esg-unplaced-values">
            {unplaced.slice(0, 12).map((entry, index) => (
              <li
                key={`${entry.documentId}-${entry.field}-${index}`}
                className="flex gap-2 text-[12.5px] leading-5 text-[var(--esg-text2,#8e8e93)]"
              >
                <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-[#8e8e93]" aria-hidden />
                <span className="min-w-0">
                  <span className="text-[#d1d1d6]">{humanizeField(entry.field)}</span>
                  {": "}
                  <span className="tabular-nums">{formatValue(entry.value)}</span>
                  {entry.sourceFile && (
                    <span className="ml-1.5 text-[11px] text-[var(--esg-text3,#636366)]">
                      · {entry.sourceFile}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {unplaced.length > 12 && (
              <li className="text-[11px] text-[var(--esg-text3,#636366)]">
                +{unplaced.length - 12} more, all saved against the documents in your library
              </li>
            )}
          </ul>
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

      {/* Documents that produced nothing. Named, so the user can replace the
          specific file rather than re-uploading everything. */}
      {readNothing.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#d1d1d6]">
            <HelpCircle className="h-4 w-4 text-amber-300" />
            {readNothing.length} document{readNothing.length === 1 ? "" : "s"} we read nothing from
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-[var(--esg-text2,#8e8e93)]">
            {readNothing.slice(0, 6).join(", ")}
            {readNothing.length > 6 ? ` +${readNothing.length - 6} more` : ""}
          </p>
        </div>
      )}

      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-5 text-[var(--esg-text3,#636366)]">
        Everything above is editable in the workbook. A value we could not place is left blank
        rather than guessed — a wrong entry would score as nothing without telling you.
      </p>
    </div>
  );
}

/** Render a parser value without inventing precision it does not have. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  if (Array.isArray(value)) return `${value.length} entries`;
  if (typeof value === "object") return "structured data";
  return String(value);
}

export default EsgExtractionSummary;
