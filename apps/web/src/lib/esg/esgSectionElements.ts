/**
 * Which evidence elements fill which workbook sections (C1).
 *
 * Adding documents from inside a section — the Fleet register, the waste
 * register, the governance data — should fill that part of the workbook and
 * nothing else. "That part" is the section's PILLAR, not the section alone: a
 * fleet fuel report fills the fleet register AND the Scope 1A diesel grid in
 * Environmental data, and keeping it to the register would throw its litres
 * away. So the unit is the element, and each element names every section its
 * figures land in.
 *
 * The element codes are the parser's (`okiru-ai-parser/schemas/
 * esg_document_matrix.ts`) and the upload screen's batches.
 */

export const ESG_ELEMENT_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  GHG_ENERGY: ["e-data"],
  WATER: ["e-data"],
  FLEET: ["fleet", "e-data", "driver-debrief"],
  WASTE: ["waste"],
  ISO_ENVIRONMENTAL: ["iso-tracker"],
  EMPLOYMENT_EQUITY: ["ee", "s-data"],
  HEALTH_SAFETY: ["s-data", "driver-debrief"],
  TRAINING: ["s-data", "s-data-ofo"],
  COMMUNITY_CSI: ["s-data-csi", "s-data"],
  SUPPLIER_ESG: ["saq"],
  BOARD_GOVERNANCE: ["g-data", "king5"],
  ETHICS_COMPLIANCE: ["g-data"],
  RISK_ASSURANCE: ["g-data", "garp", "ifrs"],
  FINANCIAL: ["assumptions", "company-reporting-setup", "s-data"],
};

/** The elements whose documents fill a section. */
export function esgElementsForSection(sectionId: string): string[] {
  return Object.entries(ESG_ELEMENT_SECTIONS)
    .filter(([, sections]) => sections.includes(sectionId))
    .map(([element]) => element);
}

export interface EsgUploadFocus {
  /** The section the person added documents from. */
  sectionId: string;
  title: string;
  /** Its elements — the one a lone element names is the reader's hint for every file. */
  elements: readonly string[];
  /** Everywhere its documents may write: every section its elements fill. */
  sections: readonly string[];
}

/** What "Add documents" from inside a section reads for and writes to. */
export function esgUploadFocus(sectionId: string, title: string): EsgUploadFocus {
  const elements = esgElementsForSection(sectionId);
  const sections = new Set<string>([sectionId]);
  for (const element of elements) for (const s of ESG_ELEMENT_SECTIONS[element] ?? []) sections.add(s);
  return { sectionId, title, elements, sections: Array.from(sections) };
}
