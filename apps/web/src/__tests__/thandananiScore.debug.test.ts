/**
 * Score a REAL extracted case as Transport QSE and compare to the 102 ground
 * truth (BE13609: best-four-of-seven = Own 25 + MC 27 + PP 25 + SED 25 = 102 = L1).
 *
 *   THANDANANI_JSON=<path> npx vitest run src/__tests__/thandananiScore.debug.test.ts --pool=forks --testTimeout=60000
 *
 * Mirrors DocumentUploadStart.handleCreate (merge legacy + AI-entity sections,
 * stamp Transport/QSE) → projectWorkbookToClient → the transport QSE calculators
 * → best-four-of-seven — the same chain the fitness harness and live store use.
 */
import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { mapParserCaseToWorkbookSections, type ParserCaseLike } from "@/lib/parserWorkbookMap";
import { mergeWorkbookSections, parserExtractionsToWorkbook, toWorkbookSections } from "@/lib/parserToWorkbook";
import { reconcileEntity } from "@/lib/reconciliation/reconcileEntity";
import { projectWorkbookToClient, type WorkbookData } from "../../server/workbookRoutes";
import { TRANSPORT_QSE_CALCULATOR_CONFIG as CFG } from "@toolkit/lib/sectors/transport-qse";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateEsdScore, calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import { calculateTransportQseManagement, calculateTransportQseEmploymentEquity } from "@toolkit/lib/calculators/transport";

const JSON_PATH = process.env.THANDANANI_JSON ?? "";

describe.skipIf(!JSON_PATH)("Thandanani Transport QSE — extracted score vs 102", () => {
  it("scores the extracted case and explains each element", () => {
    const parserCase = JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) as ParserCaseLike & {
      ai_entities?: { extractions?: Array<{ documentId?: string; sourceFile?: string; element?: string; values?: Array<{ field: string; value: unknown }> }> };
    };

    const mapped = mapParserCaseToWorkbookSections(parserCase);
    const extractions = (parserCase.ai_entities?.extractions ?? []).map((e) => ({
      documentId: String(e.documentId ?? ""),
      sourceFile: String(e.sourceFile ?? ""),
      element: e.element,
      values: e.values ?? [],
    }));
    const injected = extractions.length ? parserExtractionsToWorkbook(extractions) : null;
    const sections = mergeWorkbookSections(
      mapped.sections ?? {},
      injected ? toWorkbookSections(injected) : {},
    ) as Record<string, { rows?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>;
    sections["company-information"] = {
      ...(sections["company-information"] ?? {}),
      // Display name deliberately DIFFERENT from the registered entity name, as
      // in the live run ("Thandanani Transport" vs "…Packers and Hauliers cc").
      meta: { ...(sections["company-information"]?.meta ?? {}), companyName: "Thandanani Transport", industrySector: "Transport", scorecardType: "QSE" },
    };

    // Entity aliases from the extraction (registered names), as handleCreate builds.
    const ai = (parserCase as any).ai_entities;
    const aliases: string[] = [];
    const add = (v: unknown) => { const s = String(v ?? "").trim(); if (s && !/<\/?[a-z]/i.test(s)) aliases.push(s); };
    add(ai?.fields?.entity_name?.value);
    for (const e of ai?.extractions ?? []) for (const v of e?.values ?? []) if (/entity_name|company_name/i.test(String(v?.field ?? ""))) add(v?.value);

    // RECONCILE before scoring — the whole point.
    const reconciled = reconcileEntity(sections as any, { sectorCode: "TRANSPORT", scorecardType: "QSE", entityAliases: ["Thandanani Transport", ...aliases] });
    // eslint-disable-next-line no-console
    console.log("RECONCILE SUMMARY " + JSON.stringify({ summary: reconciled.summary, counts: reconciled.counts, blocking: reconciled.issues.filter((i) => i.severity === "blocking").map((i) => i.statement) }, null, 2));

    const wb: WorkbookData = {
      companyId: "thandanani", ownerOrganizationId: null, ownerUserId: "h",
      sections: reconciled.sections as any, updatedAt: new Date().toISOString(),
    };
    const p = projectWorkbookToClient(wb);
    const fin = (p.financials as any) ?? {};
    const finMeta = (sections["financial-information"]?.meta ?? {}) as Record<string, unknown>;
    const npat = Number(fin.npat ?? finMeta.npat ?? 0);
    const tmps = Number(fin.tmps ?? finMeta.tmps ?? 0);
    const leviable = Number(fin.payroll ?? finMeta.payroll ?? finMeta.leviable ?? 0);

    const mgmtData = { id: "", clientId: "", employees: p.employees } as any;
    const own = calculateOwnershipScore({ shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 } as any, CFG).total;
    const mc = calculateTransportQseManagement(mgmtData, CFG).score;
    const ee = calculateTransportQseEmploymentEquity(mgmtData, CFG, "Gauteng").score;
    const sk = calculateSkillsScore({ id: "", clientId: "", leviableAmount: leviable, trainingPrograms: (p as any).trainingPrograms ?? [] } as any, CFG, "Gauteng", 2025).total;
    const proc = calculateProcurementScore({ id: "", clientId: "", tmps, suppliers: p.suppliers as any } as any, CFG).total;
    const esd = calculateEsdScore({ id: "", clientId: "", contributions: p.esdContributions as any } as any, npat, CFG);
    const sed = calculateSedScore({ id: "", clientId: "", contributions: p.sedContributions as any } as any, npat, CFG).total;

    const elems = [
      { name: "Ownership", score: own, max: 25 },
      { name: "Management Control", score: mc, max: 27 },
      { name: "Employment Equity", score: ee, max: 25 },
      { name: "Skills Development", score: sk, max: 25 },
      { name: "Preferential Procurement", score: proc, max: 25 },
      { name: "Enterprise Development", score: esd.edTotal, max: 17 },
      { name: "Socio-Economic Development", score: sed, max: 25 },
    ];
    const bestFour = [...elems].sort((a, b) => b.score - a.score).slice(0, 4);
    const total = bestFour.reduce((s, e) => s + e.score, 0);

    const ingest = {
      shareholders: p.shareholders.length,
      employees: p.employees.length,
      suppliers: p.suppliers.length,
      trainingPrograms: ((p as any).trainingPrograms ?? []).length,
      esdContributions: p.esdContributions.length,
      sedContributions: p.sedContributions.length,
      npat, tmps, leviable,
    };

    const report = {
      GROUND_TRUTH: "102.00 = Level 1 (best-four-of-seven)",
      TOTAL: Math.round(total * 100) / 100,
      LEVEL: total >= 100 ? 1 : total >= 95 ? 2 : total >= 90 ? 3 : "below 3",
      GAP_TO_102: Math.round((102 - total) * 100) / 100,
      bestFourUsed: bestFour.map((e) => e.name),
      elements: elems.map((e) => `${e.name.padEnd(26)} ${e.score.toFixed(1).padStart(5)} / ${e.max}`),
      whatWasIngested: ingest,
      ownershipRows: p.shareholders.map((s: any) => `${s.name} | black ${s.blackOwnership} | vote ${s.votingRights} | ei ${s.economicInterest}`),
      sedRows: p.sedContributions.map((c: any) => `${c.beneficiary ?? c.beneficiaryName} | ${c.type ?? c.contributionType} | R${c.amount}`),
    };
    // eslint-disable-next-line no-console
    console.log("THANDANANI QSE SCORE\n" + JSON.stringify(report, null, 2));
    expect(total).toBeGreaterThan(0);
  });
});
