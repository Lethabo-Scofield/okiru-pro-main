// @vitest-environment jsdom
/**
 * The verification panel beside the score: both totals, each check with the
 * document and field it was checked against, what the rule did, and the
 * total under each needs-you answer. (Invented company.)
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { VerificationPanel } from "../VerificationPanel";
import type { VerificationReport } from "../../../../../api/pipeline/verification/index.js";

afterEach(cleanup);

const report: VerificationReport = {
  version: 1,
  period: { start: "2024-03-01", end: "2025-02-28" },
  counts: { pass: 0, flag: 1, "needs-you": 1, unproven: 0, "out-of-period": 0 },
  checks: [
    {
      id: "procurement.supplierCertificate:p1", kind: "procurement.supplierCertificate", section: "procurement", rowId: "p1",
      subject: "Quarry Tools", status: "flag", rule: "replaced-certificate", claim: { column: "bbbeeLevel", value: 1 },
      evidence: [{ document: "Quarry Tools certificate.pdf", reader: "esd__cert", field: "bee_level", value: 2, rank: 3 }],
      statement: "Quarry Tools: level 1 claimed, the certificate states Level 2. The certificate is used.", ops: [],
    },
    {
      id: "management.band:x", kind: "management.band", section: "management-control", rowId: "m2", subject: "Lerato Khumalo",
      status: "needs-you", rule: "lower-until-answered", claim: { value: "Senior Management" }, evidence: [],
      statement: "The documents disagree on Lerato Khumalo's management band.", ops: [],
      choices: [
        { value: "Senior Management", sources: ["Gathering v2.xlsx"], held: true, ops: [] },
        { value: "Other Executive Management", sources: ["Gathering v1.xlsx"], held: false, ops: [] },
      ],
    },
  ],
};

describe("VerificationPanel", () => {
  it("shows both totals, the evidence, the rule and each answer's total", () => {
    render(
      <VerificationPanel
        report={report}
        totals={{
          claimed: 97.25,
          evidenced: 61.5,
          answers: { "management.band:x": [{ choice: report.checks[1].choices![0], total: 97.25 }, { choice: report.checks[1].choices![1], total: 99.25 }] },
        }}
      />,
    );
    expect(screen.getByTestId("verification-claimed")).toHaveTextContent("97.25");
    expect(screen.getByTestId("verification-evidenced")).toHaveTextContent("61.50");
    expect(screen.getByText(/Quarry Tools certificate\.pdf — bee_level/)).toBeInTheDocument();
    expect(screen.getByText(/certificate's figure is used in both totals/)).toBeInTheDocument();
    expect(screen.getByText("99.25 pts")).toBeInTheDocument();
  });

  it("renders nothing without a report", () => {
    const { container } = render(<VerificationPanel report={null} totals={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
