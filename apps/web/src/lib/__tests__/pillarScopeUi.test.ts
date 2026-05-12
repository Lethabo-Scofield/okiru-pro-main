import { describe, it, expect } from "vitest";
import {
  expandScopeToVisibleIds,
  getCalculatorPillarCodesForScopes,
  filterScorecardPillarRows,
  filterSubMinimumsByScope,
  sumPillarRows,
} from "../pillarScopeUi";

describe("pillarScopeUi", () => {
  it("expandScopeToVisibleIds maps employmentEquity to management only", () => {
    const s = expandScopeToVisibleIds(["employmentEquity", "skills"]);
    expect(s.has("management")).toBe(true);
    expect(s.has("skills")).toBe(true);
    expect(s.has("employmentEquity")).toBe(false);
  });

  it("getCalculatorPillarCodesForScopes expands management and supplier mappings", () => {
    const codes = getCalculatorPillarCodesForScopes(["management", "supplierDevelopment"]);
    expect(codes.has("managementControl")).toBe(true);
    expect(codes.has("employmentEquity")).toBe(true);
    expect(codes.has("supplierDevelopment")).toBe(true);
    expect(codes.has("enterpriseSupplierDevelopment")).toBe(true);
  });

  it("filterScorecardPillarRows returns all rows when no scopes", () => {
    const rows = [
      { code: "ownership", label: "O", score: 1, maxPoints: 10 },
      { code: "skillsDevelopment", label: "S", score: 2, maxPoints: 20 },
    ];
    expect(filterScorecardPillarRows(rows, null)).toEqual(rows);
    expect(filterScorecardPillarRows(rows, [])).toEqual(rows);
  });

  it("filterScorecardPillarRows filters by scope keys", () => {
    const rows = [
      { code: "ownership", label: "O", score: 1, maxPoints: 10 },
      { code: "skillsDevelopment", label: "S", score: 2, maxPoints: 20 },
    ];
    const out = filterScorecardPillarRows(rows, ["skills"]);
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe("skillsDevelopment");
  });

  it("filterSubMinimumsByScope passes through when no scopes", () => {
    const sm = { ownership: true, skillsDevelopment: false };
    expect(filterSubMinimumsByScope(sm, null)).toEqual(sm);
    expect(filterSubMinimumsByScope(sm, [])).toEqual(sm);
  });

  it("filterSubMinimumsByScope keeps only pillars in scope", () => {
    const sm = { ownership: true, skillsDevelopment: false, preferentialProcurement: true };
    const out = filterSubMinimumsByScope(sm, ["skills"]);
    expect(out).toEqual({ skillsDevelopment: false });
  });

  it("sumPillarRows adds score and maxPoints", () => {
    expect(
      sumPillarRows([
        { score: 1.25, maxPoints: 10 },
        { score: 2, maxPoints: 15 },
      ]),
    ).toEqual({ score: 3.25, maxPoints: 25 });
  });
});
