/**
 * ESG indicator ledger — THE SINGLE SOURCE OF TRUTH for ESG points allocation.
 *
 * Every value below is transcribed from the workbook
 * `docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx`, extracted to
 * `docs/esg/extracted/{E,S,G}_Scorecard.json` and tabulated in
 * `docs/esg/ESG_FORMULA_LEDGER.md` Part 1:
 *
 *   `indicator` ← `<Pillar>_Scorecard!A{row}`  (verbatim column-A text)
 *   `maxPoints` ← `<Pillar>_Scorecard!B{row}`  (column B, "Max Pts")
 *
 * So the `row` field IS the source-cell citation for each entry — `E d13` is
 * `E_Scorecard!A13`/`E_Scorecard!B13`, and so on.
 *
 * Pillar totals (asserted in `__tests__/esgPointsSingleSourceOfTruth.test.ts`
 * against the extracted JSON, not just against these literals):
 *   E = 108  (E_Scorecard rows 5–29; `E_Scorecard!A30` label reads "108 pts max")
 *   S = 100  (S_Scorecard rows 5–27)
 *   G = 100  (G_Scorecard rows 5–25)
 * These match `ESG_PILLAR_MAX` in `esgScoringDefaults.ts` and `PILLAR_MAX_*`
 * in `EsgToolkit/src/lib/esgConfig/consumer-goods.ts`.
 *
 * DO NOT hand-copy these numbers into another module. Points allocation used to
 * be maintained in four divergent places (this file, the dashboard pillar-row
 * table, the nav `scoreGroup.max` literals, and the pillar-max constants), and
 * they disagreed — the dashboard's private copy summed E to 106 and S to 93 and
 * showed different labels for the same indicator. Derive from the exports at
 * the bottom of this file instead (`sumIndicatorMaxPoints`,
 * `ESG_SCORECARD_PILLAR_MAX`).
 *
 * Audit note (this pass): every `maxPoints` and every `indicator` label here was
 * re-verified cell-by-cell against column A/B of the extracted workbook. None
 * required correction — this file was already exact, which is why it was chosen
 * as the source of truth. The divergent copies elsewhere were the defects.
 */
export type EsgScorecardIndicator = {
  /** 1-based worksheet row on the pillar's `*_Scorecard` sheet. */
  row: number;
  /** Stable calculator row id, `d{row}` — the key used in `EsgScorecardResult` rows. */
  key: string;
  /** Verbatim `<Pillar>_Scorecard!A{row}` text. */
  indicator: string;
  /** Verbatim `<Pillar>_Scorecard!B{row}` value. */
  maxPoints: number;
};

export type EsgScorecardPillar = "environmental" | "social" | "governance";

/** `E_Scorecard!A5:B29` — 20 scored rows, Σ column B = 108. */
export const E_SCORECARD_INDICATORS = [
  {
    "row": 5,
    "key": "d5",
    "indicator": "GHG: Scope 1 baseline established & tracked",
    "maxPoints": 5
  },
  {
    "row": 6,
    "key": "d6",
    "indicator": "GHG: Scope 1 reduction vs prior year",
    "maxPoints": 10
  },
  {
    "row": 7,
    "key": "d7",
    "indicator": "GHG: Scope 2 net reduction (solar offset)",
    "maxPoints": 8
  },
  {
    "row": 8,
    "key": "d8",
    "indicator": "GHG: Scope 3 tracking initiated",
    "maxPoints": 5
  },
  {
    "row": 9,
    "key": "d9",
    "indicator": "GHG: Net-zero target formally set (SBTi)",
    "maxPoints": 5
  },
  {
    "row": 11,
    "key": "d11",
    "indicator": "Energy: kWh data tracked monthly (all 5 depots)",
    "maxPoints": 5
  },
  {
    "row": 12,
    "key": "d12",
    "indicator": "Energy: Energy efficiency improvement YoY",
    "maxPoints": 5
  },
  {
    "row": 13,
    "key": "d13",
    "indicator": "Energy: % renewable electricity ≥20%",
    "maxPoints": 8
  },
  {
    "row": 15,
    "key": "d15",
    "indicator": "Fleet: L/100km within norm (all vehicles)",
    "maxPoints": 8
  },
  {
    "row": 16,
    "key": "d16",
    "indicator": "Fleet: Fleet CO₂ per tonne-km tracked",
    "maxPoints": 5
  },
  {
    "row": 17,
    "key": "d17",
    "indicator": "Fleet: EV vehicles as % of fleet",
    "maxPoints": 5
  },
  {
    "row": 19,
    "key": "d19",
    "indicator": "Waste: Diversion rate ≥75% (target 91%+)",
    "maxPoints": 5
  },
  {
    "row": 20,
    "key": "d20",
    "indicator": "Waste: Cardboard recycling tracked (Cority)",
    "maxPoints": 4
  },
  {
    "row": 21,
    "key": "d21",
    "indicator": "Waste: Landfill tCO₂e tracked",
    "maxPoints": 3
  },
  {
    "row": 23,
    "key": "d23",
    "indicator": "Water: Monthly consumption tracked (all depots)",
    "maxPoints": 4
  },
  {
    "row": 24,
    "key": "d24",
    "indicator": "Water: Water efficiency initiative active",
    "maxPoints": 3
  },
  {
    "row": 26,
    "key": "d26",
    "indicator": "ISO 14001: Certification achieved/in progress",
    "maxPoints": 8
  },
  {
    "row": 27,
    "key": "d27",
    "indicator": "ISO 14001: Aspects register maintained",
    "maxPoints": 4
  },
  {
    "row": 28,
    "key": "d28",
    "indicator": "Environmental policy — board approved",
    "maxPoints": 4
  },
  {
    "row": 29,
    "key": "d29",
    "indicator": "NEMA/NWA/NEMWA legal compliance",
    "maxPoints": 4
  }
] as EsgScorecardIndicator[];

