import { describe, expect, it } from "vitest";
import { deriveGenderFromSaId } from "../saIdGender";

describe("deriveGenderFromSaId", () => {
  it("returns Female when digit 7 is 0–4", () => {
    expect(deriveGenderFromSaId("9001010001087")).toBe("Female");
  });

  it("returns Male when digit 7 is 5–9", () => {
    expect(deriveGenderFromSaId("9001015001087")).toBe("Male");
  });

  it("returns null for invalid length", () => {
    expect(deriveGenderFromSaId("12345")).toBeNull();
  });
});
