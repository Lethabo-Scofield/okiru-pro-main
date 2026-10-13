import { useEffect, useState } from "react";
import { ESG_INPUT, ESG_PANEL, ESG_SELECT } from "./esgEditorChrome";
import {
  ESG_AXIS_CELLS,
  ESG_COMPANY_WIDE_SCOPE,
  ESG_MAX_REPORTING_MONTHS,
  buildEsgReportingMonths,
  esgAxisCells,
  esgReportingMonthOptions,
  esgWorkbookAxes,
  parseEsgSites,
  type EsgReportingAxes,
} from "./esgDefaults";
import { remapEsgMonthlyCells } from "@/lib/esg/esgCaseAxes";

type Cells = Record<string, string | number | boolean | null>;

type Props = {
  values: Cells;
  onChange: (patch: Cells) => void;
  readOnly?: boolean;
};

const PER_SITE_SCOPE = "Per site / depot";
const MONTH_COUNTS = Array.from({ length: ESG_MAX_REPORTING_MONTHS }, (_, i) => String(i + 1));

/**
 * The workbook's own reporting axes: per site or company wide, which sites,
 * and which months. Every monthly grid is laid out on them.
 *
 * Changing them MOVES the figures already entered — each stays with its site
 * and its month — and a change that would leave a figure with nowhere to go is
 * refused with the reason, never applied by dropping it.
 */
export function EsgReportingAxesForm({ values, onChange, readOnly }: Props) {
  const axes = esgWorkbookAxes(values);
  const listed = axes.depots.join(", ");
  const [sitesText, setSitesText] = useState(listed);
  const [refusal, setRefusal] = useState<string | null>(null);
  useEffect(() => setSitesText(listed), [listed]);

  const apply = (next: EsgReportingAxes): void => {
    const moved = remapEsgMonthlyCells(values, axes, next);
    if (moved.lost.length > 0) {
      setRefusal(
        `Not changed: ${moved.lost.join(", ")} would have nowhere to go. Clear ${moved.lost.length === 1 ? "it" : "them"} first, or keep ${moved.lost.length === 1 ? "that site or month" : "those sites and months"}.`,
      );
      setSitesText(listed);
      return;
    }
    setRefusal(null);
    onChange({
      ...esgAxisCells(next),
      [ESG_AXIS_CELLS.scope]: next.companyWide ? ESG_COMPANY_WIDE_SCOPE : PER_SITE_SCOPE,
      ...moved.patch,
    });
  };

  const applySites = (): void => {
    const sites = parseEsgSites(sitesText);
    if (sites.join(", ") === listed) return;
    if (sites.length === 0) {
      setRefusal("List at least one site, or choose “Company wide”.");
      setSitesText(listed);
      return;
    }
    apply({ ...axes, depots: sites });
  };

  const firstMonth = axes.months[0] ?? "";
  const monthOptions = esgReportingMonthOptions();
  if (firstMonth && !monthOptions.includes(firstMonth)) monthOptions.unshift(firstMonth);
  const lastMonth = axes.months[axes.months.length - 1] ?? "";

  return (
    <div className={`${ESG_PANEL} p-5 space-y-4`} data-testid="esg-reporting-axes">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block" data-testid="esg-field-eScope">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--esg-text3)]">
            Environmental data scope
          </span>
          <select
            value={axes.companyWide ? ESG_COMPANY_WIDE_SCOPE : PER_SITE_SCOPE}
            disabled={readOnly}
            onChange={(e) => apply({ ...axes, companyWide: e.target.value === ESG_COMPANY_WIDE_SCOPE })}
            className={`mt-1 ${ESG_SELECT}`}
          >
            <option value={PER_SITE_SCOPE}>{PER_SITE_SCOPE}</option>
            <option value={ESG_COMPANY_WIDE_SCOPE}>{ESG_COMPANY_WIDE_SCOPE}</option>
          </select>
        </label>
        <label className="block" data-testid="esg-field-eFirstMonth">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--esg-text3)]">
            First reporting month
          </span>
          <select
            value={firstMonth}
            disabled={readOnly}
            onChange={(e) => apply({ ...axes, months: buildEsgReportingMonths(e.target.value, axes.months.length) })}
            className={`mt-1 ${ESG_SELECT}`}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block" data-testid="esg-field-eMonthCount">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--esg-text3)]">
            Months reported
          </span>
          <select
            value={String(axes.months.length)}
            disabled={readOnly}
            onChange={(e) => apply({ ...axes, months: buildEsgReportingMonths(firstMonth, Number(e.target.value)) })}
            className={`mt-1 ${ESG_SELECT}`}
          >
            {MONTH_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block" data-testid="esg-field-eSites">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--esg-text3)]">Sites</span>
        <p className="text-[11px] text-[var(--esg-text2)] mt-0.5 leading-snug">
          Separated by commas — one row each in every per-site grid. Figures already entered move with their
          site when you reorder or rename one.
        </p>
        <input
          type="text"
          value={sitesText}
          disabled={readOnly || axes.companyWide}
          onChange={(e) => setSitesText(e.target.value)}
          onBlur={applySites}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applySites();
            }
          }}
          className={`mt-1 ${ESG_INPUT}`}
        />
      </label>
      <p className="text-[12px] text-[var(--esg-text3)]" data-testid="esg-axes-summary">
        {axes.companyWide
          ? "Company wide: one consolidated row per source for the whole company."
          : `${axes.depots.length} site${axes.depots.length === 1 ? "" : "s"}`}
        {firstMonth ? ` · ${firstMonth} to ${lastMonth} (${axes.months.length} months)` : ""}
      </p>
      {refusal ? (
        <p role="alert" className="text-[12px] text-amber-300" data-testid="esg-axes-refusal">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
