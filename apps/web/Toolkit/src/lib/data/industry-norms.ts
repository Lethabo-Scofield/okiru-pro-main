export const industryNormsData = [
  // ---------------------------------------------------------------------------
  // Issued 2026-06-30 — Stats SA P0044 Quarterly Financial Statistics (March
  // 2026 publication), rolling year Q2 2025 – Q1 2026. Norm = ΣNPAT ÷ ΣTurnover
  // across the four quarters. Source: docs/NPAT industries norms.xlsx (Sheet1).
  // Next publication: 2026-09-30.
  // ---------------------------------------------------------------------------
  {
    date: "2026-06-30",
    quarter: "Q1 2026",
    industry: "All industries",
    norm: 6.55
  },
  {
    date: "2026-06-30",
    quarter: "Q1 2026",
    industry: "Mining and quarrying industry",
    norm: 13.05
  },
  {
    date: "2026-06-30",
    quarter: "Q1 2026",
    industry: "Manufacturing industry",
    norm: 5.17
  },
  {
    date: "2026-06-30",
    quarter: "Q1 2026",
    industry: "Electricity, gas and water supply",
    norm: 14.74
  },
  {
    date: "2026-06-30",
    quarter: "Q1 2026",
    industry: "Construction",
    norm: 1.94
  },
  {
    date: "2026-06-30",
    quarter: "Q1 2026",
    industry: "Trade",
    norm: 4.42
  },
  {
    date: "2026-06-30",
    quarter: "Q1 2026",
    industry: "Transport, storage and communication",
    norm: 5.98
  },
  {
    date: "2026-06-30",
    quarter: "Q1 2026",
    industry: "Real estate and other business services (excluding financial intermediation and insurance)",
    norm: 10.89
  },
  {
    date: "2026-06-30",
    quarter: "Q1 2026",
    industry: "Community, social and personal services",
    norm: 8.05
  },
  {
    date: "2025-06-27",
    quarter: "Q2 2025",
    industry: "All industries",
    norm: 5.76
  },
  {
    date: "2025-06-27",
    quarter: "Q2 2025",
    industry: "Mining and quarrying industry",
    norm: 10.05
  },
  {
    date: "2025-06-27",
    quarter: "Q2 2025",
    industry: "Manufacturing industry",
    norm: 5.78
  },
  {
    date: "2025-06-27",
    quarter: "Q2 2025",
    industry: "Electricity, gas and water supply",
    norm: 8.50
  },
  {
    date: "2025-06-27",
    quarter: "Q2 2025",
    industry: "Construction",
    norm: 3.20
  },
  {
    date: "2025-06-27",
    quarter: "Q2 2025",
    industry: "Trade",
    norm: 4.10
  },
  {
    date: "2025-06-27",
    quarter: "Q2 2025",
    industry: "Transport, storage and communication",
    norm: 6.80
  },
  {
    date: "2025-06-27",
    quarter: "Q2 2025",
    industry: "Real estate and other business services (excluding financial intermediation and insurance)",
    norm: 7.20
  },
  {
    date: "2025-06-27",
    quarter: "Q2 2025",
    industry: "Community, social and personal services",
    norm: -1.50
  },
  {
    date: "2024-12-31",
    quarter: "Q4 2024",
    industry: "All industries",
    norm: 5.60
  },
  {
    date: "2024-12-31",
    quarter: "Q4 2024",
    industry: "Mining and quarrying industry",
    norm: 9.80
  },
  {
    date: "2024-12-31",
    quarter: "Q4 2024",
    industry: "Manufacturing industry",
    norm: 5.50
  },
  {
    date: "2024-12-31",
    quarter: "Q4 2024",
    industry: "Real estate and other business services (excluding financial intermediation and insurance)",
    norm: 7.00
  },
  {
    date: "2023-09-30",
    quarter: "Q3 2023",
    industry: "All industries",
    norm: 5.58
  }
];

export const industriesList = Array.from(new Set(industryNormsData.map(d => d.industry))).sort();

/** Chronological key for "Qn YYYY" labels (lexical sort put "Q2 2025" above "Q1 2026"). */
function quarterKey(q: string): number {
  const m = /Q(\d)\s+(\d{4})/.exec(q);
  return m ? Number(m[2]) * 4 + Number(m[1]) : 0;
}

export const quartersList = Array.from(new Set(industryNormsData.map(d => d.quarter))).sort(
  (a, b) => quarterKey(b) - quarterKey(a),
);
