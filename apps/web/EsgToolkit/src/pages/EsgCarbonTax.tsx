import { computeCarbonTax, readCarbonTaxScreen } from "../lib/calculators/carbonTax";
import { useEsgStore } from "../lib/esgStore";

function fmt(n: number, digits = 0): string {
  return new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

const SCREEN_LABELS: { key: keyof ReturnType<typeof readCarbonTaxScreen>; text: string }[] = [
  {
    key: "stationaryCombustionAbove10MW",
    text: "Stationary combustion — a boiler, furnace, generator or turbine rated at or above 10 MW(th)",
  },
  {
    key: "listedIndustrialProcess",
    text: "A listed industrial process — cement, lime, glass, ammonia, nitric acid, iron and steel, aluminium (any output at all)",
  },
  { key: "fugitiveEmissions", text: "Fugitive emissions — coal mining, oil and gas extraction, venting or flaring" },
];

/**
 * The carbon tax page.
 *
 * It leads with LIABILITY, not with a rand figure, because for most of the
 * companies this toolkit serves the correct answer is that they are not carbon
 * taxpayers at all. This page used to price every company's Scope 1 + 2 at two
 * rates and add them together as "total exposure" — pricing the same tonnes
 * twice, on a base the Act does not reach, for businesses with no Schedule 2
 * activity. A client who quoted that in a submission would have been badly
 * wrong and nothing on the screen said so.
 */
export default function EsgCarbonTax() {
  const workbook = useEsgStore((s) => s.workbook);
  const tax = workbook ? computeCarbonTax(workbook) : null;
  const screen = workbook ? readCarbonTaxScreen(workbook) : null;

  if (!tax || !screen) {
    return (
      <div className="space-y-4" data-testid="esg-carbon-tax">
        <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">Carbon tax</h1>
        <p className="text-[13px] text-[var(--esg-text3)]">Capture emissions data to assess liability.</p>
      </div>
    );
  }

  const answer = (v: boolean | null) => (v == null ? "Not answered" : v ? "Yes" : "No");
  const answerTone = (v: boolean | null) =>
    v == null ? "text-[var(--esg-acc-s)]" : v ? "text-[var(--esg-text)]" : "text-[var(--esg-text3)]";

  return (
    <div className="space-y-4" data-testid="esg-carbon-tax">
      <header>
        <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">Carbon tax</h1>
        <p className="text-[12px] text-[var(--esg-text2)] mt-1 max-w-[70ch]">
          Liability under the Carbon Tax Act is decided by ACTIVITY, not by emissions. Road transport
          is listed at a threshold of N/A and can never on its own create liability — the fuel levy
          already prices it — and purchased electricity is the generator's liability, not the buyer's.
        </p>
      </header>

      {/* the screen comes first: it decides whether any figure follows */}
      <div className="esg-glass p-5" data-testid="esg-carbon-tax-screen">
        <div className="text-[10px] uppercase tracking-wider text-[var(--esg-text3)] mb-3">
          Schedule 2 screen
        </div>
        <ul className="space-y-2">
          {SCREEN_LABELS.map((row) => (
            <li key={row.key} className="flex items-start gap-3 text-[12px]">
              <span className={`shrink-0 w-[92px] font-semibold ${answerTone(screen[row.key])}`}>
                {answer(screen[row.key])}
              </span>
              <span className="text-[var(--esg-text2)] leading-snug">{row.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div
        className={`esg-glass p-5 ${tax.liable ? "" : "border-l-2 border-[var(--esg-acc-e)]"}`}
        data-testid="esg-carbon-tax-basis"
      >
        <div className="text-[10px] uppercase tracking-wider text-[var(--esg-text3)] mb-2">
          {tax.screenIncomplete ? "Not assessed" : tax.liable ? "Liable" : "Not a carbon taxpayer"}
        </div>
        <div
          className={`text-[28px] font-bold leading-none ${
            tax.liable ? "text-[var(--esg-acc-e)]" : "text-[var(--esg-text)]"
          }`}
          data-testid="esg-carbon-tax-liability"
        >
          {tax.screenIncomplete ? "—" : `R ${fmt(tax.liabilityZar)}`}
        </div>
        <p className="text-[12px] text-[var(--esg-text2)] mt-3 leading-relaxed max-w-[80ch]">
          {tax.liabilityBasis}
        </p>
      </div>

      {tax.liable && !tax.screenIncomplete ? (
        <div className="esg-glass p-5 grid gap-4 sm:grid-cols-3" data-testid="esg-carbon-tax-working">
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Taxable tCO₂e</div>
            <div className="text-[20px] font-semibold text-[var(--esg-text)]">{fmt(tax.taxableTco2e, 2)}</div>
            <div className="text-[10px] text-[var(--esg-text3)] mt-1">
              After the {Math.round(tax.allowance * 100)}% basic allowance
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Rate</div>
            <div className="text-[20px] font-semibold text-[var(--esg-text)]">R {fmt(tax.rateZar)}/t</div>
            <div className="text-[10px] text-[var(--esg-text3)] mt-1">
              {tax.taxPeriodYear} tax period{tax.rateExtrapolated ? " — outside the published trajectory" : ""}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-[var(--esg-text3)]">Basis</div>
            <div className="text-[20px] font-semibold text-[var(--esg-text)]">
              {tax.annualised ? "Annualised" : "Full period"}
            </div>
            <div className="text-[10px] text-[var(--esg-text3)] mt-1">
              {tax.annualised
                ? `Part-year data scaled by ${tax.annualiseFactor.toFixed(2)} — an estimate, not a return`
                : "Captured figures treated as a full year"}
            </div>
          </div>
        </div>
      ) : null}

      {tax.excludedLines.length ? (
        <div className="esg-glass p-5" data-testid="esg-carbon-tax-excluded">
          <div className="text-[10px] uppercase tracking-wider text-[var(--esg-text3)] mb-3">
            Emissions excluded from the tax base
          </div>
          <ul className="space-y-2.5">
            {tax.excludedLines.map(({ line, reason }) => (
              <li key={line.label} className="text-[12px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[var(--esg-text)] font-medium">{line.label}</span>
                  <span className="text-[var(--esg-text3)] tabular-nums shrink-0">
                    {fmt(line.tco2e, 2)} tCO₂e
                  </span>
                </div>
                <div className="text-[var(--esg-text3)] leading-snug mt-0.5">{reason}</div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-[var(--esg-text3)] mt-4 leading-relaxed">
            These emissions are still reported in full in the GHG inventory and the disclosure pack.
            Excluding them here says only that the Carbon Tax Act does not reach them.
          </p>
        </div>
      ) : null}
    </div>
  );
}
