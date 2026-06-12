import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const gridSrc = readFileSync(
  path.resolve(__dirname, "../SpreadsheetGrid.tsx"),
  "utf8",
);

describe("SpreadsheetGrid rendering regressions", () => {
  it("keeps blank spreadsheet rows visible instead of showing an empty state", () => {
    expect(gridSrc).toContain("const MIN_VISIBLE_ROWS = 10");
    expect(gridSrc).toContain("const visibleRows = useMemo");
    expect(gridSrc).toContain("visibleRows.map");
    expect(gridSrc).not.toContain('data-testid="empty-state"');
    expect(gridSrc).not.toContain("No rows yet. Click");
  });

  it("uses text inputs for numeric cells so selection APIs do not crash", () => {
    expect(gridSrc).toContain('type="text"');
    expect(gridSrc).toContain('inputMode={col.type === "number" ? "decimal" : undefined}');
    expect(gridSrc).not.toContain('type="number"');
  });
});
