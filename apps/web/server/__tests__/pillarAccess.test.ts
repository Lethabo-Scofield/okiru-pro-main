/**
 * Workbook pillar-scope enforcement (audit B15, workbook half).
 *
 * The property under test: the workbook surface honours the SAME scopes as the
 * client read path and the apps/api writes — a pillar-scoped collaborator sees
 * and writes only their pillar, meta sections read for everyone but write only
 * with full access, viewers write nothing, unknown sections are CLOSED, and
 * the scorecard sync (the most cross-pillar write) needs full access.
 */
import { describe, expect, it } from "vitest";
import {
  canSyncScorecard,
  canWriteSection,
  filterReadableSections,
  type PillarAccess,
} from "../pillarAccess";

const scoped = (...scopes: string[]): PillarAccess => ({ mode: "scoped", scopes });
const SECTIONS = {
  "ownership": { rows: [1] },
  "management-control": { rows: [2] },
  "skills-development": { rows: [3] },
  "procurement": { rows: [4] },
  "esd": { rows: [5] },
  "sed": { rows: [6] },
  "company-information": { meta: { name: "X" } },
  "financial-information": { meta: { tmps: 1 } },
};

describe("reading", () => {
  it("full access and read-only see everything; no overlay sees everything", () => {
    expect(filterReadableSections({ mode: "full" }, SECTIONS)).toEqual(SECTIONS);
    expect(filterReadableSections({ mode: "readOnly" }, SECTIONS)).toEqual(SECTIONS);
    expect(filterReadableSections(null, SECTIONS)).toEqual(SECTIONS);
  });

  it("a skills-scoped member reads skills plus the meta sections only", () => {
    const visible = filterReadableSections(scoped("skills"), SECTIONS);
    expect(Object.keys(visible).sort()).toEqual([
      "company-information", "financial-information", "skills-development",
    ]);
  });

  it("scope synonyms reach across the shared pillars (esd → SD/ED; management ↔ EE)", () => {
    const viaEsd = filterReadableSections(scoped("supplierDevelopment"), SECTIONS);
    expect(Object.keys(viaEsd)).toContain("esd");
    const viaEe = filterReadableSections(scoped("employmentEquity"), SECTIONS);
    expect(Object.keys(viaEe)).toContain("management-control");
  });

  it("an empty scope (bound workspace, not a member) reads only the meta sections", () => {
    const visible = filterReadableSections(scoped(), SECTIONS);
    expect(Object.keys(visible).sort()).toEqual(["company-information", "financial-information"]);
  });
});

describe("writing sections", () => {
  it("scoped members write their pillar and nothing else", () => {
    expect(canWriteSection(scoped("procurement"), "procurement")).toBe(true);
    expect(canWriteSection(scoped("procurement"), "ownership")).toBe(false);
  });

  it("meta sections are cross-pillar: full access only", () => {
    // Financials are the denominators every pillar scores from.
    expect(canWriteSection(scoped("procurement"), "financial-information")).toBe(false);
    expect(canWriteSection(scoped("procurement"), "company-information")).toBe(false);
    expect(canWriteSection({ mode: "full" }, "financial-information")).toBe(true);
    expect(canWriteSection(null, "financial-information")).toBe(true);
  });

  it("viewers write nothing", () => {
    expect(canWriteSection({ mode: "readOnly" }, "procurement")).toBe(false);
  });

  it("an unknown section is CLOSED for scoped members, not open", () => {
    expect(canWriteSection(scoped("procurement"), "mystery-section")).toBe(false);
  });
});

describe("scorecard sync", () => {
  it("requires full access — it rewrites every pillar at once", () => {
    expect(canSyncScorecard({ mode: "full" })).toBe(true);
    expect(canSyncScorecard(null)).toBe(true);
    expect(canSyncScorecard({ mode: "readOnly" })).toBe(false);
    expect(canSyncScorecard(scoped("ownership", "skills"))).toBe(false);
  });
});
