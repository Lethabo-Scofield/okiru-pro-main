/**
 * @vitest-environment jsdom
 *
 * `/esg` — the front door.
 *
 * WHAT THESE TESTS EXIST TO PREVENT
 *
 * The flow used to open on a company picker whose first control was "name a new
 * company", then drop the user into an EMPTY workbook with the document route
 * demoted to a toolbar button. Two things were wrong and both are pinned here:
 *
 *   1. `/esg` must open on the THREE WAYS IN, not on a name field and not on a
 *      workbook.
 *   2. Nothing may be created until the user confirms at step 3 — so abandoning
 *      the flow leaves no empty company behind, and the name on the company is
 *      one the documents produced or the user typed, never one invented to get
 *      past a required field.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";

const { toastMock, uploadStub } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  uploadStub: vi.fn(),
}));

// The glass theme is a stylesheet, and running it through PostCSS here buys
// nothing but a Tailwind plugin dependency in the test run.
vi.mock("@/styles/esg-glass.css", () => ({ default: "" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/components/UserAccountMenu", () => ({ UserAccountMenu: () => null }));
vi.mock("@/components/AppNavBack", () => ({ AppNavBack: () => null }));

/**
 * Stand in for the real uploader — it is tested in its own file, and driving a
 * quote/token/SSE round trip here would be testing that component again rather
 * than testing what this flow does with its result.
 */
vi.mock("../EsgDocumentUploadStart", () => ({
  __esModule: true,
  default: (props: {
    companyId: string;
    onComplete: (result: { injection: unknown; parserCase: unknown }) => void;
  }) => {
    uploadStub(props.companyId);
    return (
      <button
        type="button"
        data-testid="stub-finish-upload"
        onClick={() =>
          props.onComplete({
            injection: {
              implemented: true,
              patches: { "e-data": { cells: { C14: 35332 } } },
              placed: [
                {
                  sectionId: "e-data",
                  cellRef: "C14",
                  field: "electricity_kwh",
                  value: 35332,
                  sourceFile: "july-bill.pdf",
                  documentId: "doc1",
                },
              ],
              unplaced: [],
              conflicts: [],
              valuesRead: 1,
            },
            parserCase: {
              documents: [{ file_name: "july-bill.pdf" }],
              ai_entities: {
                fields: { entity_name: { value: "Lake Trading (Pty) Ltd" } },
                extractions: [],
              },
            },
          })
        }
      >
        finish
      </button>
    );
  },
}));

import EsgCreateFlow from "../EsgCreateFlow";

