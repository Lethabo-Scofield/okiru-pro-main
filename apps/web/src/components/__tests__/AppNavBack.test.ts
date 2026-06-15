import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const APP_NAV_BACK = readFileSync(
  path.resolve(__dirname, "../../components/AppNavBack.tsx"),
  "utf8",
);

describe("AppNavBack external navigation", () => {
  it("supports external prop for native anchor escape from nested routers", () => {
    expect(APP_NAV_BACK).toMatch(/external\?: boolean/);
    expect(APP_NAV_BACK).toMatch(/if \(props\.external\)/);
    expect(APP_NAV_BACK).toMatch(/<a href=\{props\.href\}/);
  });
});
