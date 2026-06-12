import { EsgAppLink } from "@/components/EsgAppLink";
import { esgCreateHref } from "@/lib/esgRoutes";
import { computeBbbeeBridge } from "../lib/calculators/bbbeeBridge";
import { useEsgStore } from "../lib/esgStore";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 1 }).format(n);
}

export default function EsgBbbeeBridge() {
  const { workbook, companyId } = useEsgStore();
  const bridge = workbook ? computeBbbeeBridge(workbook) : null;

  return (
    <div className="space-y-5" data-testid="esg-bbbee-bridge">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)] mb-2">
          B_BBEE_ESG
        </p>
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--esg-text)]">
          B-BBEE Generic Code Bridge
        </h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1">
          One-way bridge from ESG inputs to Generic Code elements (Statement 000).
        </p>
      </header>

      {bridge ? (
        <div className="esg-glass p-5 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">EE Scorecard points (E15)</div>
            <div className="text-[24px] font-bold text-[var(--esg-acc-s)]">{fmt(bridge.eeScorecardPoints)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Stance floor (B9)</div>
            <div className="text-[24px] font-bold text-[var(--esg-text)]">{bridge.stanceFloor.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">MC partial credit (EE → 19 pts)</div>
            <div className="text-[20px] font-semibold">{fmt(bridge.ownershipPartialCredit)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Skills partial credit (25 pts)</div>
            <div className="text-[20px] font-semibold">{fmt(bridge.skillsPartialCredit)}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">SED partial credit (5 pts)</div>
            <div className="text-[20px] font-semibold">{fmt(bridge.sedPartialCredit)}</div>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[var(--esg-text3)]">Load workbook data to compute bridge.</p>
      )}

      {companyId ? (
        <EsgAppLink
          href={esgCreateHref(companyId)}
          className="inline-flex text-[12px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
          data-testid="esg-edit-inputs-link"
        >
          Edit inputs →
        </EsgAppLink>
      ) : null}
    </div>
  );
}
