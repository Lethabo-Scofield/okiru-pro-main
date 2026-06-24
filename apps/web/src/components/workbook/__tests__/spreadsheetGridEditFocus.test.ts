/**
 * Regression — SpreadsheetGrid inline edit must not attempt text selection on
 * controls that don't support it:
 *  - <select> has no select()/setSelectionRange() methods, and
 *  - <input type="number|date|email|...">  HAS those methods but THROWS
 *    InvalidStateError when called, which crashed the whole app via the
 *    ErrorBoundary the moment a numeric grid cell was edited.
 * Selection must be gated on the input *type*, not just method presence.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const gridSrc = readFileSync(
  path.resolve(__dirname, "../SpreadsheetGrid.tsx"),
  "utf8",
);

describe("SpreadsheetGrid edit focus — select-safe", () => {
  it("gates selection on selectable input types so number/select cells don't throw", () => {
    // The whitelist of text-selectable input types must exist...
    expect(gridSrc).toContain("SELECTABLE_INPUT_TYPES");
    // ...and selection must be guarded by (HTMLInputElement && type is selectable),
    // not merely by the presence of a setSelectionRange method.
    expect(gridSrc).toMatch(
      /el instanceof HTMLInputElement && SELECTABLE_INPUT_TYPES\.has\(el\.type\)/,
    );
    // number inputs (type "number") must NOT be in the selectable set.
    const setBlock = gridSrc.slice(
      gridSrc.indexOf("SELECTABLE_INPUT_TYPES = new Set("),
      gridSrc.indexOf("SELECTABLE_INPUT_TYPES = new Set(") + 200,
    );
    expect(setBlock).not.toContain('"number"');
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
