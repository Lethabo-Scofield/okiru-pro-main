/**
 * ESG sector config registry.
 *
 * Mirrors the B-BBEE pattern in `apps/web/Toolkit/src/lib/sectors/` and
 * `apps/web/lib/pipeline/sectorConfig.ts`: one file per sector, one flat
 * `ALL_CONFIGS` array, `get…` + `list…` accessors, no scattered `??` defaults.
 *
 * Lookup accepts BOTH the internal id (`"consumer-goods"`) and the exact string
 * the ESG cover screen persists (`"FMCG / Distribution"`), because the workbook
 * stores the cover label, not the id.
 */

import { ESG_SECTOR_AGRICULTURE } from "./sectors/agriculture";
import { ESG_SECTOR_CONSTRUCTION } from "./sectors/construction";
import { ESG_SECTOR_CONSUMER_GOODS } from "./sectors/consumer-goods";
import { ESG_SECTOR_EDUCATION } from "./sectors/education";
import { ESG_SECTOR_FINANCIAL_SERVICES } from "./sectors/financial-services";
import { ESG_SECTOR_GENERIC } from "./sectors/generic";
import { ESG_SECTOR_HEALTHCARE } from "./sectors/healthcare";
import { ESG_SECTOR_HOSPITALITY } from "./sectors/hospitality";
import { ESG_SECTOR_ICT } from "./sectors/ict";
import { ESG_SECTOR_MANUFACTURING } from "./sectors/manufacturing";
import { ESG_SECTOR_MINING } from "./sectors/mining";
import { ESG_SECTOR_PUBLIC_SECTOR } from "./sectors/public-sector";
import { ESG_SECTOR_RETAIL } from "./sectors/retail";
import { ESG_SECTOR_TRANSPORT_LOGISTICS } from "./sectors/transport-logistics";
import type { EsgSectorConfig, EsgSectorId } from "./types";

export type {
  EsgBbbeeElementWeights,
  EsgCarbonTaxParams,
  EsgDeepPartial,
  EsgEmissionFactors,
  EsgPillarMaxima,
  EsgPillarWeights,
  EsgRatingBands,
  EsgReportingDefaults,
  EsgSectorCalibration,
  EsgSectorConfig,
  EsgSectorId,
  EsgSectorOverrides,
  EsgSectorSpec,
  EsgSectorValues,
  EsgStanceKey,
  EsgThresholds,
} from "./types";

export {
  ESG_BASE_VALUES,
  ESG_STANCE_FLOOR,
  ESG_STANCE_FLOOR_BY_LABEL,
  defineEsgSector,
  isInheritedEsgValue,
  stanceFloorFromWorkbook,
} from "./base";

export {
  ESG_SECTOR_AGRICULTURE,
  ESG_SECTOR_CONSTRUCTION,
  ESG_SECTOR_CONSUMER_GOODS,
  ESG_SECTOR_EDUCATION,
  ESG_SECTOR_FINANCIAL_SERVICES,
  ESG_SECTOR_GENERIC,
  ESG_SECTOR_HEALTHCARE,
  ESG_SECTOR_HOSPITALITY,
  ESG_SECTOR_ICT,
  ESG_SECTOR_MANUFACTURING,
  ESG_SECTOR_MINING,
  ESG_SECTOR_PUBLIC_SECTOR,
  ESG_SECTOR_RETAIL,
  ESG_SECTOR_TRANSPORT_LOGISTICS,
};

/**
 * Every sector the ESG cover screen offers, in the order `COVER_FIELDS.sector`
 * lists them (which is itself the `Assumptions!B8` data-validation order).
 */
const ALL_CONFIGS: readonly EsgSectorConfig[] = Object.freeze([
  ESG_SECTOR_GENERIC,
  ESG_SECTOR_CONSUMER_GOODS,
  ESG_SECTOR_TRANSPORT_LOGISTICS,
  ESG_SECTOR_MANUFACTURING,
  ESG_SECTOR_FINANCIAL_SERVICES,
  ESG_SECTOR_ICT,
  ESG_SECTOR_AGRICULTURE,
  ESG_SECTOR_MINING,
  ESG_SECTOR_CONSTRUCTION,
  ESG_SECTOR_RETAIL,
  ESG_SECTOR_HOSPITALITY,
  ESG_SECTOR_HEALTHCARE,
  ESG_SECTOR_EDUCATION,
  ESG_SECTOR_PUBLIC_SECTOR,
]);

