/**
 * A verification report names rows by the workbook row `_id`. The score page
 * applies it to the live Toolkit store, whose rows come from the workbook
 * projection, through the client record, into loadClientData. Shareholders,
 * employees and training programmes used to be projected WITHOUT that id, so
 * every people check (an unproven black holder or executive, a learner
 * excluded, a band answered) matched nothing on the live path: EVIDENCED
 * equalled CLAIMED for people, and both answers to a band question scored the
 * same. This walks the real path: workbook -> projection -> register fold ->
 * /data payload -> store -> verificationTotals. (Invented company.)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@toolkit/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, api: { ...(actual.api as object), getClientData: vi.fn() }, invalidateClientData: vi.fn() };
});

import { api } from "@toolkit/lib/api";
import { scoreWithVerification, useBbeeStore } from "@toolkit/lib/store";
import { projectWorkbookToClient, type WorkbookData } from "../workbookRoutes";
import { reconcileRegisters } from "../registerReconcile";
import { verificationTotals } from "../../src/lib/verification/verificationTotals";
import type { VerificationReport } from "../../../api/pipeline/verification/index.js";

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in test")));
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function workbook(): WorkbookData {
  return {
    companyId: "client-rowids",
    ownerOrganizationId: null,
    ownerUserId: "u1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sections: {
      "company-information": { rows: [], meta: { industrySector: "Transport", companySize: "QSE" } },
      "financial-information": { rows: [], meta: {} },
      ownership: {
        rows: [
          { _id: "own_1", shareholderName: "Thabo Example", race: "African", gender: "Male", votingRights: 100, economicInterest: 100, shareholding: 100, rowOutstandingDebt: 0 },
        ],
      },
      "management-control": {
        rows: [
          { _id: "mc_1", name: "Thabo", surname: "Example", race: "African", gender: "Male", occupationalLevel: "Executive Director" },
          { _id: "mc_2", name: "Naledi", surname: "Sample", race: "African", gender: "Female", occupationalLevel: "Senior Management" },
        ],
      },
      "skills-development": {
        rows: [
          { _id: "tp_1", programName: "Driver learnership", learnerName: "Lwazi Test", race: "African", gender: "Male", categoryCode: "B", totalCost: 80_000, employmentStatus: "Permanent" },
        ],
      },
      procurement: { rows: [{ _id: "pr_1", supplierName: "Invented Supplies", spend: 100_000, bbbeeLevel: "1", currentBlackOwnership: 100 }] },
    },
  };
}

const report: VerificationReport = {
  version: 1,
  period: null,
  counts: { pass: 0, flag: 0, "needs-you": 1, unproven: 3, "out-of-period": 0 },
  checks: [
    {
      id: "people.id:ownership:own_1", kind: "people.id", section: "ownership", rowId: "own_1", subject: "holder", status: "unproven",
      rule: "excluded-from-evidenced", claim: { value: "holder" }, evidence: [], statement: "no ID document",
      ops: [{ kind: "notBlack", basis: "evidenced", section: "ownership", rowId: "own_1" }],
    },
    {
      id: "people.payroll:management-control:mc_1", kind: "people.payroll", section: "management-control", rowId: "mc_1", subject: "executive", status: "unproven",
      rule: "excluded-from-evidenced", claim: { value: "executive" }, evidence: [], statement: "not on the payroll",
      ops: [{ kind: "notBlack", basis: "evidenced", section: "management-control", rowId: "mc_1" }],
    },
    {
      id: "training.evidence:skills-development:tp_1", kind: "training.evidence", section: "skills-development", rowId: "tp_1", subject: "learner", status: "unproven",
      rule: "excluded-from-evidenced", claim: { value: "learner" }, evidence: [], statement: "no attendance evidence",
      ops: [{ kind: "exclude", basis: "evidenced", section: "skills-development", rowId: "tp_1" }],
    },
    {
      id: "management.band:management-control:mc_2:occupationalLevel", kind: "management.band", section: "management-control", rowId: "mc_2",
      subject: "manager", status: "needs-you", rule: "lower-until-answered", claim: { column: "occupationalLevel", value: "Senior Management" },
      evidence: [], statement: "two versions disagree", ops: [],
      choices: [
        { value: "Senior Management", sources: ["v2"], held: true, ops: [{ kind: "set", basis: "alternative", section: "management-control", rowId: "mc_2", column: "occupationalLevel", value: "Senior Management" }] },
        { value: "Other Executive Management", sources: ["v1"], held: false, ops: [{ kind: "set", basis: "alternative", section: "management-control", rowId: "mc_2", column: "occupationalLevel", value: "Other Executive Management" }] },
      ],
    },
  ],
} as VerificationReport;

async function loadProjectedIntoStore() {
  const projected = projectWorkbookToClient(workbook());
  const folded = reconcileRegisters({}, {
    shareholders: projected.shareholders,
    employees: projected.employees,
    trainingPrograms: projected.trainingPrograms,
    suppliers: projected.suppliers,
    esdContributions: projected.esdContributions,
    sedContributions: projected.sedContributions,
  }).rows;
  // The shape GET /api/clients/:id/data returns from the client record.
  vi.mocked(api.getClientData).mockResolvedValue({
    client: { id: "client-rowids", name: "Invented Logistics", sectorCode: "TRANSPORT", scorecardType: "QSE", companySize: "QSE", revenue: 20_000_000, npat: 2_000_000, leviableAmount: 4_000_000, financials: {} },
    ownership: { shareholders: folded.shareholders, companyValue: 10_000_000, outstandingDebt: 0 },
    management: { employees: folded.employees },
    skills: { leviableAmount: 4_000_000, trainingPrograms: folded.trainingPrograms },
    procurement: { tmps: 0, suppliers: folded.suppliers },
    esd: { contributions: folded.esdContributions ?? [] },
    sed: { contributions: folded.sedContributions ?? [] },
    financialYears: [],
    scenarios: [],
  } as never);
  useBbeeStore.setState({ pendingWrites: 0, saveError: null, activeClientId: null } as never);
  await useBbeeStore.getState().loadClientData("client-rowids");
  return useBbeeStore.getState();
}

describe("verification report on the live store path (projected workbook rows)", () => {
  it("carries each person's workbook row id onto the projected entity", () => {
    const projected = projectWorkbookToClient(workbook());
    expect(projected.shareholders.map((r: any) => r.id)).toEqual(["own_1"]);
    expect(projected.employees.map((r: any) => r.id)).toEqual(["mc_1", "mc_2"]);
    expect(projected.trainingPrograms.map((r: any) => r.id)).toEqual(["tp_1"]);
    expect(projected.suppliers.map((r: any) => r.id)).toEqual(["pr_1"]);
  });

  it("moves EVIDENCED for ownership, management and skills, and scores each band answer apart", async () => {
    const state = await loadProjectedIntoStore();
    expect(state.calculatorConfig).toBeTruthy();
    const claimedCard = scoreWithVerification(state as never, { ...report, checks: [] }, "claimed")!;
    const evidencedCard = scoreWithVerification(state as never, report, "evidenced")!;
    expect(evidencedCard.ownership.score).toBeLessThan(claimedCard.ownership.score);
    expect(evidencedCard.managementControl.score).toBeLessThan(claimedCard.managementControl.score);
    expect(evidencedCard.skillsDevelopment.score).toBeLessThan(claimedCard.skillsDevelopment.score);

    const totals = verificationTotals({ ...state, scorecard: claimedCard } as never, report);
    expect(totals.evidenced!).toBeLessThan(totals.claimed);
    const [held, other] = totals.answers[report.checks[3].id];
    expect(held.total).toBe(totals.claimed);
    // Other Executive Management puts a black woman in top management.
    expect(other.total!).toBeGreaterThan(held.total!);
  });
});
