import { useCallback } from "react";
import { parseClipboardMatrix } from "@/lib/workbookGridParse";
import { applyPasteToCells, sumRow } from "@/lib/esg/esgGridPaste";
import { ESG_TABLE_CELL, ESG_TABLE_HEAD, ESG_TABLE_INPUT } from "./esgEditorChrome";

export const EEA2_LEVELS = [
  "L1 Top management",
  "L2 Senior management",
  "L3 Middle management",
  "L4 Junior management",
  "L5 Semi-skilled",
  "L6 Unskilled",
  "Temporary",
];

export const HEADCOUNT_COLS = [
  { key: "afM", label: "Af M" },
  { key: "colM", label: "Col M" },
  { key: "indM", label: "Ind M" },
  { key: "whtM", label: "Wht M" },
  { key: "afF", label: "Af F" },
  { key: "colF", label: "Col F" },
  { key: "indF", label: "Ind F" },
  { key: "whtF", label: "Wht F" },
  { key: "forM", label: "For M" },
  { key: "forF", label: "For F" },
];

type Props = {
  values: Record<string, string | number | boolean | null>;
  onChange: (cells: Record<string, string | number | boolean | null>) => void;
  onTouch?: (fieldRef: string) => void;
  readOnly?: boolean;
};

export function EsgHeadcountGrid({ values, onChange, onTouch, readOnly }: Props) {
  const cellRefs = EEA2_LEVELS.map((_, ri) =>
    HEADCOUNT_COLS.map((_, ci) => `hc_${ri}_${ci}`),
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (readOnly) return;
      const matrix = parseClipboardMatrix(e.clipboardData.getData("text/plain"));
      if (!matrix.length) return;
      e.preventDefault();
      onChange(applyPasteToCells(values, cellRefs, matrix, { row: 0, col: 0 }));
      onTouch?.("headcount");
    },
    [readOnly, values, onChange, onTouch],
  );

  return (
    <div className="overflow-x-auto" onPaste={handlePaste} data-testid="esg-headcount-grid">
      <table className="w-full border-collapse">
        <thead>
          <tr className={ESG_TABLE_HEAD}>
            <th className={ESG_TABLE_CELL}>Level</th>
            {HEADCOUNT_COLS.map((c) => (
              <th key={c.key} className={ESG_TABLE_CELL}>
                {c.label}
              </th>
            ))}
            <th className={ESG_TABLE_CELL}>Total</th>
          </tr>
        </thead>
        <tbody>
          {EEA2_LEVELS.map((level, ri) => {
            const rowVals = HEADCOUNT_COLS.map((_, ci) => {
              const ref = `hc_${ri}_${ci}`;
              const v = values[ref];
              return v === "" || v == null ? "" : Number(v);
            });
            const total = sumRow(rowVals);
            return (
              <tr key={level}>
                <td className={ESG_TABLE_CELL}>{level}</td>
                {HEADCOUNT_COLS.map((col, ci) => {
                  const ref = `hc_${ri}_${ci}`;
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
                        className={`${ESG_TABLE_INPUT} min-w-[48px]`}
                      />
                    </td>
                  );
                })}
                <td className={`${ESG_TABLE_CELL} text-[#8e8e93]`} data-testid={`hc-total-${ri}`}>
                  {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
