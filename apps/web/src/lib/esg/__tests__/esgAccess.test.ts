import { describe, expect, it } from "vitest";
import { canAccessEsgToolkit, ESG_DEFAULT_ALLOWLIST } from "../esgAccess";

describe("canAccessEsgToolkit", () => {
  it("allows any authenticated user with an email", () => {
    expect(canAccessEsgToolkit({ email: ESG_DEFAULT_ALLOWLIST[0] })).toBe(true);
    expect(canAccessEsgToolkit({ email: "brian.lawu@okiru.co.za" })).toBe(true);
    expect(canAccessEsgToolkit({ email: "zmnanzana@okiru.co.za" })).toBe(true);
  });

  it("allows username when email is absent", () => {
    expect(canAccessEsgToolkit({ username: "demo.user" })).toBe(true);
  });

  it("denies unauthenticated or identity-less users", () => {
    expect(canAccessEsgToolkit(null)).toBe(false);
    expect(canAccessEsgToolkit({})).toBe(false);
  });
});
