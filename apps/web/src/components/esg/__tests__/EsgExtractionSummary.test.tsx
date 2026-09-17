/**
 * @vitest-environment jsdom
 *
 * The reveal has to be READ, not scrolled past.
 *
 * The panel this replaces put every reading — across every ESG element — into
 * one flat bulleted list, and rendered anything with structure as the words
 * "structured data". A user looking for their electricity figure found a bullet
 * that said `Electricity Kwh: structured data`, which is indistinguishable from
 * a bug. These tests pin the two properties that fixed it: findings are grouped
 * by element, and a value always renders as itself.
 */
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EsgExtractionSummary } from "../EsgExtractionSummary";
import type { EsgInjectionResult, EsgUnplacedValue } from "../esgParserInjection";

function unplaced(over: Partial<EsgUnplacedValue> & { field: string; value: unknown }): EsgUnplacedValue {
  return {
    sourceFile: "bill.pdf",
    documentId: "doc-1",
    element: "GHG_ENERGY",
    reason: "no cell",
    ...over,
  } as EsgUnplacedValue;
}

function injection(over: Partial<EsgInjectionResult> = {}): EsgInjectionResult {
  return {
    implemented: true,
    patches: {},
    placed: [],
    unplaced: [],
    conflicts: [],
    valuesRead: 0,
    ...over,
  } as EsgInjectionResult;
}

describe("EsgExtractionSummary", () => {
  it("groups readings by element instead of one flat list", async () => {
    const values = [
      unplaced({ field: "electricity_kwh", value: 35332, element: "GHG_ENERGY" }),
      unplaced({ field: "water_kl", value: 812, element: "WATER" }),
      unplaced({ field: "sanitation_kl", value: 240, element: "WATER" }),
    ];
    render(
      <EsgExtractionSummary
        injection={injection({ unplaced: values, valuesRead: 3 })}
        parserCase={null}
      />,
    );

    const panel = screen.getByTestId("esg-unplaced-values");
    // Both element groups are named, and the larger one leads.
    expect(within(panel).getByText("Water")).toBeInTheDocument();
    expect(within(panel).getByText("Energy & emissions")).toBeInTheDocument();

    // The largest group is open on arrival, so the panel is never blank.
    expect(within(panel).getByText("812")).toBeInTheDocument();

    // A closed group opens on click rather than being lost.
    await userEvent.click(within(panel).getByRole("button", { name: /Energy & emissions/ }));
    expect(within(panel).getByText("35332")).toBeInTheDocument();
  });

  it("never renders a placeholder where a value belongs", async () => {
    const rows = [
      { vehicle_registration: "CA 123-456", fuel_type: "Diesel", monthly_km: 4100 },
      { vehicle_registration: "CA 654-321", fuel_type: "Diesel", monthly_km: 3800 },
    ];
    render(
      <EsgExtractionSummary
        injection={injection({
          unplaced: [unplaced({ field: "fleet_vehicle_rows", value: rows, element: "FLEET" })],
          valuesRead: 1,
        })}
        parserCase={null}
      />,
    );

    const panel = screen.getByTestId("esg-unplaced-values");
    expect(panel).not.toHaveTextContent("structured data");
    expect(panel).not.toHaveTextContent("entries");
    // A register states its size, and opens to show what is in it.
    expect(within(panel).getByText("2 rows")).toBeInTheDocument();
    await userEvent.click(within(panel).getByText("Show rows"));
    expect(within(panel).getByText(/CA 123-456/)).toBeInTheDocument();
  });

  it("renders a boolean as a word rather than as true/false", () => {
    render(
      <EsgExtractionSummary
        injection={injection({
          unplaced: [unplaced({ field: "hira_register_present", value: true, element: "HEALTH_SAFETY" })],
          valuesRead: 1,
        })}
        parserCase={null}
      />,
    );
    expect(screen.getByTestId("esg-unplaced-values")).toHaveTextContent("Yes");
  });

  it("puts each conflicting candidate on its own line", () => {
    render(
      <EsgExtractionSummary
        injection={injection({
          valuesRead: 2,
          conflicts: [
            {
              sectionId: "s1",
              cellRef: "B4",
              label: "Scope 1 emissions",
              candidates: [
                { value: 1240, sources: ["ghg-report.pdf"] },
                { value: 1310, sources: ["assurance.pdf"] },
              ],
            },
          ],
        })}
        parserCase={null}
      />,
    );

    const panel = screen.getByTestId("esg-value-conflicts");
    expect(within(panel).getByText("1240")).toBeInTheDocument();
    expect(within(panel).getByText("1310")).toBeInTheDocument();
    // The old rendering joined candidates into one "a vs b" string.
    expect(panel).not.toHaveTextContent("vs");
  });

  it("still says plainly when nothing could be extracted", () => {
    render(<EsgExtractionSummary injection={injection()} parserCase={null} />);
    expect(screen.getByTestId("esg-zero-extraction")).toBeInTheDocument();
  });

  it("no longer claims the mapping layer is unbuilt", () => {
    render(
      <EsgExtractionSummary
        injection={injection({
          unplaced: [unplaced({ field: "electricity_kwh", value: 1 })],
          valuesRead: 1,
        })}
        parserCase={null}
      />,
    );
    expect(screen.queryByTestId("esg-mapping-not-implemented")).not.toBeInTheDocument();
    expect(screen.getByTestId("esg-extraction-summary")).not.toHaveTextContent("not built yet");
  });
});
