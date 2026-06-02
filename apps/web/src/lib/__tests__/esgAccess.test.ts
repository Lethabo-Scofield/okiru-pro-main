import { describe, expect, it } from "vitest";
import { canAccessEsgToolkit, ESG_DEFAULT_ALLOWLIST } from "../esgAccess";

describe("canAccessEsgToolkit", () => {
  it("allows Chengetai default email", () => {
    expect(canAccessEsgToolkit({ email: ESG_DEFAULT_ALLOWLIST[0] })).toBe(true);
  });

  it("allows any email containing brian (case insensitive)", () => {
    expect(canAccessEsgToolkit({ email: "brian.lawu@okiru.co.za" })).toBe(true);
    expect(canAccessEsgToolkit({ email: "Brian.Test@example.com" })).toBe(true);
  });

  it("denies other users", () => {
    expect(canAccessEsgToolkit({ email: "zmnanzana@okiru.co.za" })).toBe(false);
    expect(canAccessEsgToolkit(null)).toBe(false);
  });
});
