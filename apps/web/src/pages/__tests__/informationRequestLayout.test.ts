/**
 * "The B-BBEE review still looks narrow."
 *
 * The review step and the workbook grid are working surfaces and take the
 * screen; the calm steps stay a narrow card. These pin the widths per view and
 * prove, with Tailwind's own scanner and compiler, that the stylesheet built
 * from this source really carries every rule the layout depends on — a class
 * that is written but never generated widens nothing, and only a real browser
 * (see the screenshot harness) would ever show it.
 */
import { describe, expect, it, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import {
  SETUP_CARD_CLASS,
  SETUP_SHELL_CLASS,
  WORKBOOK_COLUMNS_CLASS,
  WORKBOOK_TOOLBAR_CLASS,
  informationRequestMainClass,
  informationRequestView,
} from "../informationRequestLayout";

const tokens = (cls: string) => cls.split(/\s+/).filter(Boolean);
const WIDE = "has-[[data-wide-review]]:";

describe("which width each view gets", () => {
  const view = (picked: boolean, flow: boolean, summary = false, estimate = false) =>
    informationRequestView({ isCreateScorecardFlow: flow, picked, isSummaryStep: summary, isEstimateStep: estimate });

  it("names the view from the page's own facts", () => {
    expect(view(false, true)).toBe("start");
    expect(view(false, false)).toBe("picker");
    expect(view(true, true)).toBe("workbook");
    expect(view(true, true, true)).toBe("score");
    expect(view(true, true, false, true)).toBe("score");
  });

  it("does not cap the workbook: its register grids take the screen", () => {
    const main = tokens(informationRequestMainClass("workbook"));
    expect(main.some((t) => t.startsWith("max-w-"))).toBe(false);
    expect(main).toEqual(expect.arrayContaining(["px-4", "sm:px-6"]));
  });

  it("leaves the start step's width to its shell, and keeps the score pages at reading width", () => {
    expect(tokens(informationRequestMainClass("start")).some((t) => t.startsWith("max-w-"))).toBe(false);
    expect(tokens(informationRequestMainClass("score"))).toContain("max-w-[1400px]");
    expect(tokens(informationRequestMainClass("picker"))).toContain("max-w-[1400px]");
  });
});

describe("the create step while the review is on screen", () => {
  it("keeps the calm steps narrow and drops the cap, gutter and extra top space for the review", () => {
    const shell = tokens(SETUP_SHELL_CLASS);
    expect(shell).toContain("max-w-[980px]");
    expect(shell).toEqual(expect.arrayContaining([`${WIDE}max-w-none`, `${WIDE}px-0`]));
    // The 1760px cap is what still left a centred column on a 1920px screen.
    expect(shell.some((t) => /max-w-\[1760px\]/.test(t))).toBe(false);
  });

  it("stops being a card, so the review's own frame is the surface", () => {
    expect(tokens(SETUP_CARD_CLASS)).toEqual(
      expect.arrayContaining([
        `${WIDE}border-transparent`,
        `${WIDE}bg-transparent`,
        `${WIDE}shadow-none`,
        `${WIDE}px-0`,
        `${WIDE}py-0`,
      ]),
    );
  });
});

describe("the workbook on a phone", () => {
  it("stretches the open section to the column instead of sizing it to the widest register", () => {
    const cols = tokens(WORKBOOK_COLUMNS_CLASS);
    expect(cols).toContain("lg:items-start");
    expect(cols).not.toContain("items-start");
  });

  it("wraps the toolbar instead of widening the page", () => {
    expect(tokens(WORKBOOK_TOOLBAR_CLASS)).toContain("flex-wrap");
  });
});

describe("the stylesheet built from this source", () => {
  let css = "";
  beforeAll(async () => {
    const pagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const scanner = new Scanner({ sources: [{ base: pagesDir, pattern: "informationRequestLayout.ts", negated: false }] });
    const candidates = scanner.scan();
    const compiler = await compile('@import "tailwindcss";', { base: pagesDir, onDependency: () => {} });
    css = compiler.build(candidates);
  });

  /** The rule block for one class, as Tailwind writes it (selector escaped). */
  function ruleFor(cls: string): string {
    const selector = "." + cls.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
    const at = css.indexOf(`${selector} {`);
    if (at < 0) return "";
    let depth = 0;
    for (let i = css.indexOf("{", at); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) return css.slice(at, i + 1);
    }
    return "";
  }

  it.each([
    [`${WIDE}max-w-none`, /max-width:\s*none/],
    [`${WIDE}px-0`, /padding-inline:\s*calc\(var\(--spacing\) \* 0\)/],
    [`${WIDE}py-0`, /padding-block:\s*calc\(var\(--spacing\) \* 0\)/],
    [`${WIDE}border-transparent`, /border-color:\s*transparent/],
    [`${WIDE}bg-transparent`, /background-color:\s*transparent/],
  ])("generates %s, applied only while a review is inside", (cls, declaration) => {
    const rule = ruleFor(cls);
    expect(rule).toMatch(/:has\(/);
    expect(rule).toMatch(/\[data-wide-review\]/);
    expect(rule).toMatch(declaration);
  });

  it("keeps the calm steps' 980px column", () => {
    expect(ruleFor("max-w-[980px]")).toMatch(/max-width:\s*980px/);
  });

  it("aligns the workbook columns to the top only side by side", () => {
    const rule = ruleFor("lg:items-start");
    expect(rule).toMatch(/@media/);
    expect(rule).toMatch(/align-items:\s*flex-start/);
  });
});
