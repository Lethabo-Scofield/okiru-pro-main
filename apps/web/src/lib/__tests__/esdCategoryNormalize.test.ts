import { describe, expect, it } from "vitest";
import { normalizeCellForColumn } from "../tabularNormalize";
import { ESD_COLUMNS } from "@/components/workbook/sections";
import { suggestSelectOption } from "../selectOptionMatch";

const esdCategoryCol = ESD_COLUMNS.find((c) => c.key === "esdCategory")!;

describe("ESD category normalization", () => {
  for (const [raw, expected] of [
    ["SD", "Supplier Development"],
    ["ED", "Enterprise Development"],
    ["Supplier Development", "Supplier Development"],
    ["Enterprise Development", "Enterprise Development"],
    ["enterprise", "Enterprise Development"],
    ["supplier dev", "Supplier Development"],
  ] as const) {
    it(`maps "${raw}" → "${expected}"`, () => {
      const cell = normalizeCellForColumn(raw, esdCategoryCol);
      expect(cell.value).toBe(expected);
      const fuzzy = suggestSelectOption(raw, esdCategoryCol.options!, "esdCategory");
      expect(fuzzy.suggestion).toBe(expected);
    });
  }
});
