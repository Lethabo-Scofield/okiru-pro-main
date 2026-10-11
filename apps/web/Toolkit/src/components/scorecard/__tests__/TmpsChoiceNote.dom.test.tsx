// @vitest-environment jsdom
/**
 * The score page and the Procurement page say which TMPS is scored: the
 * supplier sum by default, with a TMPS the documents state beside it as a
 * flagged difference, and one switch to use it. (Invented figures.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TmpsChoiceNote } from "../TmpsChoiceNote";
import type { ProcurementData } from "@toolkit/lib/types";

afterEach(cleanup);

const suppliers = [{ id: "s1", name: "Invented Supplies", spend: 3_000_000, beeLevel: 2, blackOwnership: 0.6, blackWomenOwnership: 0, enterpriseType: "generic" }] as never;
const base: ProcurementData = { id: "", clientId: "", tmps: 3_000_000, suppliers };

describe("TmpsChoiceNote", () => {
  it("flags a stated TMPS that is not the supplier sum, and offers the switch", () => {
    const onChoose = vi.fn();
    render(<TmpsChoiceNote procurement={{ ...base, statedTmps: 4_500_000 }} onChoose={onChoose} />);
    const note = screen.getByTestId("text-tmps-source");
    expect(note.getAttribute("data-tmps-flagged")).toBe("true");
    expect(note.textContent).toMatch(/scored against the supplier sum/);
    fireEvent.click(screen.getByTestId("button-tmps-use-stated"));
    expect(onChoose).toHaveBeenCalledWith("stated");
  });

  it("says when the chosen stated figure is used, and offers the way back", () => {
    const onChoose = vi.fn();
    render(<TmpsChoiceNote procurement={{ ...base, tmps: 4_500_000, statedTmps: 4_500_000, tmpsChoice: "stated" }} onChoose={onChoose} />);
    expect(screen.getByTestId("text-tmps-source").textContent).toMatch(/because you chose it/);
    fireEvent.click(screen.getByTestId("button-tmps-use-supplier-sum"));
    expect(onChoose).toHaveBeenCalledWith("supplier_sum");
  });

  it("offers no switch to a stated figure below the suppliers listed", () => {
    render(<TmpsChoiceNote procurement={{ ...base, statedTmps: 300_000 }} onChoose={vi.fn()} />);
    expect(screen.getByTestId("text-tmps-source").textContent).toMatch(/cannot be the TMPS/);
    expect(screen.queryByTestId("button-tmps-use-stated")).toBeNull();
  });

  it("on the score page, shows nothing when there is no difference", () => {
    const { container } = render(<TmpsChoiceNote procurement={base} onlyWhenFlagged />);
    expect(container.innerHTML).toBe("");
  });
});