const FLOW_SRC = readFileSync(path.resolve(__dirname, "../EsgCreateFlow.tsx"), "utf8");
const APP_SRC = readFileSync(path.resolve(__dirname, "../../../App.tsx"), "utf8");
const SELECTOR_SRC = readFileSync(
  path.resolve(__dirname, "../../../pages/EsgClientSelector.tsx"),
  "utf8",
);

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(calls: FetchCall[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/api/clients")) {
      return new Response(JSON.stringify({ clientId: "c-123", name: "x" }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(call: FetchCall | undefined): any {
  return call?.init?.body ? JSON.parse(String(call.init.body)) : null;
}

beforeEach(() => {
  toastMock.mockClear();
  uploadStub.mockClear();
  window.history.pushState({}, "", "/esg");
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the ESG front door opens on the choice, not on a name", () => {
  it("renders the three ways in with a 1-2-3 above them", () => {
    const calls: FetchCall[] = [];
    mockFetch(calls);
    render(<EsgCreateFlow />);

    expect(screen.getByTestId("esg-create-start-choice")).toBeInTheDocument();
    expect(screen.getByTestId("esg-start-upload")).toBeInTheDocument();
    expect(screen.getByTestId("esg-start-excel")).toBeInTheDocument();
    expect(screen.getByTestId("esg-start-manual")).toBeInTheDocument();
    expect(screen.getByTestId("esg-flow-steps")).toHaveAttribute("aria-label", "Step 1 of 3");
    expect(screen.getByTestId("esg-flow-step-1")).toHaveAttribute("aria-current", "step");
  });

  it("asks for no company name and creates nothing on arrival", () => {
    const calls: FetchCall[] = [];
    mockFetch(calls);
    render(<EsgCreateFlow />);

    // The naming-first step is gone: no name box, and above all no company row
    // written before the user has told us anything.
    expect(screen.queryByTestId("esg-review-entity-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("esg-manual-name-input")).not.toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith("/api/clients"))).toHaveLength(0);
  });

  it("still lets someone reopen a scorecard they already started", async () => {
    const user = userEvent.setup();
    mockFetch([]);
    render(<EsgCreateFlow />);

    await user.click(screen.getByTestId("esg-open-existing"));
    expect(window.location.pathname).toBe("/esg/clients");
  });
});

describe("documents route — the name comes out of the documents", () => {
  it("reads the entity name from the parse, shows it for correction, then creates", async () => {
    const user = userEvent.setup();
    const calls: FetchCall[] = [];
    mockFetch(calls);
    render(<EsgCreateFlow />);

    await user.click(screen.getByTestId("esg-start-upload"));
    // Step 2 runs with NO company: the documents are what will name it.
    expect(uploadStub).toHaveBeenCalledWith("");
    expect(screen.getByTestId("esg-flow-steps")).toHaveAttribute("aria-label", "Step 2 of 3");

    await user.click(screen.getByTestId("stub-finish-upload"));

    const nameField = await screen.findByTestId("esg-review-entity-name");
    expect(nameField).toHaveValue("Lake Trading (Pty) Ltd");
    expect(screen.getByTestId("esg-flow-steps")).toHaveAttribute("aria-label", "Step 3 of 3");
    // Still nothing created — the review is a review.
    expect(calls.filter((c) => c.url.endsWith("/api/clients"))).toHaveLength(0);

    // The user corrects it, and the correction is what gets created.
    await user.clear(nameField);
    await user.type(nameField, "Lake Trading Proprietary Limited");
    await user.click(screen.getByTestId("esg-review-create"));

    await waitFor(() => expect(window.location.pathname).toBe("/esg/create/c-123"));

    const created = calls.find((c) => c.url.endsWith("/api/clients"));
    expect(bodyOf(created)).toEqual({ name: "Lake Trading Proprietary Limited", product: "esg" });

    const imported = calls.find((c) => c.url.includes("/api/esg/workbook/c-123/import"));
    const importBody = bodyOf(imported);
    expect(importBody.confirm).toBe(true);
    // What the parser placed survives, and the confirmed name lands on the cover.
    expect(importBody.sections["e-data"].cells.C14).toBe(35332);
    expect(importBody.sections["company-reporting-setup"].cells.entity).toBe(
      "Lake Trading Proprietary Limited",
    );
  });

  it("does not hand the user back to the chooser it just came through", async () => {
    const user = userEvent.setup();
    mockFetch([]);
    render(<EsgCreateFlow />);

    await user.click(screen.getByTestId("esg-start-upload"));
    await user.click(screen.getByTestId("stub-finish-upload"));
    await screen.findByTestId("esg-review-entity-name");
    await user.click(screen.getByTestId("esg-review-create"));

    await waitFor(() =>
      expect(sessionStorage.getItem("okiru-esg-start-chosen-c-123")).toBe("1"),
    );
    expect(localStorage.getItem("okiru-esg-active-company")).toBe("c-123");
  });
});

describe("manual route — the only route that has to ask", () => {
  it("asks at step 2, reviews at step 3, and creates only on confirm", async () => {
    const user = userEvent.setup();
    const calls: FetchCall[] = [];
    mockFetch(calls);
    render(<EsgCreateFlow />);

    await user.click(screen.getByTestId("esg-start-manual"));
    const nameInput = screen.getByTestId("esg-manual-name-input");
    expect(screen.getByTestId("esg-flow-steps")).toHaveAttribute("aria-label", "Step 2 of 3");
    expect(calls.filter((c) => c.url.endsWith("/api/clients"))).toHaveLength(0);

    await user.type(nameInput, "Ubuntu Logistics");
    await user.click(screen.getByTestId("esg-manual-name-continue"));

    expect(await screen.findByTestId("esg-review-entity-name")).toHaveValue("Ubuntu Logistics");
    expect(screen.getByTestId("esg-review-manual-note")).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith("/api/clients"))).toHaveLength(0);

    await user.click(screen.getByTestId("esg-review-create"));
    await waitFor(() => expect(window.location.pathname).toBe("/esg/create/c-123"));
    expect(bodyOf(calls.find((c) => c.url.endsWith("/api/clients")))).toEqual({
      name: "Ubuntu Logistics",
      product: "esg",
    });
  });

  it("will not create a company with no name", async () => {
    const user = userEvent.setup();
    mockFetch([]);
    render(<EsgCreateFlow />);

    await user.click(screen.getByTestId("esg-start-manual"));
    expect(screen.getByTestId("esg-manual-name-continue")).toBeDisabled();
  });
});

describe("Excel route — reviewed before a company exists", () => {
  /** A minimal workbook in the layout the downloadable template uses. */
  function coverWorkbook(entity: string | null): File {
    const rows: Array<Array<string | number>> = [
      ["Cell Ref", "Field", "Value (fill in)"],
      ["entity", "Entity", ...(entity ? [entity] : [])],
      ["period", "Reporting period", "FY2026"],
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Cover");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return new File([buffer], "esg-data.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  it("reads the workbook here, names the company from it, and imports on confirm", async () => {
    const user = userEvent.setup();
    const calls: FetchCall[] = [];
    mockFetch(calls);
    render(<EsgCreateFlow />);

    await user.upload(
      screen.getByTestId("esg-start-excel-input") as HTMLInputElement,
      coverWorkbook("Riverbend Logistics (Pty) Ltd"),
    );

    expect(await screen.findByTestId("esg-review-entity-name")).toHaveValue(
      "Riverbend Logistics (Pty) Ltd",
    );
    expect(screen.getByTestId("esg-review-excel-summary")).toHaveTextContent("esg-data.xlsx");
    // Read locally: pricing a workbook against a company that does not exist yet
    // is exactly the ordering this flow removed.
    expect(calls).toHaveLength(0);

    await user.click(screen.getByTestId("esg-review-create"));
    await waitFor(() => expect(window.location.pathname).toBe("/esg/create/c-123"));
    const importBody = bodyOf(calls.find((c) => c.url.includes("/import")));
    expect(importBody.confirm).toBe(true);
    expect(importBody.sections["company-reporting-setup"].cells.entity).toBe(
      "Riverbend Logistics (Pty) Ltd",
    );
  });

  it("leaves the name empty when the workbook does not name the entity", async () => {
    const user = userEvent.setup();
    mockFetch([]);
    render(<EsgCreateFlow />);

    await user.upload(
      screen.getByTestId("esg-start-excel-input") as HTMLInputElement,
      coverWorkbook(null),
    );

    expect(await screen.findByTestId("esg-review-entity-name")).toHaveValue("");
    expect(screen.getByTestId("esg-review-name-required")).toBeInTheDocument();
    expect(screen.getByTestId("esg-review-create")).toBeDisabled();
  });
});

describe("routing and the doors that must stay open", () => {
  it("points /esg at the create flow and keeps /esg/clients mounted", () => {
    expect(APP_SRC).toMatch(/path="\/esg">\s*<ProtectedRoute><EsgPreviewRoute><EsgCreateFlow/);
    expect(APP_SRC).toMatch(/path="\/esg\/clients">\s*<ProtectedRoute><EsgPreviewRoute><EsgClientSelector/);
    // Deep links into an existing company are untouched.
    expect(APP_SRC).toMatch(/path="\/esg\/create\/:companyId\/start"/);
    expect(APP_SRC).toMatch(/path="\/esg\/create\/:companyId"/);
    expect(APP_SRC).toMatch(/path="\/esg\/create\/:companyId\/summary"/);
    expect(APP_SRC).toMatch(/path="\/esg\/toolkit\/:companyId" nest/);
    // The old redirect is gone.
    expect(APP_SRC).not.toMatch(/EsgHubRedirect/);
  });

  it("no longer offers naming-first company creation on the picker", () => {
    expect(SELECTOR_SRC).not.toMatch(/method: "POST"/);
    expect(SELECTOR_SRC).toMatch(/data-testid="button-esg-start-new"/);
  });

  it("writes through the one workbook import path, never a second one", () => {
    expect(FLOW_SRC).toMatch(/persistEsgSectionPatches/);
    expect(FLOW_SRC).not.toMatch(/\/api\/esg\/workbook\/\$\{[^}]+\}\/import/);
  });
});
