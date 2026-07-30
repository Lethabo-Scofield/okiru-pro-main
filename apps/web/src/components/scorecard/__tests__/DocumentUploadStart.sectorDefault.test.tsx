/**
 * @vitest-environment jsdom
 *
 * The sector/size choice picks the scorecard the company is judged against.
 * A silent Generic default once scored a real Transport QSE on the RCOGP
 * Generic 120-pt scorecard — dozens of points too low — so the flow must
 * start with NOTHING preselected and require an explicit choice.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";

const CATALOG = {
  sector_options: [
    { code: "Generic", label: "Generic (RCOGP)" },
    { code: "TRANSPORT", label: "Transport" },
  ],
  required_groups: [],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => CATALOG,
  })) as unknown as typeof fetch);
});

describe("DocumentUploadStart sector selection", () => {
  it("starts with NO sector preselected — the placeholder is the selected option", async () => {
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    const select = (await screen.findByTestId("sector-select-side")) as HTMLSelectElement;
    expect(select.value).toBe("");
    // The placeholder option exists and is what the user sees until they choose.
    expect(screen.getByRole("option", { name: "Select sector…" })).toBeInTheDocument();
  });

  it("starts with NO organisation size preselected", async () => {
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);

    // None of the size options may carry the selected checkmark on first render.
    const generic = await screen.findByTestId("size-option-side-Generic");
    const qse = screen.getByTestId("size-option-side-QSE");
    const eme = screen.getByTestId("size-option-side-EME");
    for (const button of [generic, qse, eme]) {
      expect(button.querySelector("svg")).toBeNull();
    }
  });
});
