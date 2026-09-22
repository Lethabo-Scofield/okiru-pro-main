/**
 * Regression — route table (Task #4 verification).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { matchRoute } from "wouter";
import { parse as parsePattern } from "regexparam";
import { ESG_CLIENTS_PATH, esgClientsHref } from "@/lib/esgRoutes";

const APP_TSX = readFileSync(
  path.resolve(__dirname, "../App.tsx"),
  "utf8",
);

function hasRoute(p: string): boolean {
  return new RegExp(`<Route\\s+path=["']${p}["']`).test(APP_TSX);
}

describe("App.tsx route declarations", () => {
  it("declares /hub", () => {
    expect(hasRoute("/hub")).toBe(true);
  });

  it("declares /dashboard", () => {
    expect(hasRoute("/dashboard")).toBe(true);
  });

  /**
   * Each product gets a door of its own, and behind it a workspace: the
   * consultant's companies for that product, with "create scorecard" inside.
   * `/bbbee` and `/esg` are aliases of the existing pages while the real
   * workspace pages are built; the old paths keep working throughout.
   */
  it("declares a door per product, and a create route behind each", () => {
    expect(hasRoute("/bbbee")).toBe(true);
    expect(hasRoute("/bbbee/new")).toBe(true);
    expect(hasRoute("/esg")).toBe(true);
    expect(hasRoute("/esg/new")).toBe(true);
  });

  it("declares /access alongside /workspace for people and permissions", () => {
    expect(hasRoute("/access")).toBe(true);
    expect(hasRoute("/workspace")).toBe(true);
  });

  it("declares /certificates", () => {
    expect(hasRoute("/certificates")).toBe(true);
  });

  it("declares /super-admin (SuperAdmin route, Task #18 area 8 verification)", () => {
    expect(hasRoute("/super-admin")).toBe(true);
  });

  it("does NOT declare /test (falls through to NotFound)", () => {
    expect(hasRoute("/test")).toBe(false);
  });

  it("declares ESG routes — clients, inputs, summary, toolkit", () => {
    expect(hasRoute("/esg")).toBe(true);
    expect(hasRoute("/esg/clients")).toBe(true);
    expect(hasRoute("/esg/toolkit")).toBe(true);
    expect(hasRoute("/esg/toolkit/:companyId")).toBe(true);
    expect(hasRoute("/esg/create/:companyId")).toBe(true);
    expect(hasRoute("/esg/create/:companyId/summary")).toBe(true);
    expect(APP_TSX).toMatch(/EsgInformationRequest/);
    expect(APP_TSX).not.toMatch(/path="\/esg\/create.*nest/);
    expect(APP_TSX).toMatch(/EsgScoreSummary/);
    expect(APP_TSX).not.toMatch(/EsgSectionEditor/);
    expect(APP_TSX).not.toMatch(/EsgToolkitRedirect/);
    expect(APP_TSX).not.toMatch(/EsgFlowStepper/);
    expect(APP_TSX).toMatch(/EsgPreviewRoute/);
  });

  /**
   * The toolkit's "back to companies" link now lands on the ESG workspace.
   * `/esg/clients` is still routed, so old links keep resolving, but it is no
   * longer a second company list to keep in step with the first.
   */
  it("sends toolkit back-navigation to the ESG workspace", () => {
    expect(ESG_CLIENTS_PATH).toBe("/esg/clients");
    expect(esgClientsHref()).toBe("/esg");
    expect(hasRoute("/esg/clients")).toBe(true);
  });
});

/**
 * Regression — every place the app navigates to must be a place it can render.
 *
 * The create-scorecard flow built its next URL from the path it was entered
 * on: from `/bbbee/new` it sent the user to `/bbbee/new/C-98220`. No such
 * route is declared, so the client was created and then the screen went to
 * 404 — the work was done and the user was told the page doesn't exist.
 *
 * A wrong path is invisible until someone walks it, and it only shows up at
 * the end of a flow, after the write. So rather than pin this one route, read
 * every navigation target in the app and check it against the route table.
 */
