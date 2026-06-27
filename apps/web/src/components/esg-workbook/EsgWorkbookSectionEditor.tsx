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
import { eDataDepotRows, E_DATA_SCOPE_FIELDS } from "./esgSectionConfigs";
import { EsgHeadcountGrid } from "./EsgHeadcountGrid";
import { EsgMaturityGrid } from "./EsgMaturityGrid";
import { EsgSubtabContainer } from "./EsgSubtabContainer";
import { EsgRegisterGrid } from "./EsgRegisterGrid";
import { ESG_PANEL_HEADER, ESG_SAVE_BTN } from "./esgEditorChrome";
import {
  ASSUMPTIONS_FIELDS,
  COVER_FIELDS,
  E_DATA_GHG_SUMMARY_FIELDS,
  E_DATA_NZ_FIELDS,
  EE_MATURITY_ROWS,
  G_DATA_MATURITY_ROWS,
  S_DATA_HS_FIELDS,
  S_DATA_PAYROLL_FIELDS,
  S_DATA_TRAINING_FIELDS,
  WASTE_SCALAR_FIELDS,
  eDataBusinessCarRows,
  eDataGeneratorRows,
  eDataLpgRows,
  eDataSolarRows,
  eDataWasteRows,
  eDataWaterRows,
} from "./esgSectionConfigs";
import { E_DATA_SUBTABS, S_DATA_SUBTABS } from "@/lib/esg/esgSectionRegistry";

const SAVE_DEBOUNCE_MS = 800;

export type EsgWorkbookSectionEditorHandle = { flush: () => Promise<boolean> };

type Props = {
  sectionId: string;
  title?: string;
  autosave?: boolean;
  /** Toolkit inline edit — hide manual save, use inp-tbl chrome */
  toolkitMode?: boolean;
  initialSubtab?: string;
  visibleSubtabs?: string[];
};

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
  function EsgWorkbookSectionEditor(
    { sectionId, title, autosave = true, toolkitMode = false, initialSubtab, visibleSubtabs },
    ref,
  ) {
    if (isEsgGridSection(sectionId)) {
      return (
        <EsgRegisterGrid
          ref={ref}
          sectionId={sectionId}
          title={title}
          autosave={autosave}
          toolkitMode={toolkitMode}
        />
      );
    }
    return (
      <ScalarSectionRouter
        ref={ref}
        sectionId={sectionId}
        title={title}
        autosave={autosave}
        toolkitMode={toolkitMode}
        initialSubtab={initialSubtab}
        visibleSubtabs={visibleSubtabs}
      />
    );
  },
);

