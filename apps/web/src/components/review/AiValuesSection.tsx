/**
 * What the AI model and the agent read from one document — the part of a read
 * the library used to throw away.
 *
 * The document library stored only the rule layer of each read (the lexical
 * classifier and its regex fields), a few percent of what the parser had read.
 * Each run now carries the model's and the agent's values too, inside the
 * parser's signed record. This shows them the way the rule-layer fields are
 * shown: what was read, which reader read it, where in the document, and the
 * words it was read from — and each scalar value can be corrected in place,
 * filed as a review event under the value's own key (`ai.<spec>.<field>`), so
 * the reader's own value stays on record beside the correction.
 */
import { MapPin } from "lucide-react";
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
          <summary className="cursor-pointer text-[11px] text-[color:var(--muted)]">Show the first rows</summary>
          <div className="mt-2 max-w-full overflow-x-auto">
            <table className="w-max border-collapse text-[11px]">
              <thead>
                <tr>{columns.map((column) => <th key={column} className="px-2 py-1 text-left font-medium text-[color:var(--muted)]">{fieldLabel(column)}</th>)}</tr>
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
            <p className="mt-1 text-[10.5px] text-[color:var(--muted)]">
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
}

export function AiValuesSection({ values, corrections, onSave, onShow, disabled = false }: AiValuesSectionProps) {
  const byAgent = values.filter((value) => value.layer === "agent").length;
  const checked = values.filter((value) => corrections.has(value.key)).length;
  return (
    <section data-testid="ai-values">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-white">Read by AI</h2>
        <span className="text-[11px] text-[color:var(--muted)]">
          {values.length} read{byAgent > 0 ? ` · ${byAgent} by the agent` : ""}{checked > 0 ? ` · ${checked} checked by your team` : ""}
        </span>
      </div>
      <p className="mb-3 text-[11.5px] text-[color:var(--body)]">
        What the AI model and the agent read from this document, with where each value was found. Click one to correct it.
      </p>
      <div className="divide-y divide-[color:var(--rule)] border-y border-[color:var(--rule)]">
        {values.map((value) => {
          const fix = corrections.get(value.key);
          const isRows = Array.isArray(value.value);
          const citation = citationLabel(value);
          const canShow = Boolean(onShow) && (value.page != null || sheetOfSource(value.sourceFile) != null);
          return (
            <div key={value.key} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr_80px]" data-testid={`ai-value-row-${value.key}`}>
              <div className="min-w-0 text-[12px] text-[color:var(--body)]">
                {fieldLabel(value.field)}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <LayerBadge layer={value.layer} />
                  <span className="truncate text-[10.5px] text-[color:var(--muted)]" title={value.documentName}>{value.documentName}</span>
                </div>
              </div>
              <div className="min-w-0">
                {isRows && !fix ? (
                  <RowsPreview rows={value.value as unknown[]} rowCount={value.rowCount} testId={`ai-value-${value.key}-rows`} />
                ) : (
                  <div className="text-[13px] text-white">
                    <EditableValue
                      value={formatParserValue(fix ? fix.value : value.value)}
                      label={fieldLabel(value.field)}
                      onSave={(next) => onSave(value.key, next)}
                      testId={`field-${value.key}`}
                      disabled={disabled}
                    />
                  </div>
                )}
                {fix && (
                  <p className="mt-1 text-[11px] text-violet-200/80" data-testid={`field-${value.key}-corrected`}>
                    Corrected by your team — the {value.layer === "agent" ? "agent" : "AI"} read “{formatParserValue(fix.original ?? value.value)}”
                  </p>
                )}
                {value.grounded === false && !fix && (
                  <p className="mt-1 text-[11px] text-amber-300" data-testid={`ai-value-${value.key}-ungrounded`}>
                    Not found word for word in the document’s text — check it against the document.
                  </p>
                )}
                {(citation || value.quote || value.sourceFile) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-[color:var(--muted)]" data-testid={`ai-value-${value.key}-citation`}>
                    <span>{citation ?? value.sourceFile}</span>
                    {canShow && (
                      <button
                        type="button"
                        onClick={() => onShow?.(value)}
                        className="inline-flex items-center gap-1 rounded px-1 text-[#5e9bff] hover:underline"
                        data-testid={`ai-value-${value.key}-show`}
                      >
                        <MapPin className="h-3 w-3" /> Show in document
                      </button>
                    )}
                  </div>
                )}
                {value.quote && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[11px] text-[color:var(--muted)]">View source</summary>
                    <p className="mt-2 border-l border-[color:var(--rule-strong)] pl-3 text-[11px] leading-5 text-[color:var(--body)]" data-testid={`ai-value-${value.key}-quote`}>
                      {value.quote}
                    </p>
                  </details>
                )}
              </div>
              <div className={`text-right text-[12px] tabular-nums ${fix ? "text-violet-200" : value.confidence == null ? "text-[color:var(--muted)]" : value.confidence >= 0.85 ? "text-emerald-300" : "text-amber-300"}`}>
                {fix ? "Checked" : value.confidence == null ? <span title="This reader does not score confidence">—</span> : `${Math.round(value.confidence * 100)}%`}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default AiValuesSection;
