/**
 * Regression — SpreadsheetGrid inline edit must not call .select() on <select>
 * elements (HTMLSelectElement has no select/setSelectionRange methods).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const gridSrc = readFileSync(
  path.resolve(__dirname, "../SpreadsheetGrid.tsx"),
  "utf8",
);

describe("SpreadsheetGrid edit focus — select-safe", () => {
  it("guards el.select() so HTMLSelectElement edit controls do not throw", () => {
    expect(gridSrc).toMatch(/typeof el\.select === ["']function["']/);
    expect(gridSrc).toMatch(/typeof el\.setSelectionRange === ["']function["']/);
    expect(gridSrc).toContain("HTMLSelectElement has no .select()");
    expect(gridSrc).toMatch(
      /editInputRef = useRef<HTMLInputElement \| HTMLSelectElement>/,
    );
  });

  it("renders <select> with column options for select and yesNo columns", () => {
    expect(gridSrc).toMatch(
      /col\.type === ["']select["'] \|\| isYesNoColumn\(col\)[\s\S]*?<select/,
    );
    expect(gridSrc).toMatch(
      /isYesNoColumn\(col\) \? \["Yes", "No"\] : col\.options/,
    );
  });

  it("ghost rows use the same select editor for select columns", () => {
    const ghostBlock = gridSrc.slice(gridSrc.indexOf("const renderGhostRow"));
    expect(ghostBlock).toMatch(
      /col\.type === ["']select["'] \|\| isYesNoColumn\(col\)[\s\S]*?<select/,
    );
  });

  it("commits select values synchronously with the chosen option (no blur race)", () => {
    expect(gridSrc).toContain("commitSelectEdit");
    expect(gridSrc).toMatch(/commitSelectEdit\(e\.target\.value\)/);
    expect(gridSrc).toMatch(/commitEdit\(undefined, value\)/);
    expect(gridSrc).not.toMatch(/setTimeout\(\(\) => commitEdit\(\), 0\)/);
    const selectBlocks = gridSrc.match(/<select[\s\S]*?<\/select>/g) ?? [];
    for (const block of selectBlocks) {
      expect(block).not.toMatch(/onBlur=\{.*commitEdit/);
    }
  });
});
