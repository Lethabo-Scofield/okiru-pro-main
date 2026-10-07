import { ESG_D9_PILLAR_DIVISOR } from "@/lib/esgScoringDefaults";
/**
 * `E_Scorecard` rows 5–29 — Environmental pillar.
 *
 * Ledger: `docs/esg/ESG_FORMULA_LEDGER.md` Part 1A. Every indicator below cites
 * the workbook's own column-C formula. Divergences are listed in
 * `docs/esg/ESG_SCORING_DELTA.md`.
 *
 * The summary cells read here (`E_Data!L19/L46/L50:L54/L63/L80/L81`,
 * `Waste_Register!B16:B18`, `Fleet_Register!B28/H28/_l100_*`) are produced by
 * `apps/web/src/lib/esg/esgDeriveSummary.ts` from the raw input grids — that is
 * the app's stand-in for the workbook's formula layer. Nothing here re-derives
 * them.
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import {
  PILLAR_MAX_ENVIRONMENTAL,
  stanceFloorFromWorkbook,
} from "../esgConfig/consumer-goods";
import { esgSectorConfigForWorkbook } from "../esgConfig";
import { computeGhgInventory } from "./ghgInventory";
import { minCap, pr, scoringMode, yesPartialNo, type EsgScoringOptions } from "./shared";
import {
  applicableMaxFor,
  exclude,
  mergeExclusions,
  readDeclaredExclusions,
  type EsgExclusion,
  type EsgPillarResult,
} from "./esgApplicability";
import {
  environmentalTargetBasis,
  environmentalTargetReason,
  readTargetBasis,
  resolveTarget,
} from "./esgTargets";
import {
  answerRule,
  bandedRule,
  cell as traceCell,
  presentRule,
  ratingRule,
  targetSource,
  type EsgTraceUnit,
} from "./esgTrace";

export type EnvironmentalScoreResult = EsgPillarResult;

/**
 * SECTOR THRESHOLDS ARE READ PER WORKBOOK, not bound at module load.
 *
 * This was `const THRESHOLDS = ESG_CONSUMER_GOODS_CONFIG.thresholds` — one
 * client's FMCG numbers, fixed at import time, used to score every company in
 * all fourteen sectors the cover screen offers. The sector registry existed
 * and `ghgInventory.ts` was its only reader, so a mining company got mining
 * emission factors and a consumer-goods waste-diversion target.
 *
 * Today this is a NO-OP numerically: thirteen of the fourteen sectors inherit
 * the base end to end, so every lookup returns the same figure it did before.
 * That is the point of landing it first — calibrating a sector is meaningless
 * while the scorers cannot see which sector they are in, and would have
 * produced exactly the configured-but-never-read pattern this codebase has
 * been digging out all week.
 *
 * An explicit `Assumptions` cell still wins over the sector default, because a
 * company that states its own target outranks any benchmark we hold for it.
 */
function sectorThresholds(workbook: EsgWorkbookData) {
  return esgSectorConfigForWorkbook(workbook).thresholds;
}

/** `E_Data!L50:L54` — the five depot solar-generation YTD cells. */
const SOLAR_ROWS = ["L50", "L51", "L52", "L53", "L54"] as const;

function num(wb: EsgWorkbookData, ref: string, section = "e-data"): number {
  return readEsgCell(wb, section, ref) ?? 0;
}

