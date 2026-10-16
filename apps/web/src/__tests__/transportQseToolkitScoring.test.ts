/**
 * Transport QSE, scored by the Toolkit calculators — the only B-BBEE scorer.
 *
 * These cases used to be compared against a second, server-side copy of the
 * engine; that copy was deleted, so each drift it caught is pinned here on the
 * Toolkit alone: Senior is not top management beside an executive, ownership
 * fulfilment comes from a stated nil debt (not a new-entrant flag), and
 * procurement counts recognised spend with excluded lines and a stated
 * non-empowering supplier left out. (Invented company.)
 */
import { describe, expect, it } from "vitest";
import { TRANSPORT_QSE_CALCULATOR_CONFIG as CFG, TRANSPORT_QSE_CODES_LINES_CALCULATOR_CONFIG as HELD_CFG } from "@toolkit/lib/sectors/transport-qse";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateTransportQseManagement } from "@toolkit/lib/calculators/transport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const any = (v: unknown) => v as any;

const shareholders = [
  { id: "a", name: "Sipho Ndlovu", ownershipType: "shareholder", blackOwnership: 1, blackWomenOwnership: 0, shares: 90, shareValue: 0, isDesignatedGroup: false, votingRightsPercent: 0.9, economicInterestPercent: 0.9, outstandingDebt: 0 },
  { id: "b", name: "Staff Share Trust", ownershipType: "ESOP / Employee Share Scheme", blackOwnership: 0.8, blackWomenOwnership: 0.4, shares: 10, shareValue: 0, isDesignatedGroup: false, votingRightsPercent: 0.1, economicInterestPercent: 0.1, outstandingDebt: 0 },
];
const employees = [
  { id: "1", name: "Sipho Ndlovu", race: "African", gender: "Male", designation: "Executive Director", isDisabled: false },
  { id: "2", name: "Lerato Khumalo", race: "African", gender: "Female", designation: "Senior", isDisabled: false },
  { id: "3", name: "Pieter Smit", race: "White", gender: "Male", designation: "Middle", isDisabled: false },
];
const suppliers = [
  { id: "s1", name: "Quarry Tools", spend: 400_000, beeLevel: 1, blackOwnership: 0.6, blackWomenOwnership: 0.1, enterpriseType: "generic" },
  { id: "s2", name: "Kestrel Insure", spend: 300_000, beeLevel: 5, blackOwnership: 0.2, blackWomenOwnership: 0, enterpriseType: "generic", isEmpoweringSupplier: false },
  { id: "s3", name: "Vehicle Finance Loan", spend: 900_000, beeLevel: 1, blackOwnership: 0.3, blackWomenOwnership: 0, enterpriseType: "generic" },
];
const tmps = 3_000_000;

describe("Transport QSE — Toolkit calculators", () => {
  it("ownership (held-back Codes lines): fulfilment comes from a stated nil acquisition debt", () => {
    const web = calculateOwnershipScore(any({ shareholders, companyValue: 0, outstandingDebt: 0, yearsHeld: 0 }), HELD_CFG);
    expect(web.ownershipFulfilment).toBe(1);
  });

  it("ownership (live config): a new-entrant flag is a new entrant, not fulfilment", () => {
    const flagged = shareholders.map((s, i) => (i === 0 ? { ...s, blackNewEntrant: true } : s));
    const web = calculateOwnershipScore(any({ shareholders: flagged, companyValue: 0, outstandingDebt: 0, yearsHeld: 0 }), CFG);
    expect(web.ownershipFulfilment).toBe(0);
    expect(web.newEntrants).toBe(1);
  });

  it("management control: a black woman at Senior is not top management when an executive exists", () => {
    const web = calculateTransportQseManagement(any({ employees }), CFG);
    expect(web.score).toBe(25);
  });

  it("procurement: recognised spend, excluded lines out, a stated non-empowering supplier out", () => {
    const web = calculateProcurementScore(any({ id: "", clientId: "", tmps, suppliers }), CFG);
    // 400k x 1.35 recognised = 540k against 40% of 3m = 1.2m -> 11.25
    expect(web.total).toBeCloseTo(11.25, 2);
  });
});
