/**
 * The values the AI model and the agent read from one document — rows of the
 * library page's one "What we read from it" list.
 *
 * The list used to be split in two by WHICH internal reader found a value
 * ("Extracted fields · read by the rules" and "Read by AI · N by the agent"),
 * with a reader badge, a confidence percentage and the document's own name on
 * every row. A person checking a document cares about the value, so a row is
 * now: the label, the value (click to correct it), a note when it was
 * corrected or could not be found word for word, and "Show in document". Who
 * read it, how sure we were, the raw text and the quote sit behind the row's
 * own "How we read this".
 *
 * Each scalar value can still be corrected in place, filed as a review event
 * under the value's own key (`ai.<spec>.<field>`), so the reader's own value
 * stays on record beside the correction.
 */
import type { ReactNode } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { EditableValue } from "@/components/review/EditableValue";
import {
  VALUE_LAYER_PRESENTATION,
  citationLabel,
  fieldLabel,
  formatParserValue,
  sheetOfSource,
  type ParserAiValue,
  type ParserValueLayer,
} from "@/lib/parserDocuments";

export function LayerBadge({ layer }: { layer: ParserValueLayer }) {
  const presentation = VALUE_LAYER_PRESENTATION[layer] ?? VALUE_LAYER_PRESENTATION.ai;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide ${presentation.tone}`}
      title={presentation.title}
      data-testid={`layer-${layer}`}
    >
      {presentation.label}
    </span>
  );
}

/** Which reader found a value, in words a customer uses. */
export const READER_WORDS: Record<ParserValueLayer, string> = {
  rule: "Found in the text",
  ai: "Read by AI",
  agent: "Double-checked by AI",
  derived: "Worked out from figures in the document",
};

/** A confidence score as a word. Null: this reader does not score confidence. */
export function confidenceWord(confidence: number | null | undefined): string {
  if (confidence == null || Number.isNaN(Number(confidence))) return "Not scored";
  const value = Number(confidence);
  return value >= 0.85 ? "High" : value >= 0.6 ? "Medium" : "Low";
}

/**
 * "How we read this" — the reader, how sure we were, and the words a value was
 * read from. Closed by default: it answers "why?", not "what?".
 */
export function HowWeRead({ testId, children }: { testId?: string; children: ReactNode }) {
  return (
    <details className="group mt-1.5" data-testid={testId}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-[11px] text-[color:var(--body)] transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3 w-3 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
        How we read this
      </summary>
      <div className="mt-1.5 space-y-1 border-l border-[color:var(--rule-strong)] pl-3 text-[11px] leading-5 text-[color:var(--body)]">{children}</div>
    </details>
  );
}

/** The first rows of a register, as a table — read-only: a register is not corrected one line at a time here. */
function RowsPreview({ rows, rowCount, testId }: { rows: unknown[]; rowCount?: number; testId: string }) {
  const objects = rows.filter((row): row is Record<string, unknown> => row !== null && typeof row === "object" && !Array.isArray(row));
  const columns = Array.from(new Set(objects.flatMap((row) => Object.keys(row)).filter((key) => !key.startsWith("__")))).slice(0, 6);
  const total = rowCount ?? rows.length;
  return (
    <div data-testid={testId}>
      <p className="text-[13px] text-white">{total.toLocaleString("en-ZA")} row{total === 1 ? "" : "s"}</p>
      {columns.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-[color:var(--body)]">Show the first rows</summary>
          <div className="mt-2 max-w-full overflow-x-auto">
            <table className="w-max border-collapse text-[11px]">
              <thead>
                <tr>{columns.map((column) => <th key={column} className="px-2 py-1 text-left font-medium text-[color:var(--body)]">{fieldLabel(column)}</th>)}</tr>
              </thead>
              <tbody>
                {objects.slice(0, 5).map((row, index) => (
                  <tr key={index} className="border-t border-white/[0.05]">
                    {columns.map((column) => <td key={column} className="max-w-[180px] truncate px-2 py-1 text-[color:var(--body)]">{formatParserValue(row[column])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > Math.min(5, objects.length) && (
            <p className="mt-1 text-[10.5px] text-[color:var(--body)]">
              {rowCount && rowCount > rows.length
                ? `The library keeps the first ${rows.length.toLocaleString("en-ZA")} of ${rowCount.toLocaleString("en-ZA")} rows; the case holds them all.`
                : `Showing 5 of ${total.toLocaleString("en-ZA")}.`}
            </p>
          )}
        </details>
      ) : (
        <p className="mt-1 text-[11px] text-[color:var(--body)]">{formatParserValue(rows)}</p>
      )}
    </div>
  );
}

export interface AiValuesSectionProps {
  values: ParserAiValue[];
  /** Corrections from the run's review history, by key; the latest word wins. */
  corrections: Map<string, { value: unknown; original: unknown }>;
  /** Save a person's correction under the value's key. Throws to keep the editor open. */
  onSave: (key: string, value: string) => Promise<void>;
  /** Bring the place a value was read from into the preview. */
  onShow?: (value: ParserAiValue) => void;
  disabled?: boolean;
  /** A field's name — the ESG rule ("Electricity kWh") on an ESG document. */
  labelOf?: (field: string) => string;
  /** How a value reads ("14 820", "31 Jul 2025"); the editor still starts from the stored value. */
  displayOf?: (value: unknown, field: string) => string;
}

export function AiValuesSection({ values, corrections, onSave, onShow, disabled = false, labelOf = fieldLabel, displayOf }: AiValuesSectionProps) {
  return (
    <div data-testid="ai-values" role="group" aria-label="Values read by AI">
      {values.map((value) => {
        const fix = corrections.get(value.key);
        const isRows = Array.isArray(value.value);
        const citation = citationLabel(value);
        const canShow = Boolean(onShow) && (value.page != null || sheetOfSource(value.sourceFile) != null);
        return (
          <div
            key={value.key}
            className="grid gap-1 border-b border-[color:var(--rule)] py-3.5 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-3"
            data-testid={`ai-value-row-${value.key}`}
          >
            <div className="min-w-0 text-[12px] text-[color:var(--body)]">{labelOf(value.field)}</div>
            <div className="min-w-0">
              {isRows && !fix ? (
                <RowsPreview rows={value.value as unknown[]} rowCount={value.rowCount} testId={`ai-value-${value.key}-rows`} />
              ) : (
                <div className="text-[13px] text-white">
                  <EditableValue
                    value={formatParserValue(fix ? fix.value : value.value)}
                    display={displayOf ? displayOf(fix ? fix.value : value.value, value.field) : undefined}
                    label={labelOf(value.field)}
                    onSave={(next) => onSave(value.key, next)}
                    testId={`field-${value.key}`}
                    disabled={disabled}
                  />
                </div>
              )}
              {fix && (
                <p className="mt-1 text-[11px] text-[color:var(--body)]" data-testid={`field-${value.key}-corrected`}>
                  Corrected by your team. Originally {value.layer === "derived" ? "worked out" : "read"} as “{formatParserValue(fix.original ?? value.value)}”
                </p>
              )}
              {value.grounded === false && !fix && (
                <p className="mt-1 text-[11px] text-amber-300" data-testid={`ai-value-${value.key}-ungrounded`}>
                  Not found word for word in the document. Check it.
                </p>
              )}
              {canShow && (
                <button
                  type="button"
                  onClick={() => onShow?.(value)}
                  className="mt-1 inline-flex items-center gap-1 rounded px-0.5 text-[11px] text-[color:var(--hi)] underline-offset-2 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  data-testid={`ai-value-${value.key}-show`}
                >
                  <MapPin className="h-3 w-3" aria-hidden /> Show in document
                </button>
              )}
              <HowWeRead testId={`ai-value-${value.key}-how`}>
                <p className="flex flex-wrap items-center gap-1.5">
                  {READER_WORDS[value.layer] ?? READER_WORDS.ai} <LayerBadge layer={value.layer} />
                </p>
                <p>How sure we are: {fix ? "Checked by your team" : confidenceWord(value.confidence)}</p>
                {(citation || value.sourceFile) && (
                  <p data-testid={`ai-value-${value.key}-citation`}>Where: {citation ?? value.sourceFile}</p>
                )}
                {value.quote && (
                  <p className="italic" data-testid={`ai-value-${value.key}-quote`}>
                    “{value.quote}”
                  </p>
                )}
              </HowWeRead>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AiValuesSection;
