import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { buildGoldenSections } from "../../../../server/esgGoldenFixture";
import { canSeedEsgSampleData } from "../esgAccess";
import { ESG_INPUT_SECTIONS } from "../esgSections";

const WEB_SRC = path.resolve(__dirname, "../../..");
const APP_ROOT = path.resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(path.resolve(APP_ROOT, rel), "utf8");
}

const USER_FACING_FILES = [
  "src/pages/EsgInformationRequest.tsx",
  "src/pages/EsgScoreSummary.tsx",
  "src/pages/EsgClientSelector.tsx",
  "EsgToolkit/src/pages/EsgDashboard.tsx",
  "EsgToolkit/src/pages/EsgToolkitSectionPage.tsx",
  "EsgToolkit/src/components/EsgReportScopePanel.tsx",
];

describe("sample data never carries client identity", () => {
  it("strips the source client's name from every seeded cell", () => {
    const sections = buildGoldenSections();
    const offenders: string[] = [];
    for (const [id, section] of Object.entries(sections)) {
      for (const [key, value] of Object.entries(section.cells)) {
        if (typeof value === "string" && /SG\s*Consumer|SuperGroup/i.test(value)) {
          offenders.push(`${id}.${key} = ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still seeds the full workbook with numeric parity cells intact", () => {
    const sections = buildGoldenSections();
    expect(Object.keys(sections).length).toBeGreaterThanOrEqual(9);
    const eData = sections["e-data"]?.cells ?? {};
    const numeric = Object.values(eData).filter((v) => typeof v === "number");
    expect(numeric.length).toBeGreaterThan(20);
  });

  it("labels de-identified depots readably rather than blanking them", () => {
    const cells = buildGoldenSections()["e-data"]?.cells ?? {};
    const depot = cells.s1a_depot_0;
    expect(typeof depot).toBe("string");
    expect(String(depot)).toContain("Sample Company");
  });
});

describe("sample-data seeding is admin-gated", () => {
  it("only admins may seed on the client", () => {
    expect(canSeedEsgSampleData({ role: "admin" })).toBe(true);
    expect(canSeedEsgSampleData({ role: "super_admin" })).toBe(true);
    expect(canSeedEsgSampleData({ role: "user" })).toBe(false);
    expect(canSeedEsgSampleData({ role: null })).toBe(false);
    expect(canSeedEsgSampleData(null)).toBe(false);
  });

  it("the server route requires an admin role and an explicit confirm", () => {
    const src = read("server/esgWorkbookRoutes.ts");
    const seedBlock = src.slice(src.indexOf("/seed-demo"), src.indexOf("/seed-demo") + 1200);
    expect(seedBlock).toMatch(/role !== "admin"/);
    expect(seedBlock).toMatch(/confirm !== true/);
    expect(seedBlock).toMatch(/403/);
  });

  it("both demo buttons are admin-gated and confirm before replacing data", () => {
    for (const rel of [
      "src/pages/EsgInformationRequest.tsx",
      "EsgToolkit/src/pages/EsgDashboard.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).toMatch(/isEsgAdmin \?/);
      expect(src, rel).toMatch(/window\.confirm\(/);
      expect(src, rel).not.toMatch(/SG Consumer/);
    }
  });
});

describe("no repo-internal or spreadsheet jargon in user-facing copy", () => {
  it("never references markdown docs or repo paths", () => {
    for (const rel of USER_FACING_FILES) {
      expect(read(rel), rel).not.toMatch(/ESG_FLOW_ONTOLOGY|docs\/esg|\.md\b/);
    }
  });

  it("never says 'golden fixture' to a user", () => {
    for (const rel of USER_FACING_FILES) {
      expect(read(rel), rel).not.toMatch(/golden fixture/i);
    }
  });

  it("does not render raw sheet names or cell coordinates", () => {
    expect(read("EsgToolkit/src/pages/EsgToolkitSectionPage.tsx")).not.toMatch(/page\.sheet/);
    expect(read("EsgToolkit/src/pages/EsgDashboard.tsx")).not.toMatch(/\(D9\)|ESG_Dashboard parity/);
  });

  it("keeps section notes free of workbook coordinates", () => {
    for (const section of ESG_INPUT_SECTIONS) {
      if (!section.note) continue;
      expect(section.note, section.id).not.toMatch(/THR_\*|rows \d+–\d+|Column [A-Z]:|_Data\b/);
    }
  });
});

describe("irreversible actions are honest", () => {
  it("does not promise an admin unlock that has no implementation", () => {
    expect(read("src/pages/EsgInformationRequest.tsx")).not.toMatch(/Unlock via admin/);
    const server = read("server/esgWorkbookRoutes.ts");
    expect(server).not.toMatch(/\/unlock/);
  });

  it("confirms before submitting and locking", () => {
    const src = read("EsgToolkit/src/pages/EsgDashboard.tsx");
    const submitBlock = src.slice(src.indexOf("const submit ="), src.indexOf("const submit =") + 500);
    expect(submitBlock).toMatch(/window\.confirm\(/);
    expect(submitBlock).toMatch(/cannot be edited/i);
  });
});

describe("ESG access gating fails closed", () => {
  it("denies access when the access endpoint errors", () => {
    const src = readFileSync(path.resolve(WEB_SRC, "hooks/useEsgAccess.ts"), "utf8");
    expect(src).not.toMatch(/canAccessEsgToolkit/);
    expect(src).toMatch(/setAllowed\(false\)/);
  });
});
