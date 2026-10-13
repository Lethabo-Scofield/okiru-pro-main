/**
 * Which documents fill which part of the workbook (C1). Every section offers
 * "Add documents to this section", so every section must name the evidence
 * that fills it, in codes the reader and the upload screen both know.
 */
import { describe, expect, it } from "vitest";
import { ESG_INPUT_SECTIONS } from "@/lib/esg/esgSections";
import { esgFocusElements } from "@/components/esg/EsgElementDocumentBatches";
import { ESG_ELEMENT_SECTIONS, esgElementsForSection, esgUploadFocus } from "../esgSectionElements";

const SECTION_IDS = ESG_INPUT_SECTIONS.map((s) => s.id);

describe("ESG_ELEMENT_SECTIONS — the evidence behind each section", () => {
  it("gives every workbook section at least one kind of document", () => {
    const orphans = SECTION_IDS.filter((id) => esgElementsForSection(id).length === 0);
    expect(orphans).toEqual([]);
  });

  it("names only sections the workbook has", () => {
    const unknown = Object.values(ESG_ELEMENT_SECTIONS)
      .flat()
      .filter((id) => !SECTION_IDS.includes(id));
    expect(unknown).toEqual([]);
  });

  it("speaks the upload screen's element codes, so a filed batch reaches the reader", () => {
    for (const element of Object.keys(ESG_ELEMENT_SECTIONS)) {
      expect(esgFocusElements(["file.pdf"], { "file.pdf": element })).toEqual({ "file.pdf": element });
    }
  });
});

describe("esgUploadFocus — what adding documents from a section reads and writes", () => {
  it("keeps a single-element section to its own evidence", () => {
    expect(esgUploadFocus("waste", "Waste register")).toEqual({
      sectionId: "waste",
      title: "Waste register",
      elements: ["WASTE"],
      sections: ["waste"],
    });
  });

  it("lets fleet documents fill the diesel grid too — the pillar, not the tab", () => {
    const focus = esgUploadFocus("fleet", "Fleet register");
    expect(focus.elements).toEqual(["FLEET"]);
    expect([...focus.sections].sort()).toEqual(["driver-debrief", "e-data", "fleet"]);
  });

  it("reads every environmental kind of document from Environmental data", () => {
    const focus = esgUploadFocus("e-data", "Environmental data");
    expect([...focus.elements].sort()).toEqual(["FLEET", "GHG_ENERGY", "WATER"]);
    expect(focus.sections[0]).toBe("e-data");
    expect(focus.sections).not.toContain("waste");
    expect(focus.sections).not.toContain("g-data");
  });

  it("never lets a governance upload write the environmental pillar", () => {
    const focus = esgUploadFocus("g-data", "Governance data");
    expect(focus.sections).not.toContain("e-data");
    expect(focus.sections).not.toContain("fleet");
  });
});
