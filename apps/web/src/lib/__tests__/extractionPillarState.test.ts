/**
 * The upload flow's score preview and its final Submit read the same
 * pillarData from /api/calculate-from-extraction. The preview scores it
 * without touching the store; Submit hydrates the store and recalculates.
 * Both go through mapExtractionPillarData and the Toolkit calculator, so the
 * preview must be exactly the number Submit then shows. (Invented company.)
 */
import { afterEach, describe, expect, it } from "vitest";
import { useBbeeStore } from "@toolkit/lib/store";
import { RCOGP_GENERIC_CALCULATOR_CONFIG as CFG } from "@toolkit/lib/sectors/rcogp-generic";
import {
  mapExtractionPillarData,
  scoreExtractionPillarData,
  toScorecardPreview,
  type ExtractionPillarData,
} from "../extractionPillarState";

const pillarData: ExtractionPillarData = {
  shareholders: [
    { name: "Thandi Mokoena", blackOwnership: 0.6, blackWomenOwnership: 0.6, shares: 60 },
    { name: "Peter Owen", blackOwnership: 0, blackWomenOwnership: 0, shares: 40 },
  ],
  employees: [
    { name: "Thandi Mokoena", race: "African", gender: "Female", designation: "Executive Director" },
    { name: "Sam Dube", race: "African", gender: "Male", designation: "Senior" },
    { name: "Ann Smith", race: "White", gender: "Female", designation: "Junior" },
  ],
  suppliers: [
    { name: "Riverbend Supplies", spend: 500_000, beeLevel: 1, blackOwnership: 0.8, blackWomenOwnership: 0.4, enterpriseType: "eme" },
    { name: "Northgate Logistics", spend: 250_000, beeLevel: 4, blackOwnership: 0.2, blackWomenOwnership: 0, enterpriseType: "generic" },
  ],
  contributions: [
    { beneficiary: "Riverbend Supplies", type: "grant", amount: 40_000, category: "sd" },
    { beneficiary: "Hilltop Creche", type: "grant", amount: 15_000, category: "sed" },
  ],
  trainingPrograms: [{ name: "Forklift learnership", cost: 30_000, race: "African", gender: "Male" }],
  financials: { revenue: 30_000_000, npat: 2_000_000, leviableAmount: 4_000_000, tmps: 1_000_000 },
};
const identity = { name: "Example Trading", sectorCode: "RCOGP", registrationNumber: "2020/000000/07" };

const initial = useBbeeStore.getState();
afterEach(() => useBbeeStore.setState(initial, true));

describe("extraction pillarData → Toolkit state", () => {
  it("maps rows onto the base without writing to it", () => {
    const base = useBbeeStore.getState();
    const before = JSON.stringify({ o: base.ownership, e: base.esd, s: base.sed });
    const mapped = mapExtractionPillarData(pillarData, base, identity);

    expect(JSON.stringify({ o: base.ownership, e: base.esd, s: base.sed })).toBe(before);
    expect(mapped.client.name).toBe("Example Trading");
    expect(mapped.client.revenue).toBe(30_000_000);
    expect(mapped.ownership.shareholders).toHaveLength(2);
    expect(mapped.management.employees).toHaveLength(3);
    expect(mapped.procurement.tmps).toBe(1_000_000);
    expect(mapped.esd.contributions.map((c) => c.category)).toEqual(["supplier_development"]);
    expect(mapped.sed.contributions.map((c) => c.category)).toEqual(["socio_economic"]);
  });

  it("scores the preview exactly as Submit's store hydration then scores it", () => {
    const preview = scoreExtractionPillarData(pillarData, useBbeeStore.getState(), identity, CFG);

    // Submit: config into the store, mapped slices into the store, recalculate.
    useBbeeStore.setState({ calculatorConfig: CFG, activeClientId: "upload-test" });
    useBbeeStore.setState({ isLoaded: true, ...mapExtractionPillarData(pillarData, useBbeeStore.getState(), identity) });
    useBbeeStore.getState()._recalculateAll();

    expect(useBbeeStore.getState().scorecard).toEqual(preview);
    expect(preview.total.score).toBeGreaterThan(0);
  });

  it("shapes the preview card from the Toolkit result", () => {
    const sc = scoreExtractionPillarData(pillarData, useBbeeStore.getState(), identity, CFG);
    const card = toScorecardPreview(sc);

    expect(card.beeLevel).toBe(sc.discountedLevel);
    expect(card.totalPoints).toBe(sc.total.score);
    expect(card.maxPoints).toBe(sc.total.target);
    expect(card.pillars.map((p) => p.pillarCode)).toContain("ownership");
    for (const p of card.pillars) expect(p.maxPoints).toBeGreaterThan(0);
  });
});
