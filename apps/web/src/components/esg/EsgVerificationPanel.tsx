/**
 * Checked against your documents — the ESG verification checks (V1–V10,
 * `esgVerification.ts`) for what the documents placed, before anything is
 * created.
 *
 * Every check is flag-only: this panel reports, it never changes a figure.
 * Needs-you and flags open; passes and out-of-period stay folded.
 */
import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, FileSearch, Flag } from "lucide-react";
import { ESG_FALLBACK_REPORTING_AXES } from "@/components/esg-workbook/esgDefaults";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import {
  verifyEsg,
  type EsgCheckStatus,
  type EsgHeldFact,
  type EsgVerificationCheck,
  type EsgVerificationReport,
} from "@/lib/esg/esgVerification";
import type { EsgInjectionResult, EsgParserCaseLike } from "./esgParserInjection";

/** The verification report for a placement, read from the case it came from. */
export function buildEsgVerification(
  injection: EsgInjectionResult,
  parserCase: EsgParserCaseLike | null | undefined,
): EsgVerificationReport {
  const workbook = {
    companyId: "",
    ownerUserId: "",
    ownerOrganizationId: null,
    updatedAt: "",
    sections: Object.fromEntries(Object.entries(injection.patches).map(([id, patch]) => [id, { cells: { ...patch.cells } }])),
  } as unknown as EsgWorkbookData;
  const held: EsgHeldFact[] = injection.unplaced
    .filter((u) => u.rejection === "out_of_period" || u.rejection === "other_entity" || u.rejection === "unit_unresolved")
    .map((u) => ({ field: u.field, value: u.value, sourceFile: u.sourceFile, reason: u.reason, rejection: u.rejection }));
  return verifyEsg({
    calculator: parserCase?.ai_entities?.calculator ?? null,
    extractions: parserCase?.ai_entities?.extractions ?? [],
    axes: injection.axes ?? ESG_FALLBACK_REPORTING_AXES,
    workbook,
    held,
  });
}

const STATUS: Record<EsgCheckStatus, { label: string; color: string; Icon: typeof Flag; open: boolean }> = {
  "needs-you": { label: "Needs your answer", color: "#ffd60a", Icon: AlertTriangle, open: true },
  flag: { label: "Disagrees with a document", color: "#ff9f0a", Icon: Flag, open: true },
  "out-of-period": { label: "Outside the reporting year", color: "#bf9bff", Icon: Clock, open: false },
  pass: { label: "Agrees with the documents", color: "#30d158", Icon: CheckCircle2, open: false },
};
const ORDER: EsgCheckStatus[] = ["needs-you", "flag", "out-of-period", "pass"];

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "blank" : typeof v === "number" ? v.toLocaleString("en-ZA") : String(v));

function CheckRow({ check }: { check: EsgVerificationCheck }) {
  return (
    <div className="border-t border-white/[0.05] px-4 py-2.5" data-testid={`esg-verification-check-${check.code}`}>
      <p className="text-[12.5px] leading-5 text-[#e5e5ea]">
        <span className="mr-1.5 text-[11px] font-semibold text-[var(--esg-text3,rgba(255,255,255,0.32))]">{check.code}</span>
        {check.statement}
      </p>
      {check.evidence.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {check.evidence.slice(0, 4).map((e, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
              <FileSearch className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">
                {e.document} — {e.field}: <span className="text-[color:var(--body)]">{show(e.value)}</span>
              </span>
            </li>
          ))}
          {check.evidence.length > 4 ? (
            <li className="text-[11px] text-[var(--esg-text3,rgba(255,255,255,0.32))]">and {check.evidence.length - 4} more</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function Group({ status, checks }: { status: EsgCheckStatus; checks: EsgVerificationCheck[] }) {
  const meta = STATUS[status];
  const [open, setOpen] = React.useState(meta.open);
  if (checks.length === 0) return null;
  const { Icon } = meta;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[var(--esg-input-bg,#0e0e10)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
        data-testid={`esg-verification-group-${status}`}
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
        <span className="text-[12.5px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
        <span className="text-[12px] tabular-nums text-[color:var(--body)]">{checks.length}</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-[var(--esg-text3,rgba(255,255,255,0.32))] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? checks.map((c) => <CheckRow key={c.id} check={c} />) : null}
    </div>
  );
}

export function EsgVerificationPanel({ report }: { report: EsgVerificationReport | null }) {
  if (!report || report.checks.length === 0) return null;
  return (
    <div className="mt-4 space-y-2" data-testid="esg-verification-panel">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3,rgba(255,255,255,0.32))]">
          Checked against your documents
        </p>
        <p className="mt-1 text-[12px] leading-5 text-[var(--esg-text2,rgba(255,255,255,0.56))]">
          Each total is compared with the documents it comes from. These checks report only: no figure or point is changed.
        </p>
      </div>
      {ORDER.map((status) => (
        <Group key={status} status={status} checks={report.checks.filter((c) => c.status === status)} />
      ))}
    </div>
  );
}

export default EsgVerificationPanel;
