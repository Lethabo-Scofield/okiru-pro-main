/**
 * Maps workbook section keys to workspace pillar scope keys.
 */
export const SECTION_TO_PILLAR: Record<string, string | null> = {
  "company-information": null,
  "financial-information": null,
  "afs-additions": "accessToFinancialServices",
  ownership: "ownership",
  "management-control": "management",
  employees: "employmentEquity",
  "skills-development": "skills",
  procurement: "procurement",
  suppliers: "procurement",
  esd: "supplierDevelopment",
  sed: "sed",
};

export function sectionKeyToPillar(sectionKey: string): string | null {
  return SECTION_TO_PILLAR[sectionKey] ?? null;
}

export function isFoundationSection(sectionKey: string): boolean {
  return sectionKey === "company-information" || sectionKey === "financial-information";
}
