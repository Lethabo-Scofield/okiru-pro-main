import { describe, expect, it } from "vitest";
import {
  expandClipboardMatrix,
  getClipboardPasteShape,
  applyPasteToRows,
  coerceCellValue,
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

/**
 * Regression: SA-locale decimals use a COMMA (9,09 = 9.09). Clipboard paste used
 * to fall back to comma as a column delimiter when no tab was present, tearing a
 * single value across two columns (Zoleka, 22 Jun: voting rights "9.09% got
 * broken apart" / SED "number after the comma goes to the next column").
 */
describe("comma-decimal clipboard (SA locale)", () => {
  it("does NOT split a single comma-decimal value across columns", () => {
    expect(parseClipboardMatrix("9,09")).toEqual([["9,09"]]);
    expect(parseClipboardMatrix("9,09\n10,5")).toEqual([["9,09"], ["10,5"]]);
  });

  it("still splits genuine tab-delimited columns", () => {
    expect(parseClipboardMatrix("9,09\t2026-01-01")).toEqual([["9,09", "2026-01-01"]]);
  });

  it("pastes a comma-decimal into a number column as 9.09, leaving the next column untouched", () => {
    const cols: ColumnDef[] = [
      { key: "votingRights", label: "Voting Rights (%)", type: "number" },
      { key: "startDate", label: "Start Date", type: "date" },
    ];
    const existing = [{ _id: "r1", votingRights: "", startDate: "" }];
    const matrix = parseClipboardMatrix("9,09");
    const next = applyPasteToRows(existing, cols, matrix, { row: 0, col: 0 }, false);
    expect(next[0].votingRights).toBe(9.09);
    expect(next[0].startDate).toBe("");
  });
});

/**
 * Regression: pasting a Yes/No column must keep every row, including "No".
 * A "No" coerces to boolean false; the row-keep guard must still count it as
 * data (else "No" rows were silently dropped and the rest shifted up).
 */
describe("yes/no column paste keeps every row", () => {
  const cols: ColumnDef[] = [
    { key: "isDisabled", label: "Disabled", type: "select", options: ["Yes", "No"], yesNoBoolean: true },
  ];

  it("writes Yes/No/No in order without dropping the No rows", () => {
    const existing = [
      { _id: "r1", isDisabled: "" },
      { _id: "r2", isDisabled: "" },
      { _id: "r3", isDisabled: "" },
    ];
    const matrix = expandClipboardMatrix(parseClipboardMatrix("Yes\nNo\nNo"));
    const next = applyPasteToRows(existing, cols, matrix, { row: 0, col: 0 }, false);
    expect(next.map((r) => r.isDisabled)).toEqual([true, false, false]);
  });

  it("does not shift values up when the first pasted cell is No", () => {
    const existing = [
      { _id: "r1", isDisabled: "" },
      { _id: "r2", isDisabled: "" },
    ];
    const matrix = expandClipboardMatrix(parseClipboardMatrix("No\nYes"));
    const next = applyPasteToRows(existing, cols, matrix, { row: 0, col: 0 }, false);
    expect(next.map((r) => r.isDisabled)).toEqual([false, true]);
  });
});

describe("coerceCellValue — number/yes-no coercion", () => {
  const numCol: ColumnDef = { key: "amount", label: "Amount", type: "number" };
  const yesNoCol: ColumnDef = {
    key: "isDisabled",
    label: "Disabled",
    type: "select",
    options: ["Yes", "No"],
    yesNoBoolean: true,
  };

  it("parses SA-locale decimal and thousands separators", () => {
    expect(coerceCellValue("amount", numCol, "9,09")).toBe(9.09);
    expect(coerceCellValue("amount", numCol, "1 234,56")).toBe(1234.56);
    expect(coerceCellValue("amount", numCol, "R 1 000,00")).toBe(1000);
  });

  it("coerces pasted yes/no into booleans for yesNoBoolean columns", () => {
    expect(coerceCellValue("isDisabled", yesNoCol, "yes")).toBe(true);
    expect(coerceCellValue("isDisabled", yesNoCol, "No")).toBe(false);
    // Empty stays unset (blank), not forced to No.
    expect(coerceCellValue("isDisabled", yesNoCol, "")).toBe("");
  });
});
