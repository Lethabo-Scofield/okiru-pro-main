import { useMemo, useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import {
  computeEsgCoreValues,
  type EsgCoreValue,
} from "../../../EsgToolkit/src/lib/calculators/coreValues";

/**
 * The core values a client signs off, on one panel (E4), each opening onto its
 * chain: the documents behind it, the inputs they filled, the rule, the result.
 */
export function EsgCoreValuesPanel({ workbook }: { workbook: EsgWorkbookData | null }) {
  const values = useMemo(() => (workbook ? computeEsgCoreValues(workbook) : []), [workbook]);
  const [open, setOpen] = useState<string | null>(null);
  if (values.length === 0) return null;

  return (
    <div className="esg-glass p-5" data-testid="esg-core-values">
      <div className="text-[11px] uppercase tracking-wider text-[var(--esg-text3)] mb-1">Core values</div>
      <p className="text-[12px] text-[var(--esg-text2)] mb-3">
        The figures a client signs off. Open one to follow it from the documents to the result.
      </p>
      <div className="divide-y divide-[var(--esg-glass-border)]">
        {values.map((v) => {
          const isOpen = open === v.id;
          return (
            <div key={v.id}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : v.id)}
                aria-expanded={isOpen}
                aria-controls={`esg-core-chain-${v.id}`}
                className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-white/[0.02]"
                data-testid={`esg-core-${v.id}`}
              >
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-[var(--esg-text3)] transition-transform ${isOpen ? "rotate-90" : ""}`} />
                <span className="flex-1 text-[12.5px] text-[var(--esg-text2)]">{v.label}</span>
                <span className="text-[11px] text-[var(--esg-text3)] hidden sm:inline">{sourceSummary(v)}</span>
                <span className="text-[13px] font-semibold tabular-nums text-[var(--esg-text)] min-w-[96px] text-right">{v.value}</span>
              </button>
              {isOpen ? <Chain value={v} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function sourceSummary(v: EsgCoreValue): string {
  if (v.value === "—") return "No data yet";
  const n = v.sources.length;
  if (n === 0) return "Entered or imported";
  return n === 1 ? "1 document" : `${n} documents`;
}

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <li className="relative pl-7">
    <span className="absolute left-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--esg-glass-border)] text-[10px] text-[var(--esg-text3)]">
      {n}
    </span>
    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--esg-text3)]">{title}</div>
    <div className="mt-1 text-[12px] text-[var(--esg-text2)]">{children}</div>
  </li>
);

/** Documents → inputs → rule → result. */
function Chain({ value: v }: { value: EsgCoreValue }) {
  return (
    <ol id={`esg-core-chain-${v.id}`} className="space-y-3 pb-4 pt-1 pl-6" data-testid={`esg-core-chain-${v.id}`}>
      <Step n={1} title="Documents">
        {v.sources.length > 0 ? (
          <ul className="space-y-1">
            {v.sources.map((s) => (
              <li key={s.documentId || s.sourceFile} className="flex flex-wrap items-center gap-x-2">
                <FileText className="h-3.5 w-3.5 text-[var(--esg-text3)]" />
                <span className="text-[var(--esg-text)]">{s.sourceFile || "A library document"}</span>
                <span className="text-[var(--esg-text3)]">
                  {s.cells} {s.cells === 1 ? "value" : "values"}
                  {s.editedSince > 0 ? ` · ${s.editedSince} edited by hand since` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span>No document is recorded behind these inputs — they were typed in or imported from a workbook.</span>
        )}
      </Step>
      <Step n={2} title="Inputs">
        {v.inputs.length > 0 ? (
          <table className="w-full max-w-[640px] text-[11.5px]">
            <tbody>
              {v.inputs.map((i) => (
                <tr key={`${i.ref}-${i.label}`}>
                  <td className="pr-3 font-mono text-[10.5px] text-[var(--esg-text3)] align-top">{i.ref}</td>
                  <td className="pr-3">{i.label}</td>
                  <td className="text-right tabular-nums text-[var(--esg-text)]">
                    {i.value == null || i.value === ""
                      ? "—"
                      : typeof i.value === "number"
                        ? i.value.toLocaleString("en-ZA", { maximumFractionDigits: 2 })
                        : String(i.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span>None recorded yet.</span>
        )}
      </Step>
      <Step n={3} title="Rule">{v.rule || "—"}</Step>
      <Step n={4} title="Result">
        <span className="text-[13px] font-semibold text-[var(--esg-text)]">{v.value}</span>
        {v.missing ? <span className="block mt-1">Needed for a figure: {v.missing}</span> : null}
      </Step>
    </ol>
  );
}
