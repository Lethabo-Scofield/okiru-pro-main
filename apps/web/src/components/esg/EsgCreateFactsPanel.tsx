/**
 * The facts the workbook is created on — reporting year, sites, boundary,
 * baseline — proposed from the documents, confirmed here.
 *
 * Every figure placed from the documents lands in a site's row and a month's
 * column, so these two lists decide where all of them go. They used to be
 * worked out silently: two years of dashboards made a 24-month "year", and a
 * company's own name became a site that swallowed two depots' figures. Now the
 * proposal is shown with what it came from, and changing it re-places the
 * figures before anything is created.
 */
import { useEffect, useMemo, useState } from "react";
import { buildEsgReportingMonths, esgReportingMonthOptions, parseEsgSites } from "@/components/esg-workbook/esgDefaults";
import type { EsgPriorYear } from "@/lib/esg/esgParserToWorkbook";
import { ESG_BOUNDARY_OPTIONS, esgPeriodLabel, type EsgCreateProposal } from "./esgCreateFacts";

const LABEL = "block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3,rgba(255,255,255,0.32))]";
const NOTE = "mt-1.5 text-[12px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]";
const FIELD =
  "mt-2 w-full rounded-xl border border-[var(--esg-glass-border,rgba(255,255,255,0.07))] bg-[color:var(--ink)]/30 px-4 py-2.5 text-[14px] text-[var(--esg-text,#fff)] outline-none focus:border-[var(--esg-acc-e,#1de9a0)]/40";

const number = (value: number) => new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 2 }).format(value);

export interface EsgCreateFactsPanelProps {
  proposal: EsgCreateProposal;
  /** The reporting year the figures are placed on now. */
  months: string[];
  onMonthsChange: (months: string[]) => void;
  /** The sites the figures are placed on now. */
  sites: string[];
  onSitesChange: (sites: string[]) => void;
  /** Months of the year that hold a figure. */
  monthsWithFigures?: number;
  boundary: string;
  onBoundaryChange: (boundary: string) => void;
  priorYear?: EsgPriorYear | null;
  /** What taking last year's figures as the baseline would write. */
  baseline: { B90?: number; B92?: number };
  useBaseline: boolean;
  onUseBaselineChange: (use: boolean) => void;
}

