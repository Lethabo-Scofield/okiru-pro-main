import { describe, expect, it } from "vitest";
import { COVER_FIELDS } from "@/components/esg-workbook/esgSectionConfigs";
import {
  ESG_BASE_VALUES,
  ESG_DEFAULT_SECTOR_ID,
  ESG_SECTOR_CONSUMER_GOODS,
  ESG_SECTOR_GENERIC,
  findEsgSectorConfig,
  getEsgSectorConfig,
  isInheritedEsgValue,
  listEsgSectorConfigs,
  listEsgSectorCoverLabels,
  listEsgSectorIds,
  listUncalibratedEsgSectors,
  type EsgSectorConfig,
} from "..";

/** The sector list the ESG cover screen actually offers. */
const coverSectorOptions: string[] = (() => {
  const field = COVER_FIELDS.find((f) => f.cell === "sector");
  return field?.options ?? [];
})();

/** Walk every leaf of a config's value payload. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  const out: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out.push(...leafPaths(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

const VALUE_KEYS = [
  "stanceFloor",
  "emissionFactors",
  "thresholds",
  "carbonTax",
  "pillarMax",
  "pillarWeights",
  "ratingBands",
  "reporting",
  "bbbeeElementWeights",
  "benchmarks",
  "defaultSites",
  "defaultMonths",
] as const;

describe("ESG sector registry", () => {
  it("the UI offers 14 sectors and we have a config for each", () => {
    expect(coverSectorOptions.length).toBe(14);
    expect(listEsgSectorConfigs()).toHaveLength(14);

    for (const option of coverSectorOptions) {
      const config = findEsgSectorConfig(option);
      expect(config, `no ESG sector config for cover option "${option}"`).toBeDefined();
      expect(config!.coverLabel).toBe(option);
    }
  });

  it("cover labels round-trip in the same order the UI lists them", () => {
    expect(listEsgSectorCoverLabels()).toEqual(coverSectorOptions);
  });

  it("sector ids are unique and resolvable", () => {
    const ids = listEsgSectorIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(findEsgSectorConfig(id)?.id).toBe(id);
    }
  });

  it("lookup tolerates casing, spacing and punctuation", () => {
    expect(getEsgSectorConfig("FMCG / Distribution").id).toBe("consumer-goods");
    expect(getEsgSectorConfig("fmcg/distribution").id).toBe("consumer-goods");
    expect(getEsgSectorConfig("  FMCG/Distribution  ").id).toBe("consumer-goods");
    expect(getEsgSectorConfig("consumer-goods").id).toBe("consumer-goods");
    expect(getEsgSectorConfig("fmcg").id).toBe("consumer-goods");
    // Assumptions!B10 verbatim
    expect(getEsgSectorConfig("Transport / FMCG Distribution").id).toBe("consumer-goods");
    expect(getEsgSectorConfig("Transport / Logistics").id).toBe("transport-logistics");
    expect(getEsgSectorConfig("ICT / Technology").id).toBe("ict");
    expect(getEsgSectorConfig("Public Sector").id).toBe("public-sector");
  });

  it("an unknown or missing sector falls back to Generic, never to FMCG", () => {
    for (const input of [null, undefined, "", "   ", "Underwater Basket Weaving"]) {
      const config = getEsgSectorConfig(input);
      expect(config.id).toBe(ESG_DEFAULT_SECTOR_ID);
      expect(config).toBe(ESG_SECTOR_GENERIC);
      expect(config.id).not.toBe("consumer-goods");
    }
    expect(findEsgSectorConfig("Underwater Basket Weaving")).toBeUndefined();
  });

  it("no config has an undefined required field", () => {
    for (const config of listEsgSectorConfigs()) {
      expect(config.id, "id").toBeTruthy();
      expect(config.label, `${config.id} label`).toBeTruthy();
      expect(config.coverLabel, `${config.id} coverLabel`).toBeTruthy();
      expect(config.notes, `${config.id} notes`).toBeTruthy();
      expect(["workbook-verified", "inherited"]).toContain(config.calibration);

      for (const key of VALUE_KEYS) {
        expect(config[key], `${config.id}.${key}`).toBeDefined();
      }

      for (const path of leafPaths({
        stanceFloor: config.stanceFloor,
        emissionFactors: config.emissionFactors,
        thresholds: config.thresholds,
        carbonTax: config.carbonTax,
        pillarMax: config.pillarMax,
        pillarWeights: config.pillarWeights,
        ratingBands: config.ratingBands,
        reporting: config.reporting,
        bbbeeElementWeights: config.bbbeeElementWeights,
      })) {
        const value = path
          .split(".")
          .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], config);
        expect(value, `${config.id}.${path} is undefined`).toBeDefined();
        expect(value, `${config.id}.${path} is null`).not.toBeNull();
        if (typeof value === "number") {
          expect(Number.isFinite(value), `${config.id}.${path} is not finite`).toBe(true);
        }
      }
    }
  });

  it("every numeric threshold, factor and tax parameter is finite and non-negative", () => {
    for (const config of listEsgSectorConfigs()) {
      const numeric: Record<string, number> = {
        ...config.emissionFactors,
        ...config.thresholds,
        ...config.carbonTax,
        ...config.pillarMax,
        ...config.pillarWeights,
        ...config.ratingBands,
        ...config.bbbeeElementWeights,
      };
      for (const [key, value] of Object.entries(numeric)) {
        expect(Number.isFinite(value), `${config.id}.${key}`).toBe(true);
        expect(value, `${config.id}.${key}`).toBeGreaterThanOrEqual(0);
      }
      expect(
        config.pillarWeights.environmental +
          config.pillarWeights.social +
          config.pillarWeights.governance,
      ).toBeCloseTo(1, 10);
    }
  });

  it("marks inherited values explicitly, so a default cannot pass as a finding", () => {
    const allLeaves = leafPaths({
      stanceFloor: ESG_BASE_VALUES.stanceFloor,
      emissionFactors: ESG_BASE_VALUES.emissionFactors,
      thresholds: ESG_BASE_VALUES.thresholds,
      carbonTax: ESG_BASE_VALUES.carbonTax,
      pillarMax: ESG_BASE_VALUES.pillarMax,
      pillarWeights: ESG_BASE_VALUES.pillarWeights,
      ratingBands: ESG_BASE_VALUES.ratingBands,
      reporting: ESG_BASE_VALUES.reporting,
      bbbeeElementWeights: ESG_BASE_VALUES.bbbeeElementWeights,
      defaultSites: ESG_BASE_VALUES.defaultSites,
      defaultMonths: ESG_BASE_VALUES.defaultMonths,
    }).sort();

    for (const config of listEsgSectorConfigs()) {
      const covered = [...config.inheritedPaths, ...config.sectorSpecificPaths].sort();
      expect(covered, `${config.id} does not account for every base leaf`).toEqual(allLeaves);
      // A path is inherited XOR sector-specific — never both.
      for (const path of config.sectorSpecificPaths) {
        expect(config.inheritedPaths).not.toContain(path);
      }
    }
  });

  it("Generic inherits everything and overrides nothing", () => {
    expect(ESG_SECTOR_GENERIC.sectorSpecificPaths).toHaveLength(0);
    expect(ESG_SECTOR_GENERIC.calibration).toBe("inherited");
    expect(isInheritedEsgValue(ESG_SECTOR_GENERIC, "thresholds.wasteDiversion")).toBe(true);
  });

  it("FMCG is the only workbook-verified sector; the other 13 are declared inherited", () => {
    const verified = listEsgSectorConfigs().filter((c) => c.calibration === "workbook-verified");
    expect(verified.map((c) => c.id)).toEqual(["consumer-goods"]);
    expect(listUncalibratedEsgSectors()).toHaveLength(13);

    // The honest claim: FMCG owns the site/month seeds and the workbook's own
    // sector + period strings. Everything else it shares with the base.
    expect([...ESG_SECTOR_CONSUMER_GOODS.sectorSpecificPaths].sort()).toEqual([
      "defaultMonths",
      "defaultSites",
      "reporting.reportingPeriodLabel",
      "reporting.sectorVariant",
    ]);
    expect(isInheritedEsgValue(ESG_SECTOR_CONSUMER_GOODS, "pillarWeights.environmental")).toBe(
      true,
    );
  });

  it("every non-FMCG sector inherits the fuel-intensive pillar weighting (known gap)", () => {
    // Assumptions!E98 justifies E = 0.4 as "GHG-weighted; FMCG/Distribution is
    // fuel-intensive". Nothing else has been calibrated, and this test exists so
    // that fact stays visible rather than becoming folklore.
    for (const config of listEsgSectorConfigs()) {
      expect(config.pillarWeights.environmental).toBe(0.4);
      expect(isInheritedEsgValue(config, "pillarWeights.environmental")).toBe(true);
    }
  });

  it("does not fabricate sector benchmarks", () => {
    for (const config of listEsgSectorConfigs()) {
      expect(Object.keys(config.benchmarks), `${config.id} benchmarks`).toEqual([]);
    }
  });

  it("national emission factors and carbon tax are shared, not per-sector", () => {
    const configs = listEsgSectorConfigs();
    const first = configs[0] as EsgSectorConfig;
    for (const config of configs) {
      expect(config.emissionFactors).toEqual(first.emissionFactors);
      expect(config.carbonTax).toEqual(first.carbonTax);
      expect(config.stanceFloor).toEqual(first.stanceFloor);
    }
    // Assumptions!B33 — Eskom NERSA 2024 grid factor.
    expect(first.emissionFactors.electricityScope2).toBe(0.82);
    // Assumptions!B34 — solar PV lifecycle. NOT the grid factor.
    expect(first.emissionFactors.solarOnsite).toBe(0.025);
  });
});
