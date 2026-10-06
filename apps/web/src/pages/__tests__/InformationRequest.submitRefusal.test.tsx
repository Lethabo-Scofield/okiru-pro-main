/**
 * @vitest-environment jsdom
 *
 * Create → import → submit. When the submit refused (a 422 naming the missing
 * field), the refusal was read only as `!ok`: the toast said "Workbook
 * imported" and the document flow went on to the provisional score page, which
 * read a company nothing had been synced to and showed 0. The refusal must be
 * said out loud, and the user must land where it can be fixed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { writeFlowSnapshot } from "@/components/scorecard/flowSnapshot";

const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock("@toolkit/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
const loadClientData = vi.fn(async () => undefined);
vi.mock("@toolkit/lib/store", () => ({
  useBbeeStore: (select: (s: { loadClientData: typeof loadClientData }) => unknown) => select({ loadClientData }),
}));

import { CompanyPicker } from "../InformationRequest";

const REFUSAL = "Cannot calculate: Financial Year-End (dd/mm/yyyy): Required";

function stubServer(submit: { ok: boolean; status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const reply = (ok: boolean, status: number, body: unknown) => ({
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
        clone() {
          return this;
        },
      });
      if (url.endsWith("/api/clients") && method === "POST") return reply(true, 200, { clientId: "C-10001", name: "Example Trading" });
      if (url.includes("/import")) return reply(true, 200, { ok: true });
      if (url.includes("/submit")) return reply(submit.ok, submit.status, submit.body);
      if (url.includes("/api/parser/document-types")) {
        return reply(true, 200, { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] });
      }
      return reply(true, 200, {});
    }) as unknown as typeof fetch,
  );
}

async function buildFromRestoredRun() {
  writeFlowSnapshot({
    savedAt: "2026-10-06T11:31:00.000Z",
    companyName: "Example Trading 101 (Pty) Ltd",
    sector: "RCOGP",
    subSector: "",
    size: "Generic",
    yearEnd: "2026-02-28",
    fileNames: ["1 Company_Info 13Nov2025.xlsx"],
    filedBatchByFile: {},
    documentIds: [],
    parserCase: {},
  });
  // Arrive the way the workspace's "Upload documents" link does.
  window.history.pushState({}, "", "/create-scorecard?start=documents");
  const onPick = vi.fn();
  const onLandEstimate = vi.fn();
  render(<CompanyPicker onPick={onPick} onLandEstimate={onLandEstimate} mode="create" />);
  const build = await screen.findByTestId("button-create-from-documents");
  await waitFor(() => expect(build).not.toBeDisabled());
  fireEvent.click(build);
  return { onPick, onLandEstimate };
}

describe("create from documents — when the workbook submit refuses", () => {
  beforeEach(() => {
    sessionStorage.clear();
    toastSpy.mockClear();
    loadClientData.mockClear();
  });

  it("names the refusal and opens the workbook, not a provisional score of 0", async () => {
    stubServer({ ok: false, status: 422, body: { error: REFUSAL, fields: ["financialYearEnd"] } });
    const { onPick, onLandEstimate } = await buildFromRestoredRun();

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onLandEstimate).not.toHaveBeenCalled();
    expect(loadClientData).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: expect.stringContaining(REFUSAL),
      }),
    );
  });

  it("still lands on the provisional score when the submit succeeds", async () => {
    stubServer({ ok: true, status: 200, body: { ok: true, clientId: "C-10001" } });
    const { onPick, onLandEstimate } = await buildFromRestoredRun();

    await waitFor(() => expect(onLandEstimate).toHaveBeenCalledTimes(1));
    expect(onPick).not.toHaveBeenCalled();
    expect(loadClientData).toHaveBeenCalledWith("C-10001");
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Imported and synced to scorecard" }));
  });
});
