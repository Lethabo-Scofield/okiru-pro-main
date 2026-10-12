/**
 * The bar's trail names the company, not its id: the ESG workbook showed
 * "ESG › C-ESG-1 › Workbook" above a page that drew a second trail with the
 * name. The page says the name; the bar shows it while that id is in the path.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setShellCompanyName, shellCompanyNameFor } from "../shellCompanyName";
import { buildCrumbs } from "../shellNav";

afterEach(() => setShellCompanyName("", null));

describe("the company in the trail", () => {
  it("is the name the page gave, only while that company's id is in the path", () => {
    setShellCompanyName("C-1", "Example Co");
    expect(shellCompanyNameFor("/esg/create/C-1")).toBe("Example Co");
    expect(shellCompanyNameFor("/esg/create/C-1/summary?x=1")).toBe("Example Co");
    expect(shellCompanyNameFor("/esg/create/C-2")).toBeNull();
    expect(buildCrumbs("/esg/create/C-1", shellCompanyNameFor("/esg/create/C-1")).map((c) => c.label)).toEqual([
      "Hub",
      "ESG",
      "Example Co",
      "Workbook",
    ]);
  });

  it("falls back to the id when no page has named it", () => {
    expect(shellCompanyNameFor("/esg/create/C-1")).toBeNull();
    expect(buildCrumbs("/esg/create/C-1", null)[2].label).toBe("C-1");
  });
});
