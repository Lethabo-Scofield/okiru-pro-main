import { describe, expect, it } from "vitest";
import { suggestSelectOption, formatDidYouMeanMessage } from "../selectOptionMatch";

const DESIGNATIONS = [
  "Executive Director",
  "Non-executive Director",
  "Other Executive Manager",
  "Senior Manager",
  "Middle Manager",
  "Junior Manager",
  "Semi-skilled",
  "Unskilled",
];

describe("suggestSelectOption — designation", () => {
  it("maps Senior management to Senior Manager", () => {
    const result = suggestSelectOption("Senior management", DESIGNATIONS, "designation");
    expect(result.suggestion).toBe("Senior Manager");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("maps parenthetical shorthand to Senior Manager", () => {
    const result = suggestSelectOption("(Senior Manager)", DESIGNATIONS, "designation");
    expect(result.suggestion).toBe("Senior Manager");
  });

  it("maps synonym snr management to Senior Manager", () => {
    const result = suggestSelectOption("snr management", DESIGNATIONS, "designation");
    expect(result.suggestion).toBe("Senior Manager");
  });

  it("returns null for unrelated values", () => {
    const result = suggestSelectOption("Accountant", DESIGNATIONS, "designation");
    expect(result.suggestion).toBeNull();
  });
});

describe("formatDidYouMeanMessage", () => {
  it("includes both raw and suggested values", () => {
    const msg = formatDidYouMeanMessage("Senior management", "Senior Manager");
    expect(msg).toContain("Senior management");
    expect(msg).toContain("Senior Manager");
    expect(msg.toLowerCase()).toContain("did you mean");
  });
});

describe("suggestSelectOption — middle management", () => {
  it("maps middle management to Middle Manager", () => {
    const result = suggestSelectOption("middle management", DESIGNATIONS, "designation");
    expect(result.suggestion).toBe("Middle Manager");
  });
});

describe("suggestSelectOption — race", () => {
  const RACES = ["African", "Coloured", "Indian", "White"];

  it("maps Black umbrella label to African workbook option", () => {
    const result = suggestSelectOption("Black", RACES, "race");
    expect(result.suggestion).toBe("African");
    expect(result.confidence).toBe(1);
  });
});
