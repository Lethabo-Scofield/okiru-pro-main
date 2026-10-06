/**
 * @vitest-environment jsdom
 *
 * The workbook's own sites and months: changing them moves the figures with
 * their site and month, and a change that would drop one is refused.
 */
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EsgReportingAxesForm } from "../EsgReportingAxesForm";

const SETUP = { eSites: "ALDER\nBKT", eFirstMonth: "Jul-25", eMonthCount: 9 };

describe("EsgReportingAxesForm", () => {
  it("lengthening the year keeps every figure where it is", () => {
    const onChange = vi.fn();
    render(<EsgReportingAxesForm values={{ ...SETUP, s2_C14: 10 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("esg-field-eMonthCount").querySelector("select")!, { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ eMonthCount: 12, eFirstMonth: "Jul-25", s2_C14: 10 }));
  });

  it("reordering the sites moves each site's figures with it", () => {
    const onChange = vi.fn();
    render(<EsgReportingAxesForm values={{ ...SETUP, s2_C14: 10 }} onChange={onChange} />);
    const input = screen.getByTestId("esg-field-eSites").querySelector("input")!;
    fireEvent.change(input, { target: { value: "BKT, ALDER" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ eSites: "BKT\nALDER", s2_C15: 10, s2_C14: "" }));
  });

  it("refuses to drop a site that holds figures, and says why", () => {
    const onChange = vi.fn();
    render(<EsgReportingAxesForm values={{ ...SETUP, s2_C15: 10 }} onChange={onChange} />);
    const input = screen.getByTestId("esg-field-eSites").querySelector("input")!;
    fireEvent.change(input, { target: { value: "ALDER" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("esg-axes-refusal")).toHaveTextContent("BKT's figures");
    expect(input).toHaveValue("ALDER, BKT");
  });

  it("switching to company wide adds the sites into one row", () => {
    const onChange = vi.fn();
    render(<EsgReportingAxesForm values={{ ...SETUP, s2_C14: 10, s2_C15: 5 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("esg-field-eScope").querySelector("select")!, { target: { value: "Company wide" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ eScope: "Company wide", s2_C14: 15, s2_C15: "" }));
  });
});
