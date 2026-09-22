/**
 * The form that starts a scorecard.
 *
 * It used to be a company-name box and a button, repeated in three places on
 * the same page. Sector, scorecard type and year end were left to schema
 * defaults, so a scorecard could be built and scored against RCOGP Generic
 * because nobody was asked. The company list shows what that produced.
 *
 * One component now, used everywhere that create appears, validating through
 * the same shared/clientCreation rules the endpoint enforces. Three copies of a
 * rule is three chances for one of them to fall behind.
 *
 * Errors show once a field has been touched or the form has been submitted —
 * never on first render, because a form that opens covered in red has told the
 * user off for nothing.
 */
import { useMemo, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { NumericDateInput } from "@/components/ui/NumericDateInput";
import {
  CLIENT_SECTOR_CODES,
  scorecardTypesForSector,
  validateNewClient,
  type ClientFieldError,
  type NewClientDraft,
} from "@shared/clientCreation";

const SECTOR_LABELS: Record<string, string> = {
  RCOGP: "Revised Codes of Good Practice",
  ICT: "ICT Sector Code",
  FSC: "Financial Sector Code",
  AGRI: "AgriBEE Sector Code",
  TRANSPORT: "Transport Sector Code",
  CONSTRUCTION: "Construction Sector Code",
};

export interface NewCompanyValues {
  name: string;
  sectorCode: string;
  scorecardType: string;
  financialYearEnd: string;
}

export const EMPTY_NEW_COMPANY: NewCompanyValues = {
  name: "",
  sectorCode: "",
  scorecardType: "",
  financialYearEnd: "",
};

interface Props {
  values: NewCompanyValues;
  onChange: (values: NewCompanyValues) => void;
  onSubmit: () => void;
  creating?: boolean;
  /** "primary" is the violet call to action; "quiet" is the secondary panel. */
  tone?: "primary" | "quiet";
  submitLabel?: string;
  idPrefix?: string;
}

const field =
  "w-full min-w-0 rounded-xl border border-white/[0.10] bg-[#0c0c0e] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-[rgba(255,255,255,0.32)] focus:border-violet-300/50 focus:ring-2 focus:ring-violet-300/10";
const fieldBad = "border-status-error/60 focus:border-status-error/60 focus:ring-status-error/10";

export function NewCompanyForm({
  values,
  onChange,
  onSubmit,
  creating = false,
  tone = "primary",
  submitLabel = "Start free",
  idPrefix = "new-company",
}: Props) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => validateNewClient(values as NewClientDraft), [values]);
  const errorFor = (name: ClientFieldError["field"]) =>
    (submitted || touched[name]) ? errors.find((e) => e.field === name)?.message : undefined;

  const typeOptions = scorecardTypesForSector(values.sectorCode);
  const ready = errors.length === 0 && !creating;

  const set = (patch: Partial<NewCompanyValues>) => {
    const next = { ...values, ...patch };
    // Changing sector can strand a type the new sector does not offer — FSC has
    // no QSE. Clear it rather than submitting a combination that cannot score.
    if (patch.sectorCode !== undefined) {
      const allowed = scorecardTypesForSector(patch.sectorCode);
      if (!allowed.some((t) => t.toLowerCase() === next.scorecardType.toLowerCase())) {
        next.scorecardType = allowed.length === 1 ? allowed[0] : "";
      }
    }
    onChange(next);
  };

  const submit = () => {
    setSubmitted(true);
    if (errors.length || creating) return;
    onSubmit();
  };

  const Message = ({ name }: { name: ClientFieldError["field"] }) => {
    const message = errorFor(name);
    if (!message) return null;
    return <p className="mt-1 text-[11px] text-status-error">{message}</p>;
  };

  const Label = ({ children }: { children: React.ReactNode }) => (
    <div className="mb-1.5 text-[12px] text-[color:var(--body)]">
      {children} <span className="text-status-error">*</span>
    </div>
  );

  return (
    <div className="space-y-3">
      <div>
        <Label>Company name</Label>
        <input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Registered company name"
          className={`${field} ${errorFor("name") ? fieldBad : ""}`}
          data-testid="input-new-company"
        />
        <Message name="name" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Sector</Label>
          <select
            id={`${idPrefix}-sector`}
            value={values.sectorCode}
            onChange={(e) => set({ sectorCode: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, sectorCode: true }))}
            className={`${field} ${errorFor("sectorCode") ? fieldBad : ""}`}
            data-testid="select-new-company-sector"
          >
            <option value="" className="bg-[#0c0c0e]">Choose a sector…</option>
            {CLIENT_SECTOR_CODES.map((code) => (
              <option key={code} value={code} className="bg-[#0c0c0e]">
                {SECTOR_LABELS[code] ?? code}
              </option>
            ))}
          </select>
          <Message name="sectorCode" />
        </div>

        <div>
          <Label>Scorecard type</Label>
          <select
            id={`${idPrefix}-type`}
            value={values.scorecardType}
            onChange={(e) => set({ scorecardType: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, scorecardType: true }))}
            disabled={!values.sectorCode}
            className={`${field} disabled:opacity-50 ${errorFor("scorecardType") ? fieldBad : ""}`}
            data-testid="select-new-company-type"
          >
            <option value="" className="bg-[#0c0c0e]">
              {values.sectorCode ? "Choose a type…" : "Pick a sector first"}
            </option>
            {typeOptions.map((type) => (
              <option key={type} value={type} className="bg-[#0c0c0e]">{type}</option>
            ))}
          </select>
          <Message name="scorecardType" />
        </div>
      </div>

      <div>
        <Label>Financial year end</Label>
        <NumericDateInput
          id={`${idPrefix}-fye`}
          value={values.financialYearEnd}
          onChange={(iso) => set({ financialYearEnd: iso })}
          onBlur={() => setTouched((t) => ({ ...t, financialYearEnd: true }))}
          className={`${field} ${errorFor("financialYearEnd") ? fieldBad : ""}`}
          data-testid="input-new-company-fye"
        />
        <Message name="financialYearEnd" />
        <p className="mt-1.5 text-[11px] leading-4 text-[color:var(--muted)]">
          The measurement period defaults to the twelve months ending here. You can change the
          start and end dates in the workbook if your reporting period is shorter or shifted.
        </p>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!ready}
        className={
          tone === "primary"
            ? "inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(139,92,246,0.6)] transition-colors hover:bg-violet-400 disabled:opacity-40 disabled:hover:bg-violet-500 sm:w-auto"
            : "inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[rgba(255,255,255,0.06)] px-4 py-2.5 text-[13px] font-semibold text-[#f2f2f7] transition-colors hover:bg-[rgba(255,255,255,0.10)] disabled:opacity-50 sm:w-auto"
        }
        data-testid="button-start-scorecard"
      >
        {creating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {submitLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </>
        )}
      </button>
    </div>
  );
}

export default NewCompanyForm;
