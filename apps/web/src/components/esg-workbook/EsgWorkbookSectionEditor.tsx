import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2, Save } from "lucide-react";
import { ESG_INPUT_SECTIONS } from "@/lib/esgSections";
import { isEsgGridSection, type EsgGridSectionId } from "@/lib/esgGridSections";
import { useEsgStore } from "../../../EsgToolkit/src/lib/esgStore";
import { EsgScalarForm } from "./EsgScalarForm";
import { EsgMonthlyGrid } from "./EsgMonthlyGrid";
import { eDataDepotRows } from "./esgSectionConfigs";
import { EsgHeadcountGrid } from "./EsgHeadcountGrid";
import { EsgMaturityGrid } from "./EsgMaturityGrid";
import { EsgSubtabContainer } from "./EsgSubtabContainer";
import { EsgRegisterGrid } from "./EsgRegisterGrid";
import { ESG_PANEL_HEADER, ESG_SAVE_BTN } from "./esgEditorChrome";
import {
  ASSUMPTIONS_FIELDS,
  COVER_FIELDS,
  E_DATA_SUMMARY_FIELDS,
  EE_MATURITY_ROWS,
  G_DATA_MATURITY_ROWS,
  S_DATA_SCALAR_FIELDS,
} from "./esgSectionConfigs";

const SAVE_DEBOUNCE_MS = 800;

export type EsgWorkbookSectionEditorHandle = { flush: () => Promise<boolean> };

type Props = { sectionId: string; title?: string; autosave?: boolean };

function useSectionDraft(sectionId: string, autosave: boolean) {
  const { workbook, submittedAt, saving, updateSectionCells, recalculate, markTouched } =
    useEsgStore();
  const [draft, setDraft] = useState<Record<string, string | number | boolean | null>>({});
  const draftRef = useRef(draft);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = Boolean(submittedAt);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    setDraft({ ...(workbook?.sections?.[sectionId]?.cells ?? {}) });
  }, [workbook, sectionId]);

  const persist = useCallback(async () => {
    try {
      await updateSectionCells(sectionId, draftRef.current);
      recalculate();
      return true;
    } catch {
      return false;
    }
  }, [sectionId, updateSectionCells, recalculate]);

  const scheduleSave = useCallback(() => {
    if (!autosave || locked) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist();
    }, SAVE_DEBOUNCE_MS);
  }, [autosave, locked, persist]);

  const updateDraft = (patch: Record<string, string | number | boolean | null>) => {
    Object.keys(patch).forEach((k) => markTouched(sectionId, k));
    setDraft((d) => {
      const next = { ...d, ...patch };
      draftRef.current = next;
      return next;
    });
    scheduleSave();
  };

  return { draft, updateDraft, persist, locked, saving, timerRef, markTouched };
}

export const EsgWorkbookSectionEditor = forwardRef<EsgWorkbookSectionEditorHandle, Props>(
  function EsgWorkbookSectionEditor({ sectionId, title, autosave = true }, ref) {
    if (isEsgGridSection(sectionId)) {
      return <EsgRegisterGrid ref={ref} sectionId={sectionId} title={title} autosave={autosave} />;
    }
    return (
      <ScalarSectionRouter ref={ref} sectionId={sectionId} title={title} autosave={autosave} />
    );
  },
);