/** `S_Scorecard!A5:B27` — 19 scored rows, Σ column B = 100. */
export const S_SCORECARD_INDICATORS = [
  {
    "row": 5,
    "key": "d5",
    "indicator": "EE: % Black employees (all levels) vs 60% target",
    "maxPoints": 8
  },
  {
    "row": 6,
    "key": "d6",
    "indicator": "EE: % Black female management (L1-L3) vs 30%",
    "maxPoints": 6
  },
  {
    "row": 7,
    "key": "d7",
    "indicator": "EE: EE Plan submitted & compliant",
    "maxPoints": 5
  },
  {
    "row": 8,
    "key": "d8",
    "indicator": "EE: % Persons with Disabilities vs 2%",
    "maxPoints": 5
  },
  {
    "row": 9,
    "key": "d9",
    "indicator": "EE: EE forum/TD consultation active",
    "maxPoints": 3
  },
  {
    "row": 10,
    "key": "d10",
    "indicator": "EE: EE numerical targets set and tracked",
    "maxPoints": 3
  },
  {
    "row": 12,
    "key": "d12",
    "indicator": "WSP: WSP submitted to SETA on time",
    "maxPoints": 5
  },
  {
    "row": 13,
    "key": "d13",
    "indicator": "WSP: ATR submitted on time",
    "maxPoints": 5
  },
  {
    "row": 14,
    "key": "d14",
    "indicator": "WSP: Training hours per employee ≥40 hours",
    "maxPoints": 5
  },
  {
    "row": 15,
    "key": "d15",
    "indicator": "WSP: Mandatory grant recovery ≥80%",
    "maxPoints": 5
  },
  {
    "row": 17,
    "key": "d17",
    "indicator": "H&S: LTIFR ≤ 2.0",
    "maxPoints": 8
  },
  {
    "row": 18,
    "key": "d18",
    "indicator": "H&S: Zero fatalities",
    "maxPoints": 8
  },
  {
    "row": 19,
    "key": "d19",
    "indicator": "H&S: Driver fatigue programme active",
    "maxPoints": 5
  },
  {
    "row": 20,
    "key": "d20",
    "indicator": "H&S: Incident investigation rate 100%",
    "maxPoints": 4
  },
  {
    "row": 22,
    "key": "d22",
    "indicator": "Community: CSI/SED spend ≥1% NPAT",
    "maxPoints": 5
  },
  {
    "row": 23,
    "key": "d23",
    "indicator": "Community: Social calendar initiatives ≥6 pa",
    "maxPoints": 5
  },
  {
    "row": 24,
    "key": "d24",
    "indicator": "Community: Local labour procurement ≥40%",
    "maxPoints": 5
  },
  {
    "row": 26,
    "key": "d26",
    "indicator": "Supplier: IMS-T-149 H&S compliance ≥80%",
    "maxPoints": 5
  },
  {
    "row": 27,
    "key": "d27",
    "indicator": "Supplier: Supplier food safety rating",
    "maxPoints": 5
  }
] as EsgScorecardIndicator[];

