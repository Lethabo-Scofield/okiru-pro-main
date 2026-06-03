import { useCallback, useMemo } from "react";
import { parseClipboardMatrix } from "@/lib/workbookGridParse";
import { applyPasteToCells, sumRow } from "@/lib/esg/esgGridPaste";
import { ESG_TABLE_CELL, ESG_TABLE_HEAD } from "./esgEditorChrome";

export const ESG_DEFAULT_MONTHS = [
  "Jul-25",
  "Aug-25",
  "Sep-25",
  "Oct-25",
  "Nov-25",
  "Dec-25",
  "Jan-26",
  "Feb-26",
  "Mar-26",
];

export const ESG_DEFAULT_DEPOTS = ["BLOEM", "CPT", "DBN", "ISANDO", "PE"];

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
    <div className="overflow-x-auto" onPaste={handlePaste}>
      <table className="w-full border-collapse min-w-[720px]">
        <thead>
          <tr className={ESG_TABLE_HEAD}>
            <th className={ESG_TABLE_CELL}>Depot</th>
            <th className={ESG_TABLE_CELL}>Unit</th>
            {months.map((m) => (
              <th key={m} className={ESG_TABLE_CELL}>
                {m}
              </th>
            ))}
            <th className={ESG_TABLE_CELL}>YTD</th>
            <th className={ESG_TABLE_CELL}>tCO₂e</th>
            <th className={ESG_TABLE_CELL}>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const monthVals = months.map((_, mi) => {
              const ref = `${cellPrefix}_${monthColLetter(mi)}${14 + ri}`;
              const v = values[ref];
              return v === "" || v == null ? "" : Number(v);
            });
            const ytd = sumRow(monthVals);
            const tco2 = emissionFactor ? (ytd * emissionFactor) / 1000 : 0;
            return (
              <tr key={row.depot}>
                <td className={ESG_TABLE_CELL}>{row.depot}</td>
                <td className={ESG_TABLE_CELL}>{unitLabel}</td>
                {months.map((_, mi) => {
                  const ref = `${cellPrefix}_${monthColLetter(mi)}${14 + ri}`;
                  return (
                    <td key={ref} className={ESG_TABLE_CELL}>
                      <input
                        type="number"
                        disabled={readOnly}
                        value={values[ref] ?? ""}
                        onChange={(e) => {
                          onTouch?.(ref);
                          onChange({
                            [ref]: e.target.value === "" ? "" : Number(e.target.value),
                          });
                        }}
                        className="w-full bg-transparent text-[12px] outline-none"
                      />
                    </td>
                  );
                })}
                <td className={`${ESG_TABLE_CELL} text-[#8e8e93]`} data-testid={`ytd-${ri}`}>
                  {ytd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className={`${ESG_TABLE_CELL} text-[#8e8e93]`} data-testid={`tco2-${ri}`}>
                  {tco2.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </td>
                <td className={ESG_TABLE_CELL}>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={String(values[`${cellPrefix}_src_${ri}`] ?? "")}
                    onChange={(e) => {
                      onTouch?.(`${cellPrefix}_src_${ri}`);
                      onChange({ [`${cellPrefix}_src_${ri}`]: e.target.value });
                    }}
                    className="w-full bg-transparent text-[12px] outline-none"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
