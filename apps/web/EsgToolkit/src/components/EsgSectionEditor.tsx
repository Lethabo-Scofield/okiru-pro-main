import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { ESG_INPUT_SECTIONS, type EsgSectionDef } from "@/lib/esgSections";
import { isEsgGridSection } from "@/lib/esgGridSections";
import { useEsgStore } from "../lib/esgStore";
import { EsgRegisterGridEditor } from "./EsgRegisterGridEditor";

type FieldDef = { cell: string; label: string; type?: "number" | "text" | "select"; options?: string[] };

const SECTION_FIELDS: Record<string, FieldDef[]> = {
  assumptions: [
    { cell: "B9", label: "Stance floor (B9)", type: "number" },
    { cell: "B107", label: "Net-zero target year", type: "number" },
    { cell: "B55", label: "LTIFR threshold", type: "number" },
  ],
  "e-data": [
    { cell: "L19", label: "Fleet diesel YTD (L)", type: "number" },
    { cell: "L46", label: "Electricity kWh YTD", type: "number" },
    { cell: "L63", label: "Water kL YTD", type: "number" },
    { cell: "L75", label: "Scope 1 tCO₂e", type: "number" },
    { cell: "L82", label: "Scope 2 net tCO₂e", type: "number" },
    { cell: "_months_C_K", label: "Months with data (9 target)", type: "number" },
  ],
  "s-data": [
    { cell: "L12", label: "EE headcount (L12)", type: "number" },
    { cell: "G35", label: "LTIFR (G35)", type: "number" },
    { cell: "B45", label: "WSP submitted", type: "select", options: ["Yes", "No", "Partial"] },
    { cell: "B46", label: "ATR submitted", type: "select", options: ["Yes", "No", "Partial"] },
    { cell: "G29", label: "Incidents logged", type: "number" },
    { cell: "C59", label: "Fatigue programme active", type: "number" },
    { cell: "_initiatives_count", label: "Social initiatives count", type: "number" },
  ],
  "g-data": [
    { cell: "F13", label: "S&EC maturity (F13)", type: "number" },
    { cell: "F14", label: "ESG remuneration (F14)", type: "number" },
    { cell: "F15", label: "Code of ethics (F15)", type: "number" },
    { cell: "F16", label: "Whistleblower (F16)", type: "number" },
    { cell: "F17", label: "POPIA IO (F17)", type: "number" },
    { cell: "F18", label: "Cyber risk (F18)", type: "number" },
    { cell: "F19", label: "External assurance (F19)", type: "number" },
    { cell: "F20", label: "Integrated report (F20)", type: "number" },
    { cell: "F21", label: "Legal register (F21)", type: "number" },
    { cell: "F23", label: "Climate in register (F23)", type: "number" },
    { cell: "B25", label: "Regulatory penalties (blank=none)", type: "text" },
  ],
  ee: [
    { cell: "B9", label: "EE Plan submitted", type: "select", options: ["Yes", "Partial", "No"] },
    { cell: "B10", label: "EE forum active", type: "select", options: ["Yes", "Partial", "No"] },
    { cell: "B12", label: "EE targets set", type: "select", options: ["Yes", "Partial", "No"] },
    { cell: "B5", label: "% Black employees", type: "number" },
  ],
};

interface Props {
  sectionId: string;
  title?: string;
}

export function EsgSectionEditor({ sectionId, title }: Props) {
  const section = ESG_INPUT_SECTIONS.find((s) => s.id === sectionId);
  if (isEsgGridSection(sectionId)) {
    return <EsgRegisterGridEditor sectionId={sectionId} title={title ?? section?.title} />;
  }
  return <EsgScalarSectionEditor sectionId={sectionId} title={title} section={section} />;
}

function EsgScalarSectionEditor({
  sectionId,
  title,
  section,
}: Props & { section: EsgSectionDef | undefined }) {
  const { workbook, submittedAt, saving, updateSectionCells, recalculate } = useEsgStore();
  const [draft, setDraft] = useState<Record<string, string | number | boolean | null>>({});
  const locked = Boolean(submittedAt);

  useEffect(() => {
    const cells = workbook?.sections?.[sectionId]?.cells ?? {};
    setDraft({ ...cells });
  }, [workbook, sectionId]);

  const fields = SECTION_FIELDS[sectionId] ?? [];

  const save = useCallback(async () => {
    await updateSectionCells(sectionId, draft);
    recalculate();
  }, [draft, sectionId, updateSectionCells, recalculate]);

  if (!section) {
    return <p className="text-[13px] text-[var(--esg-text3)]">Unknown section.</p>;
  }

  return (
    <div className="space-y-4" data-testid={`esg-section-editor-${sectionId}`}>
      <header>
        <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">
          {title ?? section.title}
        </h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">
          {section.sheet}
          {section.note ? ` · ${section.note}` : ""}
        </p>
      </header>

      {fields.length === 0 ? (
        <div className="esg-glass p-5 text-[13px] text-[var(--esg-text2)]">
          No scalar fields configured for {section.sheet}.
        </div>
      ) : (
        <div className="esg-glass p-5 grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.cell} className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--esg-text3)]">
                {f.label}
              </span>
              {f.type === "select" ? (
                <select
                  value={String(draft[f.cell] ?? "")}
                  disabled={locked}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.cell]: e.target.value }))}
                  className="mt-1 w-full bg-black/30 border border-[var(--esg-glass-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--esg-text)]"
                >
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  value={draft[f.cell] ?? ""}
                  disabled={locked}
                  onChange={(e) => {
                    const v =
                      f.type === "number"
                        ? e.target.value === ""
                          ? null
                          : Number(e.target.value)
                        : e.target.value;
                    setDraft((d) => ({ ...d, [f.cell]: v }));
                  }}
                  className="mt-1 w-full bg-black/30 border border-[var(--esg-glass-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--esg-text)]"
                />
              )}
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={locked || saving === sectionId}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[13px] disabled:opacity-50"
          data-testid={`esg-save-${sectionId}`}
        >
          {saving === sectionId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save section
        </button>
      </div>
    </div>
  );
}

export function sectionDefForPath(path: string): EsgSectionDef | undefined {
  const norm = path.replace(/\/$/, "") || "/";
  if (norm === "/ghg") return ESG_INPUT_SECTIONS.find((s) => s.id === "e-data");
  return ESG_INPUT_SECTIONS.find((s) => s.toolkitPath === norm);
}
