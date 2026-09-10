import { describe, expect, it } from "vitest";
import {
  companyNameFromWorkEmail,
  isWorkEmail,
  usernameFromWorkEmail,
} from "../workEmail";

describe("work email registration helpers", () => {
  it.each(["person@gmail.com", "person@outlook.com", "person@outlook.co.za", "person@yahoo.co.uk", "person@icloud.com"])(
    "rejects the public provider %s",
    (email) => expect(isWorkEmail(email)).toBe(false),
  );

  it.each([
    ["jane@acme.co.za", "Acme"],
    ["john@north-star.com", "North Star"],
    ["lee@sample-company.co.uk", "Sample Company"],
  ])("derives a company name from %s", (email, expected) => {
    expect(companyNameFromWorkEmail(email)).toBe(expected);
  });

  it("creates a stable internal username without exposing another input", () => {
    expect(usernameFromWorkEmail("Jane.Doe@Acme.co.za")).toBe("jane.doe.acme.co.za");
  });
});
