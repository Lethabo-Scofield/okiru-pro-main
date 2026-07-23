/**
 * What we read, what we could not place, and what is still missing.
 *
 * All of this already existed and reached nobody: the injector reports every
 * value it could not fit a cell, the bridge reports required columns still
 * empty and parser fields with no mapping, and the parser marks values it could
 * not ground in the source. Extraction that hides its own uncertainty is how a
 * low score becomes a mystery instead of a to-do list.
 *
 * The point of showing it: a low score should read as "you are missing X, add
 * it", not "the tool gave me a bad number". Every line here is actionable.
 *
 * Colour is never the only signal (dataviz rule): each state carries an icon
 * and a word as well as a tint.
 */
import * as React from "react";
import { AlertTriangle, CheckCircle2, FileWarning, HelpCircle } from "lucide-react";
import type { ParserToWorkbookResult } from "@/lib/parserToWorkbook";


interface Props {
  /** The AI-entity injection result, or null when there was none. */
  injected: ParserToWorkbookResult | null;
  /** How many workbook rows the extraction produced, for the headline. */
  rowCount: number;
}

/** Section keys → the names a client would recognise. */
const SECTION_LABELS: Record<string, string> = {
  ownership: "Ownership",
  "management-control": "Management control",
  "skills-development": "Skills development",
  procurement: "Preferential procurement",
  esd: "Enterprise & supplier development",
  sed: "Socio-economic development",
  "financial-information": "Financials",
};

export function ExtractionConfidence({ injected, rowCount }: Props) {
  if (!injected) return null;

  const { rejected, coverage } = injected;
  const gapCount = coverage.gaps.length;
  const rejectedCount = rejected.length;
  const clean = gapCount === 0 && rejectedCount === 0;

  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-[#0e0e10] p-5" data-testid="extraction-confidence">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#636366]">
            What we read from your documents
          </p>
          <h4
            className="mt-2 text-[22px] font-semibold leading-none text-white"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
          >
            {rowCount} value{rowCount === 1 ? "" : "s"} placed
          </h4>
        </div>
        {clean ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#30d158]/[0.12] px-3 py-1.5 text-[12px] font-medium text-[#30d158]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Nothing outstanding
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/[0.12] px-3 py-1.5 text-[12px] font-medium text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> {gapCount + rejectedCount} to review
          </span>
        )}
      </div>

      {/* MISSING REQUIRED FIELDS — the ones that cost points. Named, per section,
          so the client can go and supply the specific thing. */}
      {gapCount > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#d1d1d6]">
            <HelpCircle className="h-4 w-4 text-amber-300" />
            Still needed to score these elements
          </p>
          <ul className="mt-2 space-y-1.5">
            {coverage.gaps.map((gap) => (
              <li key={`${gap.section}.${gap.column}`} className="flex gap-2 text-[12.5px] leading-5 text-[#a1a1a6]">
                <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden />
                <span>
                  <span className="text-[#d1d1d6]">{gap.label}</span>
                  <span className="ml-1.5 text-[11px] text-[#636366]">
                    · {SECTION_LABELS[gap.section] ?? gap.section}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* COULD NOT PLACE — a value was read but does not fit its cell (a race
          outside the dropdown, an unparseable date). Shown with what was read,
          so the user can correct it rather than wonder why a field is blank. */}
      {rejectedCount > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[#d1d1d6]">
            <FileWarning className="h-4 w-4 text-amber-300" />
            Read, but could not be placed automatically
          </p>
          <ul className="mt-2 space-y-1.5">
            {rejected.slice(0, 8).map((r, i) => (
              <li key={`${r.field}-${i}`} className="flex gap-2 text-[12.5px] leading-5 text-[#a1a1a6]">
                <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-[#8e8e93]" aria-hidden />
                <span>
                  {r.detail}
                  {r.sourceFile && <span className="ml-1.5 text-[11px] text-[#636366]">· {r.sourceFile}</span>}
                </span>
              </li>
            ))}
            {rejected.length > 8 && (
              <li className="text-[11px] text-[#636366]">+{rejected.length - 8} more, editable in the workbook</li>
            )}
          </ul>
        </div>
      )}

      {/* Extracted but with no home on the scorecard — evidence an auditor wants
          that no calculator consumes. Reported so it is never mistaken for
          something we missed. */}
      {coverage.unmapped.length > 0 && (
        <p className="mt-4 text-[11.5px] leading-5 text-[#636366]">
          We also read {coverage.unmapped.length} field{coverage.unmapped.length === 1 ? "" : "s"} that
          the scorecard does not use directly (kept for your records, not scored).
        </p>
      )}

      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-5 text-[#636366]">
        Everything above is editable in the workbook. A value we could not place is left blank rather
        than guessed — a wrong entry would score as nothing without telling you.
      </p>
    </div>
  );
}

export default ExtractionConfidence;
