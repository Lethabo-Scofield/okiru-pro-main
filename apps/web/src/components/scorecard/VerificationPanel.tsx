/**
 * Checked against your documents — the claim-vs-evidence report beside the
 * score.
 *
 * Two totals from the same calculator: CLAIMED (the score above: what the
 * client's schedules state, with only the replacements the rules decide) and
 * EVIDENCED (what the documents we read prove). Every check names the
 * document and field it read, and says what — if anything — it did to the
 * points. Needs-you items show the total under each answer.
 */
import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Clock, FileSearch, Flag } from "lucide-react";
import type { CheckRule, CheckStatus, VerificationCheck, VerificationReport } from "../../../../api/pipeline/verification/index.js";
import type { VerificationTotals } from "@/lib/verification/verificationTotals";

const STATUS_META: Record<CheckStatus, { label: string; color: string; border: string; bg: string; Icon: typeof AlertTriangle; open: boolean }> = {
  "needs-you": { label: "Needs your answer", color: "#ffd60a", border: "rgba(255,214,10,0.28)", bg: "rgba(255,214,10,0.06)", Icon: AlertTriangle, open: true },
  flag: { label: "Disagrees with a document", color: "#ff9f0a", border: "rgba(255,159,10,0.26)", bg: "rgba(255,159,10,0.05)", Icon: Flag, open: true },
  unproven: { label: "Not proven by a document", color: "#64d2ff", border: "rgba(100,210,255,0.22)", bg: "rgba(100,210,255,0.05)", Icon: CircleHelp, open: false },
  "out-of-period": { label: "Outside the measurement period", color: "#bf9bff", border: "rgba(191,155,255,0.22)", bg: "rgba(191,155,255,0.05)", Icon: Clock, open: false },
  pass: { label: "Agrees with the documents", color: "#30d158", border: "rgba(48,209,88,0.20)", bg: "rgba(48,209,88,0.05)", Icon: CheckCircle2, open: false },
};

const RULE_TEXT: Record<CheckRule, string | null> = {
  none: null,
  "flag-only": "Reported only — no points changed.",
  "replaced-statutory": "The statutory or accounting record's figure is used in both totals.",
  "replaced-certificate": "The certificate's figure is used in both totals.",
  "excluded-from-evidenced": "Counted in the claimed total; left out of the evidenced total.",
  "lower-until-answered": "The value that claims less is scored until you choose.",
};

const fmt = (n: number | null | undefined) => (typeof n === "number" ? n.toFixed(2) : "—");
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "blank" : String(v));

function CheckRow({ check, totals }: { check: VerificationCheck; totals: VerificationTotals | null }) {
  const rule = RULE_TEXT[check.rule];
  const answers = totals?.answers[check.id];
  return (
    <div className="px-5 py-3" style={{ borderTop: "1px solid #141414" }} data-testid={`verification-check-${check.kind}`}>
      <div className="text-[13px] text-[#e5e5ea] leading-snug">{check.statement}</div>
      {rule && <div className="text-[12px] text-[color:var(--body)] mt-0.5">{rule}</div>}
      {answers && answers.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {answers.map(({ choice, total }, i) => (
            <li key={i} className="text-[12px] text-[color:var(--body)] tabular-nums">
              <span className="text-[#e5e5ea]">{show(choice.value)}</span>
              {choice.sources.length > 0 && <span> ({choice.sources.join(", ")})</span>}
              {" → "}
              <span className="text-[#e5e5ea]">{fmt(total)} pts</span>
              {choice.held && <span> · scored now</span>}
            </li>
          ))}
        </ul>
      )}
      {check.evidence.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {check.evidence.slice(0, 4).map((e, i) => (
            <li key={i} className="text-[11px] text-[color:var(--muted)] flex items-start gap-1.5">
              <FileSearch className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                {e.document} — {e.field}: <span className="text-[color:var(--body)]">{show(e.value)}</span>
              </span>
            </li>
          ))}
          {check.evidence.length > 4 && <li className="text-[11px] text-[color:var(--muted)]">and {check.evidence.length - 4} more</li>}
        </ul>
      )}
    </div>
  );
}

function Group({ status, checks, totals }: { status: CheckStatus; checks: VerificationCheck[]; totals: VerificationTotals | null }) {
  const meta = STATUS_META[status];
  const [open, setOpen] = React.useState(meta.open);
  if (checks.length === 0) return null;
  const { Icon } = meta;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#0d0d0d", border: `1px solid ${meta.border}` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-3.5 flex items-center gap-3 text-left"
        style={{ background: meta.bg }}
        data-testid={`verification-group-${status}`}
      >
        <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
        <span className="text-[13px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
        <span className="text-[12px] text-[color:var(--body)] tabular-nums">{checks.length}</span>
        <ChevronDown className={`w-4 h-4 ml-auto text-[color:var(--muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div>{checks.map((c) => <CheckRow key={c.id} check={c} totals={totals} />)}</div>}
    </div>
  );
}

export function VerificationPanel({ report, totals }: { report: VerificationReport | null; totals: VerificationTotals | null }) {
  if (!report || report.checks.length === 0) return null;
  const order: CheckStatus[] = ["needs-you", "flag", "unproven", "out-of-period", "pass"];
  return (
    <div className="space-y-2.5" data-testid="verification-panel">
      <div className="rounded-2xl px-5 py-4" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }}>
        <p className="text-[11px] font-semibold text-[color:var(--muted)] uppercase tracking-widest">Checked against your documents</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 tabular-nums">
          <span className="text-[13px] text-[color:var(--body)]">
            Claimed <span className="text-[18px] font-semibold text-white" data-testid="verification-claimed">{fmt(totals?.claimed)}</span>
          </span>
          <span className="text-[13px] text-[color:var(--body)]">
            Evidenced <span className="text-[18px] font-semibold text-white" data-testid="verification-evidenced">{fmt(totals?.evidenced)}</span>
          </span>
        </div>
        <p className="mt-1.5 text-[12px] leading-5 text-[color:var(--body)]">
          Claimed is the score above. Evidenced counts only what the documents we read prove
          {report.period ? ` for ${report.period.start} to ${report.period.end}` : ""}: the gap is the evidence still to upload.
        </p>
      </div>
      {order.map((status) => (
        <Group key={status} status={status} checks={report.checks.filter((c) => c.status === status)} totals={totals} />
      ))}
    </div>
  );
}
