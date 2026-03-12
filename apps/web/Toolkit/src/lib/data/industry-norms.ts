export const industryNormsData = [
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
export const quartersList = Array.from(new Set(industryNormsData.map(d => d.quarter))).sort((a, b) => b.localeCompare(a));