describe("every navigation target resolves to a declared route", () => {
  const SRC = path.resolve(__dirname, "..");

  /** The declared table as `[pattern, isNested]`; a nested route matches loosely. */
  const DECLARED: Array<[string, boolean]> = [
    ...APP_TSX.matchAll(/<Route\s+path="([^"]+)"(\s+nest)?/g),
  ].map((m) => [m[1], Boolean(m[2])]);

  /**
   * The route that would render `target`, or null if none would.
   *
   * This asks wouter rather than re-implementing it. `matchRoute` with the
   * default parser is what `<Route>` runs, so a path rejected here is a path
   * the running app answers with the 404 page — which is what a consultant
   * saw after their scorecard had already been created.
   */
  function resolve(target: string): string | null {
    for (const [pattern, nested] of DECLARED) {
      if (matchRoute(parsePattern, pattern, target, nested)[0]) return pattern;
    }
    return null;
  }

  /** A path built by gluing segments onto a variable: unknowable, and unrouted. */
  const VARIABLE_PREFIX = "(a variable, then more path)";

  /**
   * A path with `${...}` in it, reduced to what is knowable at rest.
   *
   * An interpolation that fills a whole segment is an id and stands in for any
   * value. One glued to other text — `/auth${query}` — is not a segment at
   * all, and nothing can be said about it, so it is skipped rather than
   * guessed at.
   *
   * A path that STARTS with an interpolation and then adds segments is the bug
   * itself, so it is reported rather than skipped: whatever the variable holds,
   * the result is a path nobody declared. Navigating to a whole path held in a
   * variable stays fine — the variable is a route then, not a prefix.
   */
  function staticPath(raw: string): string | null {
    const marked = raw.replace(/\$\{[^}]*\}/g, "\u0000").split("?")[0].split("#")[0];
    const seg = marked.split("/").filter(Boolean);
    if (seg[0] === "\u0000") return seg.length > 1 ? VARIABLE_PREFIX : null;
    if (!marked.startsWith("/")) return null; // relative, or inside a nested router
    if (seg.some((s) => s.includes("\u0000") && s !== "\u0000")) return null;
    return `/${seg.map((s) => (s === "\u0000" ? ":id" : s)).join("/")}`;
  }

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
      return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [full] : [];
    });
  }

  const GOES_TO =
    /(?:navigate|setLocation)\(\s*(?:`([^`]*)`|"(\/[^"]*)"|'(\/[^']*)')|href=\{?["`](\/[^"`{}\s]*)["`]/g;

  it("finds no route the app sends people to but cannot render", () => {
    const unrouted: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(GOES_TO)) {
        const raw = m[1] ?? m[2] ?? m[3] ?? m[4];
        const target = raw ? staticPath(raw) : null;
        if (target && (target === VARIABLE_PREFIX || !resolve(target))) {
          unrouted.push(`${path.relative(SRC, file).split(path.sep).join("/")} → ${target}`);
        }
      }
    }
    expect(unrouted).toEqual([]);
  });

  /**
   * The shape the bug took: a path whose first segment is a variable. Every
   * route in the table starts with a literal, so such a path can never match
   * one — `${basePath}/${id}` was unroutable on the day it was written.
   */
  it("treats a path built from a variable prefix as unroutable", () => {
    expect(staticPath("${basePath}/${id}")).toBe(VARIABLE_PREFIX);
    expect(resolve("/:id/:id")).toBeNull();
    // A variable holding a whole route, with only a query after it, is a
    // different thing and stays allowed: that is how one workspace component
    // opens `/bbbee/new?start=documents` and `/esg/new?start=documents`.
    expect(staticPath("${createHref}?start=${id}")).toBeNull();
  });

  it("sends a newly created company to the route that renders its workbook", () => {
    const flow = readFileSync(path.resolve(SRC, "pages/InformationRequest.tsx"), "utf8");
    expect(flow).toMatch(/navigate\(`\/create-scorecard\/\$\{encodeURIComponent\(id\)\}`/);
    expect(flow).not.toMatch(/navigate\(`\$\{basePath\}\//);
    expect(resolve("/create-scorecard/C-98220")).toBe("/create-scorecard/:companyId");
    // The URL the 404 was reported on.
    expect(resolve("/bbbee/new/C-98220")).toBeNull();
  });
});
