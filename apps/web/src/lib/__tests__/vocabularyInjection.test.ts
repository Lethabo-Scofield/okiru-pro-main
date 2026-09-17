/**
 * The general mechanism behind every dropdown: a remembered closed-vocabulary
 * decision is applied at injection exactly like a synonym, and only after the
 * deterministic maps miss.
 */
import { describe, expect, it } from "vitest";
import { injectIntoSection, vocabularyDecisionKey } from "../workbookInjection";

describe("injectIntoSection — vocabulary decisions place what the lists could not", () => {
  it("applies a remembered decision for a wording no map knows", () => {
    const vocabulary = { [vocabularyDecisionKey("contributionType", "School feeding scheme")]: "Grant Contribution" };
    const without = injectIntoSection("sed", [{ field: "contributionType", value: "School feeding scheme" }]);
    const withDecision = injectIntoSection("sed", [{ field: "contributionType", value: "School feeding scheme" }], { vocabulary });
    expect(without.rejected.some((r) => r.field === "contributionType")).toBe(true);
    expect(withDecision.cells.contributionType).toBe("Grant Contribution");
  });

  it("never lets a decision name an option the dropdown does not have", () => {
    const vocabulary = { [vocabularyDecisionKey("contributionType", "Mystery")]: "Not An Option" };
    const result = injectIntoSection("sed", [{ field: "contributionType", value: "Mystery" }], { vocabulary });
    expect(result.cells.contributionType).toBeUndefined();
    expect(result.rejected.some((r) => r.field === "contributionType")).toBe(true);
  });

  it("deterministic maps still win before any decision is consulted", () => {
    const vocabulary = { [vocabularyDecisionKey("designation", "Senior Manager")]: "Junior Manager" };
    const result = injectIntoSection("management-control", [{ field: "designation", value: "Senior Manager" }], { vocabulary });
    expect(result.cells.designation).toBe("Senior Manager");
  });
});
