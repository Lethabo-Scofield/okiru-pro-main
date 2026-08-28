import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { missingIssuesForEsgSection } from "@/lib/esgValidation";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

const PAGE = readFileSync(
  path.resolve(__dirname, "../../../pages/EsgInformationRequest.tsx"),
  "utf8",
);

describe("missingIssuesForEsgSection", () => {
  it("returns only failing submit rules for the requested section", () => {
    const wb: EsgWorkbookData = {
      companyId: "C-1",
      sections: {
        assumptions: { cells: {} },
        "company-reporting-setup": { cells: { entity: "Acme" } },
      },
    };
    const missing = missingIssuesForEsgSection(wb, {}, "assumptions");
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((i) => i.sectionId === "assumptions")).toBe(true);
    expect(missing.some((i) => i.label.toLowerCase().includes("sector"))).toBe(true);
  });
});

describe("EsgInformationRequest section hints UI", () => {
  it("renders section missing panel and tab badges", () => {
    expect(PAGE).toMatch(/EsgSectionMissingPanel/);
    expect(PAGE).toMatch(/tab-missing-/);
    // The validation box now renders alongside the hints — reversed on explicit
    // user request (2026-08-28); see EsgInformationRequest.test.ts.
    expect(PAGE).toMatch(/EsgValidationPanel/);
  });
});
