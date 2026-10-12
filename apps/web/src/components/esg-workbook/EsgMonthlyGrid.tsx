import { useCallback, useMemo } from "react";
import { parseClipboardMatrix } from "@/lib/workbookGridParse";
import { applyPasteToCells, sumRow } from "@/lib/esg/esgGridPaste";
import { formatEsgNumber } from "@/lib/esg/esgFormat";
import { ESG_TABLE_CELL, ESG_TABLE_HEAD, ESG_TABLE_INPUT } from "./esgEditorChrome";
import { EsgCellMark, useEsgCellFiles } from "./EsgCellMark";

// Moved to lib so the data layer (grid dropdowns, import translation) can use
// them without depending on a component; re-exported here for existing callers.
import { ESG_DEFAULT_DEPOTS, ESG_DEFAULT_MONTHS } from "@/lib/esg/esgAxes";

export { ESG_DEFAULT_DEPOTS, ESG_DEFAULT_MONTHS };

export type MonthlyRow = { depot: string; months: (number | "")[]; source?: string };

type Props = {
  rows: MonthlyRow[];
  months?: string[];
  emissionFactor?: number;
  unitLabel?: string;
  cellPrefix: string;
  values: Record<string, string | number | boolean | null>;
  onChange: (cells: Record<string, string | number | boolean | null>) => void;
  onTouch?: (fieldRef: string) => void;
  readOnly?: boolean;
};

function monthColLetter(i: number): string {
  return String.fromCharCode(67 + i);
}

/**
 * A month's figure needs room for "22 180" without cropping: every month cell
 * has a floor width, figures sit right-aligned in tabular numerals, and the
 * browser's spinner arrows (which ate a third of a 45px cell, turning 800
 * into "8C") are hidden. A narrow page scrolls the grid sideways instead of
 * cutting its numbers.
 */
const MONTH_INPUT = `${ESG_TABLE_INPUT} min-w-[3.75rem] text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

/** One site's row: its months, totals, and the documents behind it. */
function MonthlyGridRow({
  row,
  ri,
  months,
  cellPrefix,
  emissionFactor,
  unitLabel,
  values,
  onChange,
  onTouch,
  readOnly,
}: Omit<Props, "rows"> & { row: MonthlyRow; ri: number; months: string[] }) {
  const refs = months.map((_, mi) => `${cellPrefix}_${monthColLetter(mi)}${14 + ri}`);
  const monthVals = refs.map((ref) => {
    const v = values[ref];
    return v === "" || v == null ? "" : Number(v);
  });
  const ytd = sumRow(monthVals);
  const tco2 = emissionFactor ? (ytd * emissionFactor) / 1000 : 0;
  // The Source column names the documents behind the row's figures until
  // someone types a source of their own; the typed one is what is saved.
  const files = useEsgCellFiles(refs);
  const srcRef = `${cellPrefix}_src_${ri}`;
  return (
    <tr>
      <td className={`${ESG_TABLE_CELL} whitespace-nowrap`}>{row.depot}</td>
      <td className={`${ESG_TABLE_CELL} whitespace-nowrap text-[color:var(--body)]`}>{unitLabel}</td>
      {refs.map((ref) => (
        <td key={ref} className={`${ESG_TABLE_CELL} relative !px-1`}>
          <input
            type="number"
            inputMode="decimal"
            disabled={readOnly}
            value={values[ref] ?? ""}
            onChange={(e) => {
              onTouch?.(ref);
              onChange({
                [ref]: e.target.value === "" ? "" : Number(e.target.value),
              });
            }}
            className={MONTH_INPUT}
          />
          <EsgCellMark cell={ref} current={values[ref]} className="absolute right-0.5 top-0.5" />
        </td>
      ))}
      <td className={`${ESG_TABLE_CELL} text-right tabular-nums text-[color:var(--body)]`} data-testid={`ytd-${ri}`}>
        {formatEsgNumber(ytd)}
      </td>
      <td className={`${ESG_TABLE_CELL} text-right tabular-nums text-[color:var(--body)]`} data-testid={`tco2-${ri}`}>
        {formatEsgNumber(tco2)}
      </td>
      <td className={`${ESG_TABLE_CELL} relative`}>
        <input
          type="text"
          disabled={readOnly}
          value={String(values[srcRef] ?? "")}
          placeholder={files.join(", ")}
          title={files.length > 0 ? `From ${files.join(", ")}` : undefined}
          onChange={(e) => {
            onTouch?.(srcRef);
            onChange({ [srcRef]: e.target.value });
          }}
          className={`${ESG_TABLE_INPUT} min-w-[9rem] placeholder:text-[color:var(--body)] placeholder:opacity-80`}
          data-testid={`esg-monthly-src-${cellPrefix}-${ri}`}
        />
        {/* The AI review may fill a Source from provenance: the same marker says so. */}
        <EsgCellMark cell={srcRef} current={values[srcRef]} className="absolute right-0.5 top-0.5" />
      </td>
    </tr>
  );
}

export function EsgMonthlyGrid({
  rows,
  months = ESG_DEFAULT_MONTHS,
  emissionFactor = 0,
  unitLabel = "L",
  cellPrefix,
  values,
  onChange,
  onTouch,
  readOnly,
}: Props) {
  const cellRefs = useMemo(() => {
    return rows.map((_, ri) => [
      `${cellPrefix}_depot_${ri}`,
      ...months.map((_, mi) => `${cellPrefix}_${monthColLetter(mi)}${14 + ri}`),
      `${cellPrefix}_ytd_${ri}`,
      `${cellPrefix}_tco2_${ri}`,
      `${cellPrefix}_src_${ri}`,
    ]);
  }, [rows, months, cellPrefix]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (readOnly) return;
      const text = e.clipboardData.getData("text/plain");
      const matrix = parseClipboardMatrix(text);
      if (matrix.length === 0) return;
      e.preventDefault();
      const next = applyPasteToCells(values, cellRefs, matrix, { row: 0, col: 1 });
      onChange(next);
      onTouch?.(cellPrefix);
    },
    [readOnly, values, cellRefs, onChange, onTouch, cellPrefix],
  );

  return (
    // `data-wide-grid`: the page widens while a monthly grid is on screen, as it
    // does for the document review — twelve months a row need the width.
    <div className="overflow-x-auto" onPaste={handlePaste} data-wide-grid="" data-testid={`esg-monthly-grid-${cellPrefix}`}>
      <table className="w-full border-collapse min-w-[720px]">
        <thead>
          <tr className={ESG_TABLE_HEAD}>
            <th className={ESG_TABLE_CELL}>Depot</th>
            <th className={ESG_TABLE_CELL}>Unit</th>
            {months.map((m) => (
              <th key={m} className={`${ESG_TABLE_CELL} whitespace-nowrap`}>
                {m}
              </th>
            ))}
            <th className={ESG_TABLE_CELL}>YTD</th>
            <th className={ESG_TABLE_CELL}>tCO₂e</th>
            <th className={ESG_TABLE_CELL}>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <MonthlyGridRow
              key={row.depot}
              row={row}
              ri={ri}
              months={months}
              cellPrefix={cellPrefix}
              emissionFactor={emissionFactor}
              unitLabel={unitLabel}
              values={values}
              onChange={onChange}
              onTouch={onTouch}
              readOnly={readOnly}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
