/**
 * @vitest-environment jsdom
 *
 * The dialog itself, driven the way a consultant drives it: hand it the real
 * information-gathering workbook and check that what it says on screen matches
 * what it would store.
 *
 * The specs are unit-tested elsewhere. What is only true once it is wired up is
 * the part that failed before — that choosing a file reaches the reader at all.
 * The two uploads this replaced both parsed something; they just parsed the
 * wrong sheet, or looked for headings nobody had. Both reported a confident
 * zero. So the assertion that matters is not "it did not throw", it is that the
 * counts on screen are the counts in the file.
 */
import { describe, expect, it, vi, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { BulkImportDialog } from "../BulkImportDialog";
import { BULK_IMPORT_SPECS } from "../bulkImportSpecs";
import type { Employee } from "@toolkit/lib/types";

/**
 * jsdom's File has no arrayBuffer() in every version, and the dialog reads the
 * chosen file with it. Back it with the bytes the test supplies.
 */
function fileFrom(bytes: Uint8Array, name: string): File {
  const file = new File([bytes], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
  }
  return file;
}

/** A workbook shaped like the real thing: Instructions first, header row down. */
function realisticWorkbook(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["NEW", "v1.33"], ["Complete every grey cell.", ""]]),
    "Instructions",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["", "Measured Entity: Acme Logistics", "", "", "", "Management Control"],
      ["", "Year End: 28 February 2025", "", "", "", ""],
      [],
      ["", "Detail", "", "Use dropdown", "Use dropdown", "Use dropdown"],
      ["", "Name & Surname", "ID Number", "Designation", "Race", "Gender"],
      [1, "Thandi Mokoena", "8501015800083", "Senior Manager", "African", "Female"],
      [2, "Pieter van Wyk", "7203126000081", "Middle Manager", "White", "Male"],
      [3, "Lerato Ndlovu", "9106140800087", "Junior Manager", "African", "Female"],
      [4, "", "", "", "", ""],
    ]),
    "Management Control",
  );
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as unknown as Uint8Array;
}

