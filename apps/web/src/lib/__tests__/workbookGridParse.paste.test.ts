import { describe, expect, it } from "vitest";
import {
  expandClipboardMatrix,
  getClipboardPasteShape,
  applyPasteToRows,
  parseClipboardMatrix,
} from "../workbookGridParse";
import type { ColumnDef } from "@/components/workbook/sections";

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "First Name", type: "text", width: 120 },
  { key: "designation", label: "Designation", type: "select", options: ["Senior Manager", "Junior Manager"], width: 160 },
  { key: "race", label: "Race", type: "select", options: ["African", "White"], width: 100 },
];

describe("getClipboardPasteShape", () => {
  it("detects column vector pastes", () => {
    expect(getClipboardPasteShape([["A"], ["B"], ["C"]])).toBe("column");
  });

  it("detects row vector pastes", () => {
    expect(getClipboardPasteShape([["A", "B", "C"]])).toBe("row");
  });
});

describe("expandClipboardMatrix", () => {
  it("splits multiline single cell into rows", () => {
    const matrix = expandClipboardMatrix([["Senior Manager\nMiddle Manager\nJunior Manager"]]);
    expect(matrix).toEqual([["Senior Manager"], ["Middle Manager"], ["Junior Manager"]]);
  });
});

describe("parseClipboardMatrix empty cells", () => {
  it("preserves empty interior cells (a\\t\\tb)", () => {
    expect(parseClipboardMatrix("a\t\tb\n")).toEqual([["a", "", "b"]]);
  });

  it("preserves leading empty cells", () => {
    expect(parseClipboardMatrix("\t\ta\tb\n")).toEqual([["", "", "a", "b"]]);
  });

  it("preserves trailing empty cells", () => {
    expect(parseClipboardMatrix("a\tb\t\t\n")).toEqual([["a", "b", "", ""]]);
  });
});

describe("applyPasteToRows empty cells", () => {
  const cols: ColumnDef[] = [
    { key: "first", label: "First", type: "text" },
    { key: "middle", label: "Middle", type: "text" },
    { key: "last", label: "Last", type: "text" },
  ];

  it("writes empty cell into middle column", () => {
    const existing = [{ _id: "r1", first: "X", middle: "Y", last: "Z" }];
    const matrix = parseClipboardMatrix("a\t\tb\n");
    const next = applyPasteToRows(existing, cols, matrix, { row: 0, col: 0 }, false);
    expect(next[0].first).toBe("a");
    expect(next[0].middle).toBe("");
    expect(next[0].last).toBe("b");
  });
});

describe("applyPasteToRows — column paste", () => {
  it("pastes designation column into anchor column only", () => {
    const existing = [
      { _id: "r1", name: "Alice", designation: "", race: "" },
      { _id: "r2", name: "Bob", designation: "", race: "" },
    ];
    const matrix = parseClipboardMatrix("Senior Manager\nJunior Manager");
    const next = applyPasteToRows(existing, COLUMNS, matrix, { row: 0, col: 1 }, false);
    expect(next[0].designation).toBe("Senior Manager");
    expect(next[1].designation).toBe("Junior Manager");
    expect(next[0].name).toBe("Alice");
    expect(next[0].race).toBe("");
  });
});
