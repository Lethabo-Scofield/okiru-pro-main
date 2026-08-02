import { afterEach, describe, expect, it, vi } from "vitest";
import { canAccessEsgToolkit } from "../esgAccess";

/**
 * The contract after the fail-open cleanup: an EMPTY allowlist means every
 * authenticated user passes; a CONFIGURED allowlist is actually enforced.
 * (The old version merged a hardcoded default address, so the env var could
 * never gate anything and the "allowlist" was pretense — dead-code audit 6.)
 */
describe("canAccessEsgToolkit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("with no allowlist configured, allows any authenticated identity", () => {
    expect(canAccessEsgToolkit({ email: "brian.lawu@okiru.co.za" })).toBe(true);
    expect(canAccessEsgToolkit({ username: "demo.user" })).toBe(true);
  });

  it("denies unauthenticated or identity-less users", () => {
    expect(canAccessEsgToolkit(null)).toBe(false);
    expect(canAccessEsgToolkit({})).toBe(false);
  });

  it("enforces the allowlist when one is configured", () => {
    vi.stubEnv("VITE_ESG_PREVIEW_ALLOWLIST", "alpha@okiru.co.za, beta@okiru.co.za");
    expect(canAccessEsgToolkit({ email: "alpha@okiru.co.za" })).toBe(true);
    expect(canAccessEsgToolkit({ email: "Beta@okiru.co.za" })).toBe(true);
    expect(canAccessEsgToolkit({ email: "outsider@example.com" })).toBe(false);
  });
});