const ScalarSectionRouter = forwardRef<EsgWorkbookSectionEditorHandle, Props>(
  function ScalarSectionRouter({ sectionId, title, autosave }, ref) {
    const section = ESG_INPUT_SECTIONS.find((s) => s.id === sectionId);
    const { draft, updateDraft, persist, locked, saving, timerRef } = useSectionDraft(
      sectionId,
      autosave,
    );
    const [subTab, setSubTab] = useState("scope-1a");

    useImperativeHandle(ref, () => ({
      flush: async () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return persist();
      },
    }));

    if (!section) {
      return <p className="text-[13px] text-[var(--esg-text3)]">Unknown section.</p>;
    }

    const header = (
      <header className={ESG_PANEL_HEADER}>
        <h2 className="text-[16px] font-bold text-[var(--esg-text)]">{title ?? section.title}</h2>
        <p className="text-[12px] text-[var(--esg-text2)]">{section.sheet}</p>
      </header>
    );

    let body: ReactNode = null;
    if (sectionId === "company-reporting-setup") {
      body = (
        <EsgScalarForm fields={COVER_FIELDS} values={draft} onChange={updateDraft} readOnly={locked} />
      );
    } else if (sectionId === "assumptions") {
      body = (
        <EsgScalarForm
          fields={ASSUMPTIONS_FIELDS}
          values={draft}
          onChange={updateDraft}
          readOnly={locked}
        />
      );
    } else if (sectionId === "e-data") {
      const activeSub = (draft._activeSubtab as string) || subTab;
      body = (
        <EsgSubtabContainer
          activeTab={activeSub}
          onTabChange={(id) => {
            setSubTab(id);
            updateDraft({ _activeSubtab: id });
          }}
          tabs={[
            {
              id: "scope-1a",
              label: "Scope 1A Fleet",
              content: (
                <EsgMonthlyGrid
                  rows={eDataDepotRows()}
                  cellPrefix="s1a"
                  emissionFactor={Number(draft.B4 ?? 2.68)}
                  unitLabel="L diesel"
                  values={draft}
                  onChange={updateDraft}
                  readOnly={locked}
                />
              ),
            },
            {
              id: "scope-2",
              label: "Scope 2 Electricity",
              content: (
                <EsgMonthlyGrid
                  rows={eDataDepotRows()}
                  cellPrefix="s2"
                  emissionFactor={Number(draft.B7 ?? 0.99)}
                  unitLabel="kWh"
                  values={draft}
                  onChange={updateDraft}
                  readOnly={locked}
                />
              ),
            },
            {
              id: "summary",
              label: "Summary / NZ",
              content: (
                <EsgScalarForm
                  fields={E_DATA_SUMMARY_FIELDS}
                  values={draft}
                  onChange={updateDraft}
                  readOnly={locked}
                />
              ),
            },
          ]}
        />
      );
    } else if (sectionId === "s-data") {
      const activeSub = (draft._activeSubtab as string) || "headcount";
      body = (
        <EsgSubtabContainer
          activeTab={activeSub}
          onTabChange={(id) => updateDraft({ _activeSubtab: id })}
          tabs={[
            {
              id: "headcount",
              label: "EE Headcount",
              content: (
                <EsgHeadcountGrid values={draft} onChange={updateDraft} readOnly={locked} />
              ),
            },
            {
              id: "hs-training",
              label: "H&S / Training / Payroll",
              content: (
                <EsgScalarForm
                  fields={S_DATA_SCALAR_FIELDS}
                  values={draft}
                  onChange={updateDraft}
                  readOnly={locked}
                />
              ),
            },
          ]}
        />
      );
    } else if (sectionId === "g-data") {
      body = (
        <EsgMaturityGrid
          rows={G_DATA_MATURITY_ROWS}
          values={draft}
          onChange={updateDraft}
          readOnly={locked}
        />
      );
    } else if (sectionId === "ee") {
      body = (
        <EsgMaturityGrid
          rows={EE_MATURITY_ROWS}
          values={draft}
          onChange={updateDraft}
          readOnly={locked}
        />
      );
    } else {
      body = (
        <p className="p-5 text-[13px] text-[var(--esg-text2)]">
          Configure fields for {section.sheet} in esgSectionConfigs.
        </p>
      );
    }

    return (
      <div data-testid={`esg-workbook-section-${sectionId}`}>
        {header}
        <div className="p-5">{body}</div>
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={() => void persist()}
            disabled={locked || saving === sectionId}
            className={ESG_SAVE_BTN}
            data-testid={`esg-save-${sectionId}`}
          >
            {saving === sectionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save section
          </button>
        </div>
      </div>
    );
  },
);