export const ESG_DEFAULT_SECTOR_ID: EsgSectorId = "generic";

/**
 * Extra spellings we accept, beyond each config's own id, label, cover label and
 * `reporting.sectorVariant`. Keys are normalised on the way in, so casing,
 * spacing and punctuation are free.
 */
const SECTOR_ALIASES: Record<string, EsgSectorId> = {
  fmcg: "consumer-goods",
  consumergoods: "consumer-goods",
  transport: "transport-logistics",
  logistics: "transport-logistics",
  roadfreight: "transport-logistics",
  finserv: "financial-services",
  fsc: "financial-services",
  technology: "ict",
  ict: "ict",
  agri: "agriculture",
  agribee: "agriculture",
  government: "public-sector",
};

/** Fold a user/workbook string down to a comparable key. */
function normaliseKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolution order matters. Ids and cover labels are authoritative; softer keys
 * (plain label, `reporting.sectorVariant`, aliases) may only fill a gap, never
 * displace an exact match.
 *
 * Concretely: every sector that inherits its `reporting.sectorVariant` carries
 * the string "Generic", so indexing that field last-wins would make
 * `getEsgSectorConfig("Generic")` resolve to whichever sector happened to be
 * declared last.
 */
const BY_KEY: Map<string, EsgSectorConfig> = (() => {
  const map = new Map<string, EsgSectorConfig>();

  const claim = (raw: string, config: EsgSectorConfig): void => {
    const key = normaliseKey(raw);
    if (!key || map.has(key)) return;
    map.set(key, config);
  };

  for (const config of ALL_CONFIGS) claim(config.id, config);
  for (const config of ALL_CONFIGS) claim(config.coverLabel, config);
  for (const config of ALL_CONFIGS) claim(config.label, config);
  // `Assumptions!B10` verbatim — e.g. "Transport / FMCG Distribution". Only the
  // sectors that actually override it contribute a new key here.
  for (const config of ALL_CONFIGS) claim(config.reporting.sectorVariant, config);

  for (const [alias, id] of Object.entries(SECTOR_ALIASES)) {
    const target = ALL_CONFIGS.find((c) => c.id === id);
    if (target) claim(alias, target);
  }

  return map;
})();

/** Every sector config, in cover-screen order. */
export function listEsgSectorConfigs(): readonly EsgSectorConfig[] {
  return ALL_CONFIGS;
}

/** Every sector id, in cover-screen order. */
export function listEsgSectorIds(): readonly EsgSectorId[] {
  return ALL_CONFIGS.map((c) => c.id);
}

/** Every cover-screen label, in cover-screen order. Must match `COVER_FIELDS.sector`. */
export function listEsgSectorCoverLabels(): readonly string[] {
  return ALL_CONFIGS.map((c) => c.coverLabel);
}

/**
 * Strict lookup — `undefined` when the sector is not one we configure. Use when
 * you need to know whether the sector was actually recognised.
 */
export function findEsgSectorConfig(
  sector: string | null | undefined,
): EsgSectorConfig | undefined {
  if (sector == null) return undefined;
  const key = normaliseKey(String(sector));
  if (!key) return undefined;
  return BY_KEY.get(key);
}

/**
 * Lookup with a safe fallback to Generic. Scoring paths should use this: an
 * unrecognised sector must never silently mean "score them as FMCG".
 */
export function getEsgSectorConfig(sector: string | null | undefined): EsgSectorConfig {
  return findEsgSectorConfig(sector) ?? ESG_SECTOR_GENERIC;
}

/** Sectors whose values are entirely carried over from the shared base. */
export function listUncalibratedEsgSectors(): readonly EsgSectorConfig[] {
  return ALL_CONFIGS.filter((c) => c.calibration === "inherited");
}