const ScalarSectionRouter = forwardRef<EsgWorkbookSectionEditorHandle, Props>(
  function ScalarSectionRouter(
    { sectionId, title, autosave, toolkitMode, initialSubtab, visibleSubtabs },
    ref,
  ) {
    const section = ESG_INPUT_SECTIONS.find((s) => s.id === sectionId);
    const { draft, updateDraft, persist, locked, saving, timerRef } = useSectionDraft(
      sectionId,
      autosave ?? true,
    );
    const [subTab, setSubTab] = useState(initialSubtab ?? "scope-1a");

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
      const activeSub = (draft._activeSubtab as string) || subTab || initialSubtab || "scope-1a";
      // Company-wide reporting collapses each per-depot grid to a single consolidated row.
      const eCompanyWide = String(draft.eScope) === "Company wide";
      const eTab = (id: string, content: ReactNode) => {
        const def = E_DATA_SUBTABS.find((t) => t.id === id);
        return { id, label: def?.label ?? id, content };
      };
      const allTabs = [
        eTab(
          "scope-1a",
          <EsgMonthlyGrid
            rows={eDataDepotRows(eCompanyWide)}
            cellPrefix="s1a"
            emissionFactor={Number(draft.B4 ?? 2.68)}
            unitLabel="L diesel"
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
        eTab(
          "scope-1b",
          <EsgMonthlyGrid
            rows={eDataGeneratorRows(eCompanyWide)}
            cellPrefix="s1b"
            emissionFactor={Number(draft.B4 ?? 2.68)}
            unitLabel="L diesel"
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
        eTab(
          "scope-1c",
          <EsgMonthlyGrid
            rows={eDataLpgRows()}
            cellPrefix="s1c"
            emissionFactor={Number(draft.B6 ?? 1.51)}
            unitLabel="kg"
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
        eTab(
          "scope-1d",
          <EsgMonthlyGrid
            rows={eDataBusinessCarRows()}
            cellPrefix="s1d"
            emissionFactor={Number(draft.B5 ?? 2.31)}
            unitLabel="L petrol"
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
        eTab(
          "scope-2",
          <EsgMonthlyGrid
            rows={eDataDepotRows(eCompanyWide)}
            cellPrefix="s2"
            emissionFactor={Number(draft.B7 ?? 0.82)}
            unitLabel="kWh"
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
        eTab(
          "solar",
          <EsgMonthlyGrid
            rows={eDataSolarRows(eCompanyWide)}
            cellPrefix="solar"
            emissionFactor={Number(draft.B8 ?? 0.025)}
            unitLabel="kWh"
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
        eTab(
          "water",
          <EsgMonthlyGrid
            rows={eDataWaterRows(eCompanyWide)}
            cellPrefix="water"
            emissionFactor={Number(draft.B9 ?? 0.000344) * 1000}
            unitLabel="kL"
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
        eTab(
          "waste",
          <div className="space-y-4">
            <EsgMonthlyGrid
              rows={eDataWasteRows()}
              cellPrefix="waste"
              emissionFactor={0}
              unitLabel="%"
              values={draft}
              onChange={updateDraft}
              readOnly={locked}
            />
            <EsgScalarForm
              fields={WASTE_SCALAR_FIELDS}
              values={draft}
              onChange={updateDraft}
              readOnly={locked}
            />
          </div>,
        ),
        eTab(
          "ghg-summary",
          <div className="space-y-3">
            <p className="text-[12px] text-[var(--esg-text3)]">
              Auto-calculated from scope tabs above. Override only when reconciling to audited totals.
            </p>
            <EsgScalarForm
              fields={E_DATA_GHG_SUMMARY_FIELDS}
              values={draft}
              onChange={updateDraft}
              readOnly={locked}
            />
          </div>,
        ),
        eTab(
          "nz-targets",
          <EsgScalarForm
            fields={E_DATA_NZ_FIELDS}
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
      ];
      const tabs = visibleSubtabs?.length
        ? allTabs.filter((t) => visibleSubtabs.includes(t.id))
        : allTabs;
      body = (
        <div className="space-y-3">
          <EsgScalarForm
            fields={E_DATA_SCOPE_FIELDS}
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />
          {eCompanyWide && (
            <p className="text-[12px] text-[var(--esg-text3)]">
              Company-wide: enter one consolidated figure per source for the whole company instead of per depot.
            </p>
          )}
          <EsgSubtabContainer
            activeTab={tabs.some((t) => t.id === activeSub) ? activeSub : tabs[0]?.id ?? activeSub}
            onTabChange={(id) => {
              setSubTab(id);
              updateDraft({ _activeSubtab: id });
            }}
            tabs={tabs}
          />
        </div>
      );
    } else if (sectionId === "s-data") {
      const activeSub = (draft._activeSubtab as string) || subTab || initialSubtab || "headcount";
      const sTab = (id: string, content: ReactNode) => {
        const def = S_DATA_SUBTABS.find((t) => t.id === id);
        return { id, label: def?.label ?? id, content };
      };
      body = (
        <EsgSubtabContainer
          activeTab={activeSub}
          onTabChange={(id) => {
            setSubTab(id);
            updateDraft({ _activeSubtab: id });
          }}
          tabs={(() => {
            const all = [
              sTab(
                "headcount",
                <EsgHeadcountGrid values={draft} onChange={updateDraft} readOnly={locked} />,
              ),
              sTab(
                "hs",
                <EsgScalarForm
                  fields={S_DATA_HS_FIELDS}
                  values={draft}
                  onChange={updateDraft}
                  readOnly={locked}
                />,
              ),
              sTab(
                "training",
                <EsgScalarForm
                  fields={S_DATA_TRAINING_FIELDS}
                  values={draft}
                  onChange={updateDraft}
                  readOnly={locked}
                />,
              ),
              sTab(
                "payroll",
                <EsgScalarForm
                  fields={S_DATA_PAYROLL_FIELDS}
                  values={draft}
                  onChange={updateDraft}
                  readOnly={locked}
                />,
              ),
            ];
            return visibleSubtabs?.length
              ? all.filter((t) => visibleSubtabs.includes(t.id))
              : all;
          })()}
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
      <div
        className={toolkitMode ? "esg-inp-tbl" : undefined}
        data-testid={`esg-workbook-section-${sectionId}`}
      >
        {!toolkitMode ? header : null}
        <div className={toolkitMode ? "p-3" : "p-5"}>{body}</div>
        {!toolkitMode ? (
          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={() => void persist()}
              disabled={locked || saving === sectionId}
              className={ESG_SAVE_BTN}
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
        ) : null}
      </div>
    );
  },
);
