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
  E_DATA_ENERGY_BASELINE_FIELDS,
  E_DATA_GHG_SUMMARY_FIELDS,
  E_DATA_NZ_FIELDS,
  E_DATA_WATER_INITIATIVE_FIELDS,
  EE_MATURITY_ROWS,
  G_DATA_MATURITY_ROWS,
  S_DATA_HEADCOUNT_FIELDS,
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
import { getEsgSectorConfig } from "../../../EsgToolkit/src/lib/esgConfig";
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

/**
 * Emission factors for the tonnes-of-CO₂e preview beside each monthly grid.
 *
 * These used to be six literals typed into the JSX (2.68 / 2.31 / 1.51 / 0.82 /
 * 0.025 / 0.000344), duplicating the sector configuration. They now come from the
 * sector registry, so a sector that publishes its own factor changes the preview
 * without anyone editing this component.
 *
 * Precedence is unchanged: a factor carried on the workbook itself (the emission
 * factor block at the top of the environmental data sheet) still wins, because a
 * real client workbook may have been prepared against a different grid factor
 * vintage. The sector configuration is the fallback, never the override.
 *
 * NB the water factor is published in TONNES per kilolitre while the grid's preview
 * divides by 1,000 like the kilogram factors, hence the ×1000 at the call site.
 */
function emissionFactors(sector: string | null | undefined) {
  const ef = getEsgSectorConfig(sector).emissionFactors;
  return {
    diesel: ef.dieselScope1,
    petrol: ef.petrolBusinessCars,
    lpg: ef.lpg,
    electricity: ef.electricityScope2,
    solar: ef.solarOnsite,
    waterPerKl: ef.waterTco2ePerKl,
  };
}

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

  return { draft, updateDraft, persist, locked, saving, timerRef, markTouched, workbook };
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
    const { draft, updateDraft, persist, locked, saving, timerRef, workbook } = useSectionDraft(
      sectionId,
      autosave ?? true,
    );
    const [subTab, setSubTab] = useState(initialSubtab ?? "scope-1a");
    // The reporting sector is captured on the setup screen; the assumptions sheet
    // mirrors it. Either is enough to pick the sector's emission factors.
    const ef = emissionFactors(
      (workbook?.sections?.["company-reporting-setup"]?.cells?.sector as string | undefined) ??
        (workbook?.sections?.assumptions?.cells?.B10 as string | undefined),
    );

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
        {section.note ? (
          <p className="text-[12px] text-[var(--esg-text2)]">{section.note}</p>
        ) : null}
      </header>
    );

    let body: ReactNode = null;
    if (sectionId === "company-reporting-setup") {
      // Where the sector is CHOSEN is where its calibration must be said.
      // 13 of the 14 sector configs inherit the shared base — real scoring,
      // but thresholds nobody has signed off for that industry (the config's
      // own `notes` name exactly what is outstanding). Choosing one silently
      // was the MAC problem again: a number nobody flagged is a number
      // someone will publish. The notice reads from the registry, so it
      // disappears for a sector the day its calibration is signed off.
      const chosenSector =
        (draft.sector as string | undefined) ??
        (workbook?.sections?.["company-reporting-setup"]?.cells?.sector as string | undefined);
      const sectorConfig = chosenSector ? getEsgSectorConfig(chosenSector) : null;
      body = (
        <div className="space-y-3">
          <EsgScalarForm fields={COVER_FIELDS} values={draft} onChange={updateDraft} readOnly={locked} />
          {sectorConfig && sectorConfig.calibration !== "workbook-verified" ? (
            <div
              className="rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[12px] leading-5 text-[var(--esg-text2)]"
              data-testid="esg-sector-calibration-note"
            >
              <strong className="text-[var(--esg-text)]">
                {sectorConfig.label} uses the shared baseline, not signed-off sector thresholds.
              </strong>{" "}
              Scores compute in full, but treat sector comparisons as indicative until the
              thresholds below are calibrated for this industry.
              {sectorConfig.notes ? <> {sectorConfig.notes}</> : null}
            </div>
          ) : null}
        </div>
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
            emissionFactor={Number(draft.B4 ?? ef.diesel)}
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
            emissionFactor={Number(draft.B4 ?? ef.diesel)}
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
            emissionFactor={Number(draft.B6 ?? ef.lpg)}
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
            emissionFactor={Number(draft.B5 ?? ef.petrol)}
            unitLabel="L petrol"
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
        eTab(
          "scope-2",
          // The prior-year total sits with the electricity it is compared against.
          // Ledger section 5.1, energy efficiency year on year: the indicator has
          // never been able to score because no baseline was ever collected.
          <div className="space-y-4">
            <EsgMonthlyGrid
              rows={eDataDepotRows(eCompanyWide)}
              cellPrefix="s2"
              emissionFactor={Number(draft.B7 ?? ef.electricity)}
              unitLabel="kWh"
              values={draft}
              onChange={updateDraft}
              readOnly={locked}
            />
            <EsgScalarForm
              fields={E_DATA_ENERGY_BASELINE_FIELDS}
              values={draft}
              onChange={updateDraft}
              readOnly={locked}
            />
          </div>,
        ),
        eTab(
          "solar",
          <EsgMonthlyGrid
            rows={eDataSolarRows(eCompanyWide)}
            cellPrefix="solar"
            emissionFactor={Number(draft.B8 ?? ef.solar)}
            unitLabel="kWh"
            values={draft}
            onChange={updateDraft}
            readOnly={locked}
          />,
        ),
        eTab(
          "water",
          // Ledger section 5.1, water efficiency initiative: the indicator carries a
          // literal zero and no formula because the flag was never collected anywhere.
          <div className="space-y-4">
            <EsgMonthlyGrid
              rows={eDataWaterRows(eCompanyWide)}
              cellPrefix="water"
              emissionFactor={Number(draft.B9 ?? ef.waterPerKl) * 1000}
              unitLabel="kL"
              values={draft}
              onChange={updateDraft}
              readOnly={locked}
            />
            <EsgScalarForm
              fields={E_DATA_WATER_INITIATIVE_FIELDS}
              values={draft}
              onChange={updateDraft}
              readOnly={locked}
            />
          </div>,
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
            {/*
              This claim is now true of every field below. Each one is calculated
              from the scope tabs when the workbook is saved, and the calculation
              only fills a blank — a figure you type always wins. Verified field by
              field before this copy was kept; re-verify before changing it.
            */}
            <p className="text-[12px] text-[var(--esg-text3)]">
              Calculated from the scope tabs above. Override only when reconciling to audited
              totals — anything you type here is kept.
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
                // Ledger section 5.3, employees with disabilities: the percentage the
                // scorecard reads is a constant zero in the source workbook, so the
                // indicator could never score. The headcount is the honest input; the
                // percentage is worked out from it and the workforce total.
                <div className="space-y-4">
                  <EsgHeadcountGrid values={draft} onChange={updateDraft} readOnly={locked} />
                  <EsgScalarForm
                    fields={S_DATA_HEADCOUNT_FIELDS}
                    values={draft}
                    onChange={updateDraft}
                    readOnly={locked}
                  />
                </div>,
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
          There are no capture fields for {section.title} yet. Use Import / bulk upload to bring this
          data in, or contact Okiru support if you expect fields here.
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
