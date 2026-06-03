import { ESG_TABLE_CELL, ESG_TABLE_HEAD } from "./esgEditorChrome";

export type MaturityRowDef = {
  cell: string;
  scoreCell: string;
  label: string;
  kind: "yn" | "numeric";
  options?: string[];
};

export function maturityScoreFromYn(value: string): number {
  const v = value.trim().toLowerCase();
  if (v === "yes") return 5;
  if (v === "partial") return 2.5;
  if (v === "no") return 0;
  return 0;
}

type Props = {
  rows: MaturityRowDef[];
  values: Record<string, string | number | boolean | null>;
  onChange: (patch: Record<string, string | number | boolean | null>) => void;
  onTouch?: (fieldRef: string) => void;
  readOnly?: boolean;
  totalCell?: string;
};

export function EsgMaturityGrid({
  rows,
  values,
  onChange,
  onTouch,
  readOnly,
  totalCell = "F26",
}: Props) {
  let total = 0;
  for (const row of rows) {
    const raw = values[row.cell];
    const score =
      row.kind === "numeric"
        ? Number(raw) || 0
        : maturityScoreFromYn(String(raw ?? ""));
    total += score;
  }

  return (
    <div className="space-y-3" data-testid="esg-maturity-grid">
      <table className="w-full border-collapse">
        <thead>
          <tr className={ESG_TABLE_HEAD}>
            <th className={ESG_TABLE_CELL}>Metric</th>
            <th className={ESG_TABLE_CELL}>Value</th>
            <th className={ESG_TABLE_CELL}>Score (0–5)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const raw = values[row.cell];
            const score =
              row.kind === "numeric"
                ? Number(raw) || 0
                : maturityScoreFromYn(String(raw ?? ""));
            return (
              <tr key={row.cell}>
                <td className={ESG_TABLE_CELL}>{row.label}</td>
                <td className={ESG_TABLE_CELL}>
                  {row.kind === "yn" ? (
                    <select
                      disabled={readOnly}
                      value={String(raw ?? "")}
                      onChange={(e) => {
                        onTouch?.(row.cell);
                        onChange({ [row.cell]: e.target.value });
                      }}
                      className="w-full bg-transparent text-[12px]"
                    >
                      <option value="">—</option>
                      {(row.options ?? ["Yes", "Partial", "No", "N/A"]).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={5}
                      disabled={readOnly}
                      value={raw ?? ""}
                      onChange={(e) => {
                        onTouch?.(row.cell);
                        onChange({
                          [row.cell]: e.target.value === "" ? "" : Number(e.target.value),
                        });
                      }}
                      className="w-full bg-transparent text-[12px]"
                    />
                  )}
                </td>
                <td className={`${ESG_TABLE_CELL} text-[#8e8e93]`}>{score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-[12px] text-[var(--esg-text2)]">
        Total: <span data-testid="maturity-total">{total}</span> / 100
        {totalCell ? (
          <span className="text-[#636366] ml-2">(stored at {totalCell})</span>
        ) : null}
      </div>
    </div>
  );
}
