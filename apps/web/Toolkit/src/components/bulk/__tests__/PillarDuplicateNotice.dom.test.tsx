// @vitest-environment jsdom
/**
 * The manual add paths in store.ts are unconditional appends — adding the same
 * supplier twice inflates TMPS and its own spend, and nothing warned. The bulk
 * importer warned; the pillar pages did not. These tests pin the parity: the
 * notice reads the rows themselves, so a duplicate is flagged however it
 * arrived, and it stays quiet when the rows are genuinely distinct.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PillarDuplicateNotice } from "../PillarDuplicateNotice";

afterEach(cleanup);

const supplier = (name: string, spend: number) => ({
  id: `${name}-${spend}`,
  name,
  spend,
  beeLevel: 4,
  blackOwnership: 0.51,
  blackWomenOwnership: 0,
  youthOwnership: 0,
  disabledOwnership: 0,
  enterpriseType: "generic" as const,
});

const shareholder = (name: string, shares: number) => ({
  id: `${name}-${shares}`,
  name,
  shares,
  race: "African" as const,
  gender: "Female" as const,
  isBlack: true,
});

describe("PillarDuplicateNotice", () => {
  it("flags a supplier entered twice", () => {
    render(
      <PillarDuplicateNotice
        specKey="procurement"
        rows={[supplier("Acme Logistics", 100_000), supplier("Acme Logistics", 100_000)]}
      />,
    );
    expect(screen.getByTestId("pillar-duplicate-warning-procurement")).toBeTruthy();
    // Named in both the summary line and the row table.
    expect(screen.getAllByText(/Acme Logistics/).length).toBeGreaterThan(0);
  });

  it("matches the importer's identity rule — case and padding do not hide a repeat", () => {
    render(
      <PillarDuplicateNotice
        specKey="procurement"
        rows={[supplier("Acme Logistics", 100_000), supplier("  ACME logistics  ", 250_000)]}
      />,
    );
    expect(screen.getByTestId("pillar-duplicate-warning-procurement")).toBeTruthy();
  });

  it("says nothing when suppliers are genuinely different", () => {
    render(
      <PillarDuplicateNotice
        specKey="procurement"
        rows={[supplier("Acme Logistics", 100_000), supplier("Beta Freight", 100_000)]}
      />,
    );
    expect(screen.queryByTestId("pillar-duplicate-warning-procurement")).toBeNull();
  });

  it("says nothing for a single row, or none", () => {
    const { rerender } = render(
      <PillarDuplicateNotice specKey="ownership" rows={[shareholder("Thandi Nkosi", 40)]} />,
    );
    expect(screen.queryByTestId("pillar-duplicate-warning-ownership")).toBeNull();
    rerender(<PillarDuplicateNotice specKey="ownership" rows={[]} />);
    expect(screen.queryByTestId("pillar-duplicate-warning-ownership")).toBeNull();
  });

  it("flags a shareholder entered twice — the case that doubles a holding", () => {
    render(
      <PillarDuplicateNotice
        specKey="ownership"
        rows={[shareholder("Thandi Nkosi", 40), shareholder("Thandi Nkosi", 40)]}
      />,
    );
    expect(screen.getByTestId("pillar-duplicate-warning-ownership")).toBeTruthy();
  });

  it("does not group rows that have no identifying value", () => {
    render(
      <PillarDuplicateNotice
        specKey="ownership"
        rows={[shareholder("", 10), shareholder("", 20)]}
      />,
    );
    // Two rows with nothing identifying are not "the same blank row".
    expect(screen.queryByTestId("pillar-duplicate-warning-ownership")).toBeNull();
  });
});
