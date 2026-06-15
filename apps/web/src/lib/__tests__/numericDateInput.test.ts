import { describe, it, expect } from "vitest";
import {
  isoToNumericDateDisplay,
  numericDateDisplayToIso,
} from "../numericDateInput";

describe("numericDateInput", () => {
  it("displays ISO dates with numeric month", () => {
    expect(isoToNumericDateDisplay("2026-01-28")).toBe("28/1/2026");
    expect(isoToNumericDateDisplay("2026-02-28")).toBe("28/2/2026");
  });

  it("parses dd/m/yyyy to ISO", () => {
    expect(numericDateDisplayToIso("28/2/2026")).toBe("2026-02-28");
    expect(numericDateDisplayToIso("1/3/2025")).toBe("2025-03-01");
  });
});
