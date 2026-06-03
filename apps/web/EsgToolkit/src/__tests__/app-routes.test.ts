/**
 * Toolkit is results-only — no workbook section editor routes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const APP_TSX = readFileSync(
  path.resolve(__dirname, "../App.tsx"),
  "utf8",
);

describe("EsgToolkit App routes (results only)", () => {
  it("does not mount EsgSectionEditor or register input routes", () => {
    expect(APP_TSX).not.toMatch(/EsgSectionEditor/);
    expect(APP_TSX).not.toMatch(/EsgRegisterGridEditor/);
    expect(APP_TSX).not.toMatch(/esg-environmental-data/);
    expect(APP_TSX).not.toMatch(/path="\/assumptions"/);
    expect(APP_TSX).not.toMatch(/path="\/ghg"/);
    expect(APP_TSX).not.toMatch(/path="\/fleet"/);
    expect(APP_TSX).not.toMatch(/path="\/king5"/);
  });

  it("only exposes dashboard, scorecards, and analysis views", () => {
    expect(APP_TSX).toMatch(/EsgDashboard/);
    expect(APP_TSX).toMatch(/path="\/environmental"/);
    expect(APP_TSX).toMatch(/path="\/social"/);
    expect(APP_TSX).toMatch(/path="\/governance"/);
    expect(APP_TSX).toMatch(/path="\/net-zero"/);
    expect(APP_TSX).toMatch(/path="\/carbon-tax"/);
    expect(APP_TSX).toMatch(/path="\/iso-14083"/);
    expect(APP_TSX).toMatch(/path="\/bbbee-bridge"/);
  });

  it("links workbook edits to main app create flow", () => {
    expect(APP_TSX).toMatch(/esgCreateHref/);
  });
});
