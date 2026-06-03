import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const APP_TSX = readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");

describe("EsgToolkit header navigation", () => {
  it("uses absolute app path for Companies back link", () => {
    expect(APP_TSX).toMatch(/esgClientsHref\(\)/);
    expect(APP_TSX).toMatch(/external/);
    expect(APP_TSX).toMatch(/data-testid="esg-nav-back-clients"/);
    expect(APP_TSX).not.toMatch(/href="\/esg\/clients"/);
    expect(APP_TSX).not.toMatch(/ESG_CLIENTS_HREF/);
  });

  it("uses EsgAppLink for cross-flow header links", () => {
    expect(APP_TSX).toMatch(/EsgAppLink/);
    expect(APP_TSX).toMatch(/esgCreateHref\(companyId\)/);
    expect(APP_TSX).toMatch(/esgSummaryHref\(companyId\)/);
  });
});