beforeAll(() => {
  // Radix measures the viewport; jsdom has no layout engine.
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (!(window as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function open(existing: Employee[] = [], onImport = vi.fn()) {
  render(
    <BulkImportDialog
      open
      onOpenChange={() => {}}
      spec={BULK_IMPORT_SPECS["management-control"]}
      existing={existing}
      onImport={onImport}
      sectorCode="TRANSPORT"
    />,
  );
  return { onImport };
}

/** Choose a file, as picking one in the OS dialog does. */
async function choose(bytes: Uint8Array, name = "BEE Information Gathering File.xlsx") {
  const input = document.querySelector(
    '[data-testid="input-bulk-management-control"]',
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  Object.defineProperty(input, "files", { value: [fileFrom(bytes, name)], writable: false });
  fireEvent.change(input);
}

describe("BulkImportDialog", () => {
  it("opens on the dropzone and offers the blank sheet", () => {
    open();
    expect(screen.getByTestId("dropzone-bulk-management-control")).toBeTruthy();
    expect(screen.getByTestId("button-template-management-control")).toBeTruthy();
  });

  it("reads the register past the Instructions tab and the banner rows", async () => {
    open();
    await choose(realisticWorkbook());

    // Three people in the file, one spacer row. The count on screen is the
    // claim being made to the user, so it is the thing worth asserting.
    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());
    expect(screen.getByText(/New employees/i)).toBeTruthy();

    // It says which sheet it used — the old upload silently used sheet 1.
    const sheetPicker = screen.getByTestId(
      "select-sheet-management-control",
    ) as HTMLSelectElement;
    expect(sheetPicker.value).toBe("Management Control");
  });

  it("shows the people it found, not just a number", async () => {
    open();
    await choose(realisticWorkbook());

    await waitFor(() => expect(screen.getByText("Thandi Mokoena")).toBeTruthy());
    expect(screen.getByText("Pieter van Wyk")).toBeTruthy();
    expect(screen.getByText("Lerato Ndlovu")).toBeTruthy();
  });

  it("writes nothing until the import is confirmed", async () => {
    const { onImport } = open();
    await choose(realisticWorkbook());
    await waitFor(() => expect(screen.getByTestId("button-confirm-management-control")).toBeTruthy());

    // Reading the file must not be the same act as accepting it.
    expect(onImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("button-confirm-management-control"));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const [entities, mode] = onImport.mock.calls[0];
    expect(mode).toBe("append");
    expect(entities).toHaveLength(3);
    expect(entities[0]).toMatchObject({
      name: "Thandi Mokoena",
      race: "African",
      gender: "Female",
      designation: "Senior",
    });
  });

  it("counts someone already captured as already here, not as new", async () => {
    const existing = [
      { id: "e1", name: "Thandi Mokoena", idNumber: "8501015800083" } as Employee,
    ];
    const { onImport } = open(existing);
    await choose(realisticWorkbook());

    await waitFor(() => expect(screen.getByText(/Already here/i)).toBeTruthy());

    fireEvent.click(screen.getByTestId("button-confirm-management-control"));
    await waitFor(() => expect(onImport).toHaveBeenCalled());

    // Appending the same file twice must not double the register.
    const [entities] = onImport.mock.calls[0];
    expect(entities).toHaveLength(2);
    expect(entities.map((e: Employee) => e.name)).not.toContain("Thandi Mokoena");
  });

  it("says so plainly when no sheet in the file is this register", async () => {
    open();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["NEW", "v1.33"]]), "Instructions");
    await choose(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as unknown as Uint8Array);

    await waitFor(() =>
      expect(screen.getByText(/No sheet in this file looks like/i)).toBeTruthy(),
    );
    // And it cannot be confirmed into an empty import.
    const confirm = screen.getByTestId("button-confirm-management-control") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});

/**
 * The certificate registry, on a procurement upload.
 *
 * Two things have to be true at once. A client's own supplier spreadsheet is
 * usually months behind on levels and expiry dates and we hold an independent
 * record — but a name match against an outside register is a suggestion, and
 * overwriting what somebody typed on the strength of one, silently, is not
 * ours to do. So it is looked up immediately and applied only on confirmation.
 */
describe("BulkImportDialog — certificate registry", () => {
  const procurementSheet = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Procurement / Suppliers"],
        ["Supplier Name", "Spend (R)", "B-BBEE Level"],
        ["Acme Bolts", 250000, ""],
      ]),
      "Procurement",
    );
    return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as unknown as Uint8Array;
  };

  function openProcurement(onImport = vi.fn()) {
    render(
      <BulkImportDialog
        open
        onOpenChange={() => {}}
        spec={BULK_IMPORT_SPECS.procurement}
        existing={[]}
        onImport={onImport}
        sectorCode="RCOGP"
      />,
    );
    return { onImport };
  }

  async function chooseProcurement(bytes: Uint8Array) {
    const input = document.querySelector(
      '[data-testid="input-bulk-procurement"]',
    ) as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [fileFrom(bytes, "suppliers.xlsx")], writable: false });
    fireEvent.change(input);
  }

  it("asks the registry about the suppliers in the file", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({ success: true, data: { results: [] } }),
      } as unknown as Response;
    }));

    openProcurement();
    await chooseProcurement(procurementSheet());

    await waitFor(() => expect(calls.some((u) => u.includes("/api/certificates/match"))).toBe(true));
    vi.unstubAllGlobals();
  });

  it("offers what it found and fills nothing until it is accepted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          results: [
            {
              key: "any",
              match: {
                certificateId: "c1",
                slug: "acme",
                companyName: "Acme Bolts (Pty) Ltd",
                certificateNumber: "ZA123",
                agency: "SANAS",
                issueDate: "2025-03-01",
                expiryDate: "2026-02-28",
                validAtAsOf: true,
                verified: true,
                basis: "name",
                confidence: 0.97,
                fields: { bbbeeLevel: 4 },
              },
              alternatives: [],
            },
          ],
        },
      }),
    } as unknown as Response)));

    openProcurement();
    await chooseProcurement(procurementSheet());

    // The expiry date is the field a client's own sheet is most often wrong
    // about, so it is the one shown.
    await waitFor(() => expect(screen.getByText("2026-02-28")).toBeTruthy());
    expect(screen.getByText(/Found certificates for/i)).toBeTruthy();

    // Confirmation is a real choice, not a notice.
    const accept = screen.getByTestId("use-certificates") as HTMLInputElement;
    expect(accept.checked).toBe(true);
    fireEvent.click(accept);
    expect(accept.checked).toBe(false);

    vi.unstubAllGlobals();
  });

  /** A registry that is down must not stop a client importing their own file. */
  it("imports the spreadsheet's own values when the registry cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("registry down");
    }));

    const { onImport } = openProcurement();
    await chooseProcurement(procurementSheet());

    await waitFor(() => expect(screen.getByText(/registry unavailable/i)).toBeTruthy());

    fireEvent.click(screen.getByTestId("button-confirm-procurement"));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    const [entities] = onImport.mock.calls[0];
    expect(entities).toHaveLength(1);
    expect(entities[0].spend).toBe(250000);

    vi.unstubAllGlobals();
  });
});

/**
 * The file a consultant actually holds. Gitignored corpus, so this skips where
 * it is absent — but where it is present, it is the only test that proves the
 * thing the old uploads got wrong.
 */
const REAL = path.resolve(
  __dirname,
  "../../../../../../../docs/Test Data/A_General/BEE Information Gathering File - Thandanani Transport_Updated.xlsx",
);

describe.skipIf(!fs.existsSync(REAL))("BulkImportDialog — the real workbook", () => {
  it("finds the Management Control register in it and offers real people", async () => {
    const { onImport } = open();
    await choose(new Uint8Array(fs.readFileSync(REAL)), "Thandanani Transport.xlsx");

    await waitFor(
      () =>
        expect(
          (screen.getByTestId("select-sheet-management-control") as HTMLSelectElement).value,
        ).toBe("Management Control"),
      { timeout: 15000 },
    );

    fireEvent.click(screen.getByTestId("button-confirm-management-control"));
    await waitFor(() => expect(onImport).toHaveBeenCalled());

    const [entities] = onImport.mock.calls[0];
    expect(entities.length).toBeGreaterThan(0);
    for (const e of entities as Employee[]) {
      expect(e.name.trim()).not.toBe("");
    }
  }, 30000);
});
