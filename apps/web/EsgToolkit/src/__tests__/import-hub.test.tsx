// @vitest-environment jsdom
/**
 * Data Import is the upload hub (C6): every way data gets into the company's
 * workbook from one page — documents, a workbook, the templates.
 */
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import EsgImport from "../pages/EsgImport";
import { useEsgStore } from "../lib/esgStore";

afterEach(() => cleanup());

describe("EsgImport — the upload hub", () => {
  it("offers documents, a workbook and the templates for the company in hand", () => {
    useEsgStore.setState({ companyId: "co 1" } as never);
    render(<EsgImport />);
    const href = (id: string) => screen.getByTestId(id).getAttribute("href") ?? "";
    expect(href("esg-import-documents")).toBe("/esg/create/co%201/start?with=documents");
    expect(href("esg-import-workbook")).toBe("/esg/create/co%201/start");
    expect(href("esg-import-template")).toMatch(/\/api\/esg\/workbook\/template$/);
    expect(href("esg-import-export")).toMatch(/\/api\/esg\/workbook\/co%201\/export$/);
  });

  it("asks for a company first when none is open", () => {
    useEsgStore.setState({ companyId: "" } as never);
    render(<EsgImport />);
    expect(screen.queryByTestId("esg-import-hub")).toBeNull();
    expect(screen.getByText("Select a company")).toBeInTheDocument();
  });
});