/** `G_Scorecard!A5:B25` — 14 scored rows, Σ column B = 100. */
export const G_SCORECARD_INDICATORS = [
  {
    "row": 5,
    "key": "d5",
    "indicator": "King V: Score ≥70% (Apply & Explain)",
    "maxPoints": 25
  },
  {
    "row": 6,
    "key": "d6",
    "indicator": "King V: Social & Ethics Committee established",
    "maxPoints": 5
  },
  {
    "row": 7,
    "key": "d7",
    "indicator": "King V: ESG-linked executive remuneration",
    "maxPoints": 5
  },
  {
    "row": 9,
    "key": "d9",
    "indicator": "IFRS: S1/S2 disclosures prepared",
    "maxPoints": 10
  },
  {
    "row": 10,
    "key": "d10",
    "indicator": "IFRS: Climate risk in board agenda",
    "maxPoints": 5
  },
  {
    "row": 12,
    "key": "d12",
    "indicator": "GARP: ERM framework includes ESG/climate risks",
    "maxPoints": 8
  },
  {
    "row": 14,
    "key": "d14",
    "indicator": "GARP: GRAP public interest compliance",
    "maxPoints": 5
  },
  {
    "row": 16,
    "key": "d16",
    "indicator": "ISO 27001: POPIA Information Officer appointed",
    "maxPoints": 5
  },
  {
    "row": 17,
    "key": "d17",
    "indicator": "ISO 27001: Cyber/data risk assessed",
    "maxPoints": 5
  },
  {
    "row": 19,
    "key": "d19",
    "indicator": "Transparency: ESG/Integrated report published",
    "maxPoints": 8
  },
  {
    "row": 20,
    "key": "d20",
    "indicator": "Transparency: External assurance of ESG report",
    "maxPoints": 5
  },
  {
    "row": 22,
    "key": "d22",
    "indicator": "Ethics: Code of ethics + hotline active",
    "maxPoints": 4
  },
  {
    "row": 24,
    "key": "d24",
    "indicator": "Compliance: Legal register maintained",
    "maxPoints": 5
  },
  {
    "row": 25,
    "key": "d25",
    "indicator": "Compliance: No material regulatory penalties",
    "maxPoints": 5
  }
] as EsgScorecardIndicator[];

export const SCORECARD_INDICATORS = {
  environmental: E_SCORECARD_INDICATORS,
  social: S_SCORECARD_INDICATORS,
  governance: G_SCORECARD_INDICATORS,
} as const;

/* ------------------------------------------------------------------------- *
 * Derived accessors — the only supported way to obtain ESG maxima.
 * Nothing downstream should re-declare a points table; call these instead.
 * ------------------------------------------------------------------------- */

const INDICATOR_INDEX: Record<EsgScorecardPillar, Map<string, EsgScorecardIndicator>> = {
  environmental: new Map(E_SCORECARD_INDICATORS.map((i) => [i.key, i])),
  social: new Map(S_SCORECARD_INDICATORS.map((i) => [i.key, i])),
  governance: new Map(G_SCORECARD_INDICATORS.map((i) => [i.key, i])),
};

/** Look up one indicator by pillar + row key (`"d13"`). `undefined` if unknown. */
export function esgIndicator(
  pillar: EsgScorecardPillar,
  key: string,
): EsgScorecardIndicator | undefined {
  return INDICATOR_INDEX[pillar].get(key);
}

/**
 * Column-B maximum for one indicator.
 *
 * Throws on an unknown key rather than returning 0: a typo in a nav score group
 * or a calculator row must surface as a hard failure, not as a badge that
 * silently under-reports its denominator.
 */
export function esgIndicatorMaxPoints(pillar: EsgScorecardPillar, key: string): number {
  const found = esgIndicator(pillar, key);
  if (!found) {
    const valid = SCORECARD_INDICATORS[pillar].map((i) => i.key).join(", ");
    throw new Error(
      `Unknown ESG indicator "${key}" for pillar "${pillar}". Valid keys: ${valid}`,
    );
  }
  return found.maxPoints;
}

/** Σ column B over the given indicator keys — for nav sub-section denominators. */
export function sumIndicatorMaxPoints(pillar: EsgScorecardPillar, keys: readonly string[]): number {
  return keys.reduce((sum, key) => sum + esgIndicatorMaxPoints(pillar, key), 0);
}

/** Σ column B over a whole pillar. Derived, never typed by hand: E=108, S=100, G=100. */
export function esgPillarMaxPoints(pillar: EsgScorecardPillar): number {
  return SCORECARD_INDICATORS[pillar].reduce((sum, i) => sum + i.maxPoints, 0);
}

/**
 * Pillar maxima derived from column B. Must equal `ESG_PILLAR_MAX` in
 * `esgScoringDefaults.ts` and `PILLAR_MAX_*` in `esgConfig/consumer-goods.ts`;
 * `__tests__/esgPointsSingleSourceOfTruth.test.ts` asserts all three agree.
 */
export const ESG_SCORECARD_PILLAR_MAX: Record<EsgScorecardPillar, number> = {
  environmental: esgPillarMaxPoints("environmental"),
  social: esgPillarMaxPoints("social"),
  governance: esgPillarMaxPoints("governance"),
};
