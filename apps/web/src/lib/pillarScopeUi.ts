/**
 * Maps toolkit / workspace scope keys (same as server SCORECARD_PILLAR_KEYS)
 * to calculator / scorecard pillar codes used in hierarchical & legacy results.
 */
export const SCOPE_TO_CALCULATOR_CODES: Record<string, readonly string[]> = {
  ownership: ["ownership"],
  /** MC + EE share the management slice in Build; scorecard may expose both codes */
  management: ["managementControl", "employmentEquity"],
  employmentEquity: ["employmentEquity", "managementControl"],
  skills: ["skillsDevelopment"],
  procurement: ["preferentialProcurement"],
  supplierDevelopment: ["supplierDevelopment", "enterpriseSupplierDevelopment"],
  enterpriseDevelopment: ["enterpriseDevelopment", "enterpriseSupplierDevelopment"],
  sed: ["socioEconomicDevelopment"],
  yes: ["yesInitiative"],
};

/** Maps calculator config keys to short Build sidebar ids (BuildPillarsStep). */
export const BUILD_PILLAR_ID_MAP: Record<string, string> = {
  managementControl: "management",
  skillsDevelopment: "skills",
  preferentialProcurement: "procurement",
  socioEconomicDevelopment: "sed",
  yesInitiative: "yes",
  ownership: "ownership",
  supplierDevelopment: "supplierDevelopment",
  enterpriseDevelopment: "enterpriseDevelopment",
};

/**
 * Scope keys → sidebar pillar ids for Build UI (employmentEquity → management only).
 */
export function expandScopeToVisibleIds(scopes: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of scopes) {
    if (raw === "employmentEquity") {
      out.add("management");
      continue;
    }
    const mapped = BUILD_PILLAR_ID_MAP[raw] || raw;
    out.add(mapped);
  }
  return out;
}

export function getCalculatorPillarCodesForScopes(pillarScopes: string[]): Set<string> {
  const codes = new Set<string>();
  for (const s of pillarScopes) {
    const list = SCOPE_TO_CALCULATOR_CODES[s];
    if (list) {
      for (const c of list) codes.add(c);
    } else {
      codes.add(s);
    }
  }
  return codes;
}

export function filterScorecardPillarRows<T extends { code: string }>(
  rows: T[],
  pillarScopes: string[] | null | undefined,
): T[] {
  if (!pillarScopes?.length) return rows;
  const allow = getCalculatorPillarCodesForScopes(pillarScopes);
  return rows.filter((r) => allow.has(r.code));
}

export function filterSubMinimumsByScope(
  subMinimums: Record<string, boolean> | undefined | null,
  pillarScopes: string[] | null | undefined,
): Record<string, boolean> | undefined {
  if (!subMinimums || !pillarScopes?.length) return subMinimums ?? undefined;
  const allow = getCalculatorPillarCodesForScopes(pillarScopes);
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(subMinimums)) {
    if (allow.has(k)) out[k] = v;
  }
  return Object.keys(out).length ? out : {};
}

export function sumPillarRows<T extends { score: number; maxPoints: number }>(rows: T[]): {
  score: number;
  maxPoints: number;
} {
  return rows.reduce(
    (acc, r) => ({
      score: acc.score + (Number(r.score) || 0),
      maxPoints: acc.maxPoints + (Number(r.maxPoints) || 0),
    }),
    { score: 0, maxPoints: 0 },
  );
}
