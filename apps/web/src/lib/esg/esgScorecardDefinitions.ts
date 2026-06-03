/** Auto-aligned to docs/esg/extracted/*_Scorecard.json (v1.7) */
export type EsgScorecardIndicator = {
  row: number;
  key: string;
  indicator: string;
  maxPoints: number;
};

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
