import {
  FSC_AFS_META_BANKS,
  FSC_AFS_META_LTI,
  FSC_AFS_META_STI,
  FSC_SED_META,
  fscSubSectorHasAfs,
} from "./sections";
import { normalizeFscSubSector } from "./workbookClientSync";

/** All financial-information meta keys used by FSC AFS sub-sector variants. */
export const FSC_AFS_META_KEYS = [
  ...FSC_AFS_META_BANKS,
  ...FSC_AFS_META_LTI,
  ...FSC_AFS_META_STI,
].map((f) => f.key);

/** SED meta keys for FSC Consumer Education aggregates. */
export const FSC_CE_META_KEYS = FSC_SED_META.map((f) => f.key);

function afsKeysForSubSector(subSector: string): string[] {
  const norm = normalizeFscSubSector(subSector);
  if (norm === "Banks") return FSC_AFS_META_BANKS.map((f) => f.key);
  if (norm === "LTI") return FSC_AFS_META_LTI.map((f) => f.key);
  if (norm === "STI") return FSC_AFS_META_STI.map((f) => f.key);
  return [];
}

/** Strip all AFS indicator keys from financial-information meta (AFS lives in afs-additions). */
export function stripAfsMetaFromFinancial(
  finMeta: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...finMeta };
  for (const key of FSC_AFS_META_KEYS) {
    delete next[key];
  }
  return next;
}

/**
 * Build afs-additions meta for the selected sub-sector, migrating legacy values
 * stored on financial-information when present.
 */
export function extractAfsMetaForSubSector(
  finMeta: Record<string, unknown>,
  subSector: string,
  existingAfsMeta: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!fscSubSectorHasAfs(subSector)) return {};
  const keep = new Set(afsKeysForSubSector(subSector));
  const next: Record<string, unknown> = { ...existingAfsMeta };
  for (const key of keep) {
    const fromFin = finMeta[key];
    const fromAfs = existingAfsMeta[key];
    if (fromFin !== undefined && fromFin !== "") {
      next[key] = fromFin;
    } else if (fromAfs !== undefined && fromAfs !== "") {
      next[key] = fromAfs;
    } else {
      delete next[key];
    }
  }
  for (const key of FSC_AFS_META_KEYS) {
    if (!keep.has(key)) delete next[key];
  }
  return next;
}

/** @deprecated Use stripAfsMetaFromFinancial — AFS no longer lives on financial-information. */
export function pruneFinancialMetaForFscSubSector(
  finMeta: Record<string, unknown>,
  _subSector: string,
): Record<string, unknown> {
  return stripAfsMetaFromFinancial(finMeta);
}

/** Strip all FSC-specific financial meta when sector is not FSC. */
export function pruneFinancialMetaWhenLeavingFsc(
  finMeta: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...finMeta };
  for (const key of [...FSC_AFS_META_KEYS, "priorYearRevenue"]) {
    delete next[key];
  }
  return next;
}

/** Strip FSC company-information fields when sector is not FSC. */
export function pruneCompanyMetaWhenLeavingFsc(
  companyMeta: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...companyMeta };
  delete next.fscSubSector;
  delete next.fscReinsurer;
  return next;
}

/** Strip FSC CE aggregates from SED meta when sector is not FSC. */
export function pruneSedMetaWhenLeavingFsc(
  sedMeta: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...sedMeta };
  for (const key of FSC_CE_META_KEYS) {
    delete next[key];
  }
  return next;
}
