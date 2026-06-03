import { ESG_INPUT, ESG_PANEL } from "./esgEditorChrome";

export type EsgFieldDef = {
  cell: string;
  label: string;
  type?: "number" | "text" | "select";
  options?: string[];
};

type Props = {
  fields: EsgFieldDef[];
  values: Record<string, string | number | boolean | null>;
  onChange: (patch: Record<string, string | number | boolean | null>) => void;
  onTouch?: (fieldRef: string) => void;
  readOnly?: boolean;
};

export function EsgScalarForm({ fields, values, onChange, onTouch, readOnly }: Props) {
  return (
    <div className={`${ESG_PANEL} p-5 grid gap-4 sm:grid-cols-2`}>
      {fields.map((f) => (
        <label key={f.cell} className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--esg-text3)]">
            {f.label}
          </span>
          {f.type === "select" ? (
            <select
              value={String(values[f.cell] ?? "")}
              disabled={readOnly}
              onChange={(e) => {
                onTouch?.(f.cell);
                onChange({ [f.cell]: e.target.value });
              }}
              className={`mt-1 ${ESG_INPUT}`}
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
              value={values[f.cell] ?? ""}
              disabled={readOnly}
              onChange={(e) => {
                onTouch?.(f.cell);
                const v =
                  f.type === "number"
                    ? e.target.value === ""
                      ? null
                      : Number(e.target.value)
                    : e.target.value;
                onChange({ [f.cell]: v });
              }}
              className={`mt-1 ${ESG_INPUT}`}
            />
          )}
        </label>
      ))}
    </div>
  );
}
