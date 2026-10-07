/**
 * @vitest-environment jsdom
 *
 * Dark is the signed-in app's default theme (Brian, 7 October 2026). Light is
 * for the public pages and for whoever saved it.
 *
 * A merge once made the whole app light-only, and one of the three files it
 * changed (ThemeContext.tsx) merged without a conflict, so nobody was asked.
 * The default is pinned here rather than remembered.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { ThemeProvider as ToolkitThemeProvider } from "../../../Toolkit/src/components/theme-provider";
import { ThemeProvider as AppThemeProvider, useTheme as useAppTheme } from "../ThemeContext";

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root().className = "";
  root().removeAttribute("style");
});

afterEach(() => cleanup());

describe("the theme provider", () => {
  it("opens dark when nothing is saved and no default is passed", () => {
    render(<ToolkitThemeProvider storageKey="theme-test">x</ToolkitThemeProvider>);
    expect(root().classList.contains("dark")).toBe(true);
    expect(root().style.getPropertyValue("--ef-bg")).toBe("#08090b");
  });

  it("keeps a saved light choice — the default is not a lock", () => {
    localStorage.setItem("theme-test", "light");
    render(<ToolkitThemeProvider storageKey="theme-test">x</ToolkitThemeProvider>);
    expect(root().classList.contains("light")).toBe(true);
  });

  it("keeps a saved dark choice — it is not deleted on load", () => {
    localStorage.setItem("theme-test", "dark");
    render(<ToolkitThemeProvider storageKey="theme-test">x</ToolkitThemeProvider>);
    expect(root().classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme-test")).toBe("dark");
  });

  it("renders the public pages light, whatever is saved", () => {
    localStorage.setItem("theme-test", "dark");
    render(
      <ToolkitThemeProvider storageKey="theme-test" lightOnlyPaths={() => true}>
        x
      </ToolkitThemeProvider>,
    );
    expect(root().classList.contains("light")).toBe(true);
    expect(localStorage.getItem("theme-test")).toBe("dark");
  });
});

describe("the app's theme context", () => {
  it("is dark", () => {
    let isDark: boolean | undefined;
    function Probe() {
      isDark = useAppTheme().isDark;
      return null;
    }
    render(
      <AppThemeProvider>
        <Probe />
      </AppThemeProvider>,
    );
    expect(isDark).toBe(true);
  });
});

describe("every app entry point", () => {
  const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../..", rel), "utf8");

  it.each(["src/App.tsx", "src/pages/ToolkitView.tsx", "Toolkit/src/App.tsx"])("%s opens dark", (file) => {
    const providers = read(file).match(/<ThemeProvider\b[^>]*>/g) ?? [];
    expect(providers.length).toBeGreaterThan(0);
    for (const tag of providers) expect(tag).toContain('defaultTheme="dark"');
  });
});