export function scoreEnvironmental(
  workbook: EsgWorkbookData,
  options?: EsgScoringOptions,
): EnvironmentalScoreResult {
  const mode = scoringMode(options);

  // `Assumptions!B9` is DERIVED-ONLY and always numeric after
  // `deriveEsgSummaryCells`; `B6` is the legacy address the current form still
  // writes the stance label to (ledger Part 3).
  const stanceLabel = workbook.sections?.assumptions?.cells?.B6;
  const floor = stanceFloorFromWorkbook(
    typeof stanceLabel === "boolean" ? null : stanceLabel,
    readEsgCell(workbook, "assumptions", "B9"),
  );
  const thresholds = sectorThresholds(workbook);

  /*
   * Environmental targets are the company's own (D5). "For E the company needs
   * to determine their own targets" — Z. Mnanzana, 14 September 2026.
   *
   * These four fell back to a sector default whenever the company had not set
   * one: a 10% annual emissions cut, 20% renewable electricity, 5% electric
   * vehicles and 75% waste diversion, which nobody outside the office had
   * approved. They now follow the declared target basis exactly as Social's
   * do: a target the company has not set cannot be scored, so its indicators
   * leave the total with the reason stated. B-BBEE sets no environmental
   * targets, so electing it for Social reads as "the company's own" here.
   *
   * One target can drive two indicators (B43 the emissions AND the energy
   * reduction; B44 the Scope 2 offset AND the solar share), and both go.
   * Parity mode keeps the workbook's constants, as Social's does.
   */
  const basis = mode === "workbook-parity" ? "bbbee" : readTargetBasis(workbook);
  const targetExclusions: EsgExclusion[] = [];
  const target = (keys: string[], cell: string, sectorDefault: number, label: string): number | null => {
    if (mode === "workbook-parity") return readEsgCell(workbook, "assumptions", cell) ?? sectorDefault;
    const resolved = resolveTarget(workbook, cell, sectorDefault, environmentalTargetBasis(basis));
    if (resolved == null) {
      const reason = environmentalTargetReason(basis, label);
      for (const key of keys) {
        const x = exclude("environmental", key, reason);
        if (x) targetExclusions.push(x);
      }
    }
    return resolved;
  };
  const thrGhgYoy = target(["d6", "d12"], "B43", thresholds.ghgYoyReduction, "the annual emissions reduction");
  const thrRenew = target(["d7", "d13"], "B44", thresholds.renewableElectricityMin, "the renewable electricity share");
  const thrEv = target(["d17"], "B46", thresholds.evFleetMin, "electric vehicles in the fleet");
  const thrWaste = target(["d19"], "B48", thresholds.wasteDiversion, "waste diversion");
  /** No target is not a target of zero: the indicator is excluded, this only keeps the arithmetic off it. */
  const prT = (actual: number, thr: number | null, max: number) => (thr == null ? 0 : pr(actual, thr, max, floor));

  const l19 = num(workbook, "L19");
  const l46 = num(workbook, "L46");
  const l63 = num(workbook, "L63");
  const b90 = num(workbook, "B90");
  const f90 = num(workbook, "F90");

  /* ------------------------------- GHG ------------------------------ */

  // C5 = =IF(E_Data!L19>0,5,0)
  const d5 = l19 > 0 ? 5 : 0;

  // C6 = =IFERROR(IF(B90=0,0,IF((B90-F90)/B90>=B43,10,
  //        IF((B90-F90)/B90>=B43*B9,10*((B90-F90)/B90)/B43,0))),0)
  //
  // F90 = L79 + L82 adds litres, kilograms and kilowatt-hours, so the sheet
  // measured a baseline in tonnes against a sum of mixed units. Corrected mode
  // compares tonnes with tonnes — this period's Scope 1 + 2 from the GHG
  // inventory, as the net-zero roadmap does — pro-rated to a year when the
  // period is shorter (Assumptions!B111), the way the carbon tax is: nine
  // months against a full-year baseline is not a 25% reduction.
  const inventory = mode === "workbook-parity" ? null : computeGhgInventory(workbook);
  const months = inventory?.dataMonths ?? null;
  const currentTco2e = inventory
    ? inventory.scope1And2 * (months && months > 0 && months < 12 ? 12 / months : 1)
    : f90;
  const d6 = b90 > 0 ? prT((b90 - currentTco2e) / b90, thrGhgYoy, 10) : 0;

  /*
   * C7 = =IFERROR(IF(M80=0,0,IF(-M81/M80>=B44,8,
   *        IF(-M81/M80>=B44*B9,8*(-M81/M80)/B44,0))),0)
   *
   * CORRECTED. `E_Data!M80`/`M81` do not exist — rows 80 and 81 stop at column
   * L — so the workbook's Scope-2 solar-offset indicator is 0 for every company
   * forever. The cells the formula means are `L80` (Scope 2 gross, `=L46`) and
   * `L81` (solar offset, `=SUM(L50:L54)`), and the leading minus is dropped
   * because `L81` is a POSITIVE kWh sum, not a negative adjustment.
   */
  const s2Gross = mode === "workbook-parity" ? num(workbook, "M80") : num(workbook, "L80");
  const s2Offset =
    mode === "workbook-parity" ? -num(workbook, "M81") : num(workbook, "L81");
  const d7 = s2Gross > 0 ? prT(s2Offset / s2Gross, thrRenew, 8) : 0;

  // C8 = =IF(E_Data!$L$63>0,5,0)
  const d8 = l63 > 0 ? 5 : 0;

  /*
   * C9 = =IF(AND(B107>=2030,B107<=2060),5,IF(B107>0,2.5,0))
   *
   * CORRECTED (unconditional score removed). `B107` used to fall back to the
   * config's `SBTI_TARGET_YEAR` (2050), so a workbook with no net-zero target
   * set — including a completely blank one — collected the full 5 points for
   * "Net-zero target formally set (SBTi)". A target the company never entered
   * is not a target.
   */
  const sbtiYear = readEsgCell(workbook, "assumptions", "B107") ?? 0;
  const d9 = sbtiYear >= 2030 && sbtiYear <= 2060 ? 5 : sbtiYear > 0 ? 2.5 : 0;

  /* ------------------------------ Energy ---------------------------- */

  // C11 = =IF(E_Data!L46>0,5,0)
  const d11 = l46 > 0 ? 5 : 0;

  /*
   * C12 — MANUAL_ZERO in the workbook (literal 0, no formula) because energy
   * efficiency YoY needs a prior-year kWh baseline the template never had.
   * `E_Data!B92` ("Prior-year total electricity (kWh)") now exists as an input,
   * so ledger 5.1's rule is live — it mirrors `d6` exactly, reusing
   * `THR_GHG_YOY` (B43) and the stance floor:
   *
   *   IF(B92=0,0,IF((B92-L46)/B92>=B43,5,
   *     IF((B92-L46)/B92>=B43*B9,5*((B92-L46)/B92)/B43,0)))
   */
  const priorYearKwh = num(workbook, "B92");
  const d12 =
    mode === "workbook-parity" || priorYearKwh <= 0
      ? 0
      : prT((priorYearKwh - l46) / priorYearKwh, thrGhgYoy, 5);

  /*
   * C13 = =IFERROR(IF(L46=0,0,IF((L50+L51+L52+L53+L54)/L46>=B44,8,
   *         IF((L50+…+L54)/L46>=B44*B9,8*((L50+…+L54)/L46)/B44,0))),0)
   */
  const solarKwh = SOLAR_ROWS.reduce((a, ref) => a + num(workbook, ref), 0);
  const d13 = l46 > 0 ? prT(solarKwh / l46, thrRenew, 8) : 0;

  /* ------------------------------- Fleet ---------------------------- */

  /*
   * C15 = =IFERROR(IF(COUNTA(Fleet_Register!A4:A19)=0,0,
   *         8*SUMPRODUCT((K4:K19>0)*(K4:K19<=L4:L19*B45))
   *           / MAX(1,COUNTIF(K4:K19,">0"))),0)
   *
   * The SUMPRODUCT / COUNTA / COUNTIF terms are pre-computed by
   * `esgDeriveSummary.deriveFleetRegister` (which also applies the `B45`
   * tolerance) and published as `_vehicle_count` / `_l100_within_norm` /
   * `_l100_positive`.
   */
  const vehicleCount = num(workbook, "_vehicle_count", "fleet");
  const l100WithinNorm = num(workbook, "_l100_within_norm", "fleet");
  const l100Positive = num(workbook, "_l100_positive", "fleet");
  const d15 =
    vehicleCount > 0 ? minCap((8 * l100WithinNorm) / Math.max(1, l100Positive), 8) : 0;

  // C16 = =IF(SUMPRODUCT((F4:F19>0)*(I4:I19>0))>0,5,0) — carry kg AND monthly km.
  const d16 = num(workbook, "_tonne_km_rows", "fleet") > 0 ? 5 : 0;

  /*
   * C17 = =IFERROR(IF(B28=0,0,IF(H28/B28>=B46,5,
   *         IF(H28/B28>=B46*B9,5*(H28/B28)/B46,0))),0)
   *
   * `B28`/`H28` are stored as TEXT ("134"/"0") in the source workbook;
   * `readEsgCell` number-coerces, so both shapes work.
   */
  const fleetVehicles = num(workbook, "B28", "fleet");
  const fleetEvs = num(workbook, "H28", "fleet");
  const d17 = fleetVehicles > 0 ? prT(fleetEvs / fleetVehicles, thrEv, 5) : 0;

  /* ------------------------------- Waste ---------------------------- */

  // C19 = =IFERROR(IF(B16>=B48,5,IF(B16>=B48*B9,5*B16/B48,0)),0)
  const d19 = prT(num(workbook, "B16", "waste"), thrWaste, 5);
  // C20 = =IF(Waste_Register!$B$17>0,4,0)
  const d20 = num(workbook, "B17", "waste") > 0 ? 4 : 0;
  // C21 = =IF(Waste_Register!$B$18>0,3,0)
  const d21 = num(workbook, "B18", "waste") > 0 ? 3 : 0;

  /* ------------------------------- Water ---------------------------- */

  // C23 = =IF(E_Data!L63>0,4,0)
  const d23 = l63 > 0 ? 4 : 0;

  /*
   * C24 — MANUAL_ZERO in the workbook. `E_Data!B94` ("Water efficiency
   * initiative active", Yes/No/Partial/N-A) now exists as an input, so ledger
   * 5.1's rule is live: IF(B94="Yes",3,IF(B94="Partial",1.5,0)).
   */
  const d24 =
    mode === "workbook-parity"
      ? 0
      : yesPartialNo(workbook.sections?.["e-data"]?.cells?.["B94"], 3);

  /* ----------------------- ISO 14001 / policy ----------------------- */

  /*
   * C26–C29 — MANUAL_ZERO in the workbook (four literal `0`s, no formulas),
   * and until now zero here too. That is twenty of the Environmental pillar's
   * 108 points which no company could reach however well it performed — while
   * the product still asked every one of them to complete a sixty-row ISO
   * clause tracker and a board-policy declaration in order to earn them.
   * Collecting evidence and then scoring it zero is worse than not asking.
   *
   * `esgDeriveSummary.deriveIsoTracker` now publishes the terms ledger §5.1's
   * rules need, matched by CLAUSE rather than by sheet row, with
   * "Not Applicable" excluded rather than handed full marks. Every rule below
   * reads 0 out of an empty register, so a blank workbook still earns nothing.
   *
   * Parity mode keeps the workbook's literal zeros, exactly as `d12` and `d24`
   * do, so `ESG_GOLDEN_SG_CONSUMER` is unaffected.
   */
  const parity = mode === "workbook-parity";
  const isoCert = num(workbook, "_cert_score", "iso-tracker");
  const isoAspects = num(workbook, "_aspects_score", "iso-tracker");
  const isoPolicy = num(workbook, "_policy_score", "iso-tracker");
  const isoLegal = num(workbook, "_legal_score", "iso-tracker");
  const emsScore = num(workbook, "_ems_score", "iso-tracker");
  const emsMax = num(workbook, "_ems_max", "iso-tracker");

  /*
   * C26 — ISO 14001 certification achieved or in progress.
   *
   * REWRITTEN against the actual certification process, replacing a blend of
   * "half for the certificate, half for EMS maturity" that had no source
   * behind it and handed up to 4 points to a company holding no certificate
   * at all.
   *
   * ISO 14001 is not a sliding scale. Stage 1 is a readiness review that
   * raises no non-conformities; Stage 2 tests whether the EMS is implemented
   * and effective; certification follows only once every MAJOR non-conformity
   * is closed. So there are three real states — certified, genuinely in
   * progress, and neither — which is what the tracker's own status vocabulary
   * already says. Scoring this row on the same Fully / Partially / Gap rule as
   * every other clause keeps one rule across the sheet instead of a special
   * case here.
   *
   * The gate is CDP's sequential-scoring principle: its bands run Disclosure →
   * Awareness → Management → Leadership, and failing a lower band BLOCKS the
   * points above it. A certificate is the top rung; an unassessed EMS beneath
   * it is an unevidenced claim, and earns nothing until the clauses behind it
   * have been assessed.
   *
   * That gate excludes the certification row from its own evidence. Gating on
   * the EMS total INCLUDING that row would be circular — the certificate
   * contributes to the roll-up, so a lone compliant certificate row would
   * vouch for itself and the gate would never bite. What must exist is an EMS
   * besides the claim.
   */
  const emsBesidesTheClaim = emsScore - isoCert > 0;
  const d26 = parity || !emsBesidesTheClaim ? 0 : minCap((8 * isoCert) / 5, 8);

  // C27 = 4*ISO_Tracker!E10/5 — the environmental aspects register.
  const d27 = parity ? 0 : minCap((4 * isoAspects) / 5, 4);

  /*
   * C28 = MIN(G_Data!F27, ISO_Tracker!E8) * 4/5 — the STRICTER of the board's
   * own declaration and the ISO clause-5.2 assessment. A policy the board
   * approved but the audit calls partial is partial.
   */
  const policyDeclared = num(workbook, "F27", "g-data");
  const d28 = parity ? 0 : minCap((Math.min(policyDeclared, isoPolicy) * 4) / 5, 4);

  /*
   * C29 = IF(G_Data!F21=0, 0, 4*ISO_Tracker!E11/5) — a legal register counts
   * only where the governance risk register it belongs to is live.
   */
  const legalRegisterLive = num(workbook, "F21", "g-data") > 0;
  const d29 = parity || !legalRegisterLive ? 0 : minCap((4 * isoLegal) / 5, 4);

  /* ----------------------- How each row was made (E2) ---------------------- */
  // Observes the values above; computes nothing the score depends on.
  const trace = options?.trace;
  if (trace) {
    const E = "E_Data";
    const PARITY_ZERO = "Workbook-parity scoring: the client workbook holds a literal 0 in this row.";
    const traceTarget = (ref: string, value: number | null, unit: EsgTraceUnit) => {
      if (value == null) return null;
      const stated = readEsgCell(workbook, "assumptions", ref) != null;
      const source = parity
        ? stated
          ? targetSource("workbook", `Assumptions!${ref}`)
          : targetSource("workbook-default")
        : targetSource("company", `Assumptions!${ref}`);
      return { value, unit, source };
    };
    const record = trace.record.bind(trace);

    record({
      key: "d5",
      measured: { value: l19, unit: "litres", label: "Fleet diesel this period (Scope 1A)" },
      target: null,
      inputs: [traceCell(E, "L19", "Fleet diesel, Scope 1A — litres, period total", l19)],
      rule: presentRule(5, "fleet diesel"),
    });
    record({
      key: "d6",
      measured: b90 > 0 ? { value: (b90 - currentTco2e) / b90, unit: "ratio", label: "Scope 1 + 2 reduction from the baseline" } : null,
      target: traceTarget("B43", thrGhgYoy, "ratio"),
      inputs: [
        traceCell(E, "B90", "Net-zero baseline (tCO₂e)", b90),
        inventory
          ? {
              ref: "GHG inventory",
              label: `This period's Scope 1 + 2 (tCO₂e)${months && months > 0 && months < 12 ? `, ${months} months scaled to a year` : ""}`,
              value: Math.round(currentTco2e * 100) / 100,
            }
          : traceCell(E, "F90", "This period's emissions as the workbook sums them", f90),
      ],
      rule: bandedRule(10, floor, "the reduction from the baseline"),
    });
    record({
      key: "d7",
      measured: s2Gross > 0 ? { value: s2Offset / s2Gross, unit: "ratio", label: "Solar offset as a share of Scope 2 electricity" } : null,
      target: traceTarget("B44", thrRenew, "ratio"),
      inputs: parity
        ? [traceCell(E, "M80", "Scope 2 gross (the workbook's reference)", s2Gross), traceCell(E, "M81", "Solar offset (the workbook's reference)", -s2Offset)]
        : [traceCell(E, "L80", "Scope 2 grid electricity (kWh)", s2Gross), traceCell(E, "L81", "Solar generation offset (kWh)", s2Offset)],
      rule: bandedRule(8, floor, "the solar share of Scope 2 electricity"),
    });
    record({
      key: "d8",
      measured: { value: l63, unit: "kL", label: "Water this period" },
      target: null,
      inputs: [traceCell(E, "L63", "Water — kilolitres, period total", l63)],
      rule: presentRule(5, "water use"),
    });
    record({
      key: "d9",
      measured: sbtiYear > 0 ? { value: sbtiYear, unit: "year", label: "Net-zero target year" } : null,
      target: null,
      inputs: [traceCell("Assumptions", "B107", "Net-zero target year", sbtiYear || null)],
      rule: "5 points for a net-zero target year from 2030 to 2060; 2.5 for any other year; nothing when none is set.",
    });
    record({
      key: "d11",
      measured: { value: l46, unit: "kWh", label: "Grid electricity this period" },
      target: null,
      inputs: [traceCell(E, "L46", "Grid electricity — kWh, period total", l46)],
      rule: presentRule(5, "grid electricity"),
    });
    record({
      key: "d12",
      measured: !parity && priorYearKwh > 0 ? { value: (priorYearKwh - l46) / priorYearKwh, unit: "ratio", label: "Electricity reduction on the prior year" } : null,
      target: traceTarget("B43", thrGhgYoy, "ratio"),
      inputs: [traceCell(E, "B92", "Prior-year electricity (kWh)", priorYearKwh || null), traceCell(E, "L46", "This period's electricity (kWh)", l46)],
      rule: parity ? PARITY_ZERO : bandedRule(5, floor, "the electricity reduction on the prior year"),
    });
    record({
      key: "d13",
      measured: l46 > 0 ? { value: solarKwh / l46, unit: "ratio", label: "Solar generation as a share of electricity use" } : null,
      target: traceTarget("B44", thrRenew, "ratio"),
      inputs: [traceCell(E, "L50:L54", "Solar generation (kWh, all sites)", solarKwh), traceCell(E, "L46", "Grid electricity (kWh)", l46)],
      rule: bandedRule(8, floor, "the solar share of electricity use"),
    });
    record({
      key: "d15",
      measured: l100Positive > 0 ? { value: l100WithinNorm / l100Positive, unit: "ratio", label: "Vehicles running within their fuel-rate norm" } : null,
      target: null,
      inputs: [
        traceCell("Fleet_Register", "A:A", "Vehicles listed", vehicleCount),
        traceCell("Fleet_Register", "K:K", "Vehicles with a measured L/100 km", l100Positive),
        traceCell("Fleet_Register", "K:L", "…of which within their norm (with the B45 tolerance)", l100WithinNorm),
      ],
      rule: "8 points × the share of vehicles with a measured L/100 km that run within their own norm; nothing without a fleet register.",
    });
    record({
      key: "d16",
      measured: { value: num(workbook, "_tonne_km_rows", "fleet"), unit: "count", label: "Vehicles with payload and monthly distance" },
      target: null,
      inputs: [traceCell("Fleet_Register", "F:F, I:I", "Vehicles carrying both a payload (kg) and monthly km", num(workbook, "_tonne_km_rows", "fleet"))],
      rule: presentRule(5, "payload and distance for at least one vehicle"),
    });
    record({
      key: "d17",
      measured: fleetVehicles > 0 ? { value: fleetEvs / fleetVehicles, unit: "ratio", label: "Electric share of the fleet" } : null,
      target: traceTarget("B46", thrEv, "ratio"),
      inputs: [traceCell("Fleet_Register", "B28", "Vehicles in the fleet", fleetVehicles), traceCell("Fleet_Register", "H28", "Electric vehicles", fleetEvs)],
      rule: bandedRule(5, floor, "the electric share of the fleet"),
    });
    record({
      key: "d19",
      measured: { value: num(workbook, "B16", "waste"), unit: "ratio", label: "Waste diversion rate" },
      target: traceTarget("B48", thrWaste, "ratio"),
      inputs: [traceCell("Waste_Register", "B16", "Waste diverted from landfill (share)", num(workbook, "B16", "waste"))],
      rule: bandedRule(5, floor, "the waste diversion rate"),
    });
    record({
      key: "d20",
      measured: { value: num(workbook, "B17", "waste"), unit: "ratio", label: "Monthly share recycled" },
      target: null,
      inputs: [traceCell("Waste_Register", "B17", "Recycled share, from the waste contractor's report", num(workbook, "B17", "waste"))],
      rule: presentRule(4, "a recycled share"),
    });
    record({
      key: "d21",
      measured: { value: num(workbook, "B18", "waste"), unit: "kg", label: "Waste to landfill" },
      target: null,
      inputs: [traceCell("Waste_Register", "B18", "Landfill waste (kg)", num(workbook, "B18", "waste"))],
      rule: presentRule(3, "landfill waste"),
    });
    record({
      key: "d23",
      measured: { value: l63, unit: "kL", label: "Water this period" },
      target: null,
      inputs: [traceCell(E, "L63", "Water — kilolitres, period total", l63)],
      rule: presentRule(4, "water use"),
    });
    record({
      key: "d24",
      measured: parity ? null : { value: String(workbook.sections?.["e-data"]?.cells?.["B94"] ?? "") || null, unit: "answer", label: "Water efficiency initiative active" },
      target: null,
      inputs: [traceCell(E, "B94", "Water efficiency initiative active", workbook.sections?.["e-data"]?.cells?.["B94"])],
      rule: parity ? PARITY_ZERO : answerRule(3, "A water efficiency initiative"),
    });
    record({
      key: "d26",
      measured: parity ? null : { value: isoCert, unit: "rating", label: "ISO 14001 certification status (0–5)" },
      target: null,
      inputs: [
        traceCell("ISO_Tracker", "certification", "Certification row, rated 0–5", isoCert),
        traceCell("ISO_Tracker", "clauses", "EMS clauses assessed, besides the certification row", Math.max(0, emsScore - isoCert)),
        traceCell("ISO_Tracker", "max", "EMS points available", emsMax),
      ],
      rule: parity
        ? PARITY_ZERO
        : "8 points × the certification rating ÷ 5 — but only once the EMS clauses behind it have been assessed (failing a lower band blocks the points above it); a certificate alone earns nothing.",
    });
    record({
      key: "d27",
      measured: parity ? null : { value: isoAspects, unit: "rating", label: "Environmental aspects register (0–5)" },
      target: null,
      inputs: [traceCell("ISO_Tracker", "6.1.2", "Environmental aspects register, rated 0–5", isoAspects)],
      rule: parity ? PARITY_ZERO : ratingRule(4, "The environmental aspects register (ISO clause 6.1.2)"),
    });
    record({
      key: "d28",
      measured: parity ? null : { value: Math.min(policyDeclared, isoPolicy), unit: "rating", label: "Environmental policy, the stricter rating (0–5)" },
      target: null,
      inputs: [
        traceCell("G_Data", "F27", "Environmental policy as the board declares it, 0–5", policyDeclared),
        traceCell("ISO_Tracker", "5.2", "Environmental policy as the ISO assessment rates it, 0–5", isoPolicy),
      ],
      rule: parity ? PARITY_ZERO : ratingRule(4, "The stricter of the board's declaration and the ISO clause 5.2 assessment"),
    });
    record({
      key: "d29",
      measured: parity ? null : { value: isoLegal, unit: "rating", label: "Legal compliance register (0–5)" },
      target: null,
      inputs: [
        traceCell("ISO_Tracker", "6.1.3", "Legal compliance register, rated 0–5", isoLegal),
        traceCell("G_Data", "F21", "Governance risk register maturity (must be live)", num(workbook, "F21", "g-data")),
      ],
      rule: parity
        ? PARITY_ZERO
        : `${ratingRule(4, "The legal compliance register (ISO clause 6.1.3)")} It counts only where the governance risk register is live.`,
    });
  }

  const rows = {
    d5, d6, d7, d8, d9, d11, d12, d13, d15, d16, d17,
    d19, d20, d21, d23, d24, d26, d27, d28, d29,
  };
  const score = Object.values(rows).reduce((a, b) => a + b, 0);

  /*
   * Exclusions leave the numerator and the denominator together. Parity mode
   * takes none: it reproduces the client's spreadsheet, which has no concept of
   * an indicator that does not apply.
   */
  const excluded =
    mode === "workbook-parity"
      ? []
      : mergeExclusions(readDeclaredExclusions(workbook, "environmental"), targetExclusions);
  const scored = Object.entries(rows)
    .filter(([key]) => !excluded.some((x) => x.key === key))
    .reduce((a, [, v]) => a + v, 0);
  /*
   * A pillar is scored out of what it can actually reach — 108 here, not 100.
   *
   * `ESG_D9_PILLAR_DIVISOR` is a flat 100 because that is literally what the
   * workbook's `ESG_Dashboard!D9` divides every pillar by, Environmental
   * included, even though the E scorecard adds up to 108. The workbook got
   * away with it: `d26`–`d29` were MANUAL_ZERO, so only 88 points were ever
   * reachable and the ratio stayed under 1.
   *
   * Wiring those four indicators removed the accident. Against a divisor of
   * 100 a company scoring the full 108 now reads 108%, and one scoring 90
   * reads 90% when it has earned 83% of what was available — the arithmetic
   * flatters every environmental result and breaks at the top.
   *
   * Parity keeps the flat 100, because reproducing that spreadsheet is what it
   * is for and `ESG_GOLDEN_SG_CONSUMER.overallPercent` is avg(36/100, 33/100,
   * 64.85/100).
   */
  const scoringDenominator =
    mode === "workbook-parity"
      ? ESG_D9_PILLAR_DIVISOR
      : applicableMaxFor(PILLAR_MAX_ENVIRONMENTAL, excluded);

  return {
    score: minCap(mode === "workbook-parity" ? score : scored, PILLAR_MAX_ENVIRONMENTAL),
    max: PILLAR_MAX_ENVIRONMENTAL,
    scoringDenominator,
    rows,
    excluded,
  };
}