export function EsgCreateFactsPanel({
  proposal,
  months,
  onMonthsChange,
  sites,
  onSitesChange,
  monthsWithFigures,
  boundary,
  onBoundaryChange,
  priorYear,
  baseline,
  useBaseline,
  onUseBaselineChange,
}: EsgCreateFactsPanelProps) {
  const [siteText, setSiteText] = useState(sites.join("\n"));
  useEffect(() => setSiteText(sites.join("\n")), [sites]);

  const startOptions = useMemo(() => {
    const options = new Set<string>(esgReportingMonthOptions());
    for (const start of [proposal.year?.months[0], ...(proposal.year?.otherYears ?? []).map((y) => y.months[0]), months[0]]) {
      if (start) options.add(start);
    }
    return Array.from(options);
  }, [proposal, months]);

  const proposed = proposal.year;
  const changedYear = Boolean(proposed && months[0] !== proposed.months[0]);
  const yearNote = !proposed
    ? "No document states a date, so choose the year your figures are for."
    : changedYear
      ? `You changed this. Your documents state ${esgPeriodLabel(proposed.months)}.`
      : proposed.basis === "stated"
        ? `Stated by ${proposed.statedBy.length} document${proposed.statedBy.length === 1 ? "" : "s"}: ${proposed.statedBy.slice(0, 3).join(", ")}${proposed.statedBy.length > 3 ? "…" : ""}.`
        : "No document states the year, so this is the year your newest figures fall in. Check it.";
  const others = (proposed?.otherYears ?? []).filter((y) => y.months[0] !== months[0]);

  return (
    <div
      className="mt-4 rounded-[20px] border border-[var(--esg-glass-border,rgba(255,255,255,0.07))] bg-[var(--esg-section-bg,#141416)] p-5"
      data-testid="esg-review-facts"
    >
      <div data-testid="esg-review-year">
        <label htmlFor="esg-review-year-start" className={LABEL}>
          Reporting year
        </label>
        <select
          id="esg-review-year-start"
          value={months[0] ?? ""}
          onChange={(event) => onMonthsChange(buildEsgReportingMonths(event.target.value, 12))}
          className={FIELD}
          data-testid="esg-review-year-select"
        >
          {months.length === 0 ? <option value="">Choose the first month</option> : null}
          {startOptions.map((start) => (
            <option key={start} value={start}>
              {esgPeriodLabel(buildEsgReportingMonths(start, 12))}
            </option>
          ))}
        </select>
        <p className={NOTE} data-testid="esg-review-year-source">
          {yearNote}
          {monthsWithFigures ? ` ${monthsWithFigures} of its months have figures.` : ""}
        </p>
        {others.length > 0 ? (
          <p className={NOTE} data-testid="esg-review-year-others">
            {others
              .map((y) => `${y.statedBy.join(", ")} ${y.statedBy.length === 1 ? "is" : "are"} for ${esgPeriodLabel(y.months)}`)
              .join("; ")}
            . Figures outside the reporting year are not added to it.
          </p>
        ) : null}
      </div>

      <div className="mt-5" data-testid="esg-review-sites">
        <label htmlFor="esg-review-sites-input" className={LABEL}>
          Sites
        </label>
        <textarea
          id="esg-review-sites-input"
          value={siteText}
          rows={Math.min(Math.max(siteText.split("\n").length, 2), 8)}
          onChange={(event) => setSiteText(event.target.value)}
          onBlur={() => {
            const next = parseEsgSites(siteText);
            if (next.join("\n") !== sites.join("\n")) onSitesChange(next);
          }}
          placeholder="One site per line"
          className={FIELD}
          data-testid="esg-review-sites-input"
        />
        <p className={NOTE}>
          {proposal.sites.length > 0
            ? "The sites your registers name. Each site's figures go in its own row; correct the list if it is wrong, one site per line."
            : "No register names a site. Leave this empty to report as one company, or list your sites, one per line."}
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor="esg-review-boundary" className={LABEL}>
          Organisational boundary
        </label>
        <select
          id="esg-review-boundary"
          value={boundary}
          onChange={(event) => onBoundaryChange(event.target.value)}
          className={FIELD}
          data-testid="esg-review-boundary"
        >
          <option value="">Declare it later</option>
          {ESG_BOUNDARY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <p className={NOTE}>Which operations your emissions cover. It is yours to declare; none of your documents states it.</p>
      </div>

      {priorYear && priorYear.measures.length > 0 ? (
        <div className="mt-5 border-t border-white/[0.06] pt-4" data-testid="esg-review-prior-year">
          <p className={LABEL}>Last year's figures</p>
          <p className={NOTE}>
            Your documents also hold figures for {esgPeriodLabel(priorYear.months)}. They were kept out of this year:
          </p>
          <ul className="mt-2 space-y-1 text-[13px] text-[color:var(--body)]">
            {priorYear.measures.map((m) => (
              <li key={m.prefix} className="flex justify-between gap-3">
                <span>{m.label}</span>
                <span className="tabular-nums text-[var(--esg-text2,rgba(255,255,255,0.56))]">
                  {number(m.total)} {m.unit} · {m.monthsCovered} month{m.monthsCovered === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
          {baseline.B90 !== undefined || baseline.B92 !== undefined ? (
            <label className="mt-3 flex items-start gap-2.5 text-[13px] leading-5 text-[color:var(--body)]">
              <input
                type="checkbox"
                checked={useBaseline}
                onChange={(event) => onUseBaselineChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--esg-acc-e,#1de9a0)]"
                data-testid="esg-review-baseline-toggle"
              />
              <span>
                Use them as the baseline
                {baseline.B90 !== undefined ? ` — Scope 1 and 2: ${number(baseline.B90)} tCO₂e` : ""}
                {baseline.B92 !== undefined ? `${baseline.B90 !== undefined ? ";" : " —"} electricity: ${number(baseline.B92)} kWh` : ""}
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default EsgCreateFactsPanel;
