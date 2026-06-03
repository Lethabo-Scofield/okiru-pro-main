import { computeCarbonTax } from "../lib/calculators/carbonTax";
import { useEsgStore } from "../lib/esgStore";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(n);
}

export default function EsgCarbonTax() {
  const workbook = useEsgStore((s) => s.workbook);
  const tax = workbook ? computeCarbonTax(workbook) : null;

  return (
    <div className="space-y-4" data-testid="esg-carbon-tax">
      <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">Carbon Tax</h1>
      <p className="text-[12px] text-[var(--esg-text2)]">
        Liability from Carbon_Tax sheet — Scope 1+2 annualised × (1 − 60% allowance) × rate.
      </p>
      {tax ? (
        <div className="esg-glass p-5 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Taxable tCO₂e (annualised)</div>
            <div className="text-[24px] font-bold text-[var(--esg-acc-e)]">{fmt(tax.taxableTco2e)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Tier 1 liability (R{tax.tier1Rate}/t)</div>
            <div className="text-[20px] font-semibold text-[var(--esg-text)]">R {fmt(tax.tier1Liability)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Tier 2 liability (R{tax.tier2Rate}/t)</div>
            <div className="text-[20px] font-semibold text-[var(--esg-text)]">R {fmt(tax.tier2Liability)}</div>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-[var(--esg-text3)]">Enter E_Data emissions to calculate.</p>
      )}
    </div>
  );
}
