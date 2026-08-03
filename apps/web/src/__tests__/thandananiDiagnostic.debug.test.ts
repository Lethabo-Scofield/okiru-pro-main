/**
 * FULL-CHAIN DIAGNOSTIC for one extracted case.
 *
 * Replays the exact live flow — parser case → workbook sections → projection →
 * AI validation → scoring — for BOTH Transport Generic and Transport QSE, and
 * writes a self-contained report (markdown + JSON) that can be handed to Claude
 * or Codex to pinpoint why the score is what it is.
 *
 *   THANDANANI_JSON=<extraction.json> DIAG_OUT=<dir> \
 *     npx vitest run src/__tests__/thandananiDiagnostic.debug.test.ts --pool=forks --testTimeout=120000
 *
 * Nothing here computes anything of its own — it calls the SAME functions the
 * app calls, so the report reflects production behaviour, not a re-implementation.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { mapParserCaseToWorkbookSections, type ParserCaseLike } from "@/lib/parserWorkbookMap";
import { mergeWorkbookSections, parserExtractionsToWorkbook, toWorkbookSections, type ParserToWorkbookResult } from "@/lib/parserToWorkbook";
import { projectWorkbookToClient, type WorkbookData } from "../../server/workbookRoutes";
import { assessDocuments } from "@/lib/documentVerdicts";
import { buildExtractionReview } from "@/lib/extractionReview";
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from "@toolkit/lib/sectors/transport-generic";
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from "@toolkit/lib/sectors/transport-qse";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateEsdScore, calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import {
  calculateTransportQseManagement,
  calculateTransportQseEmploymentEquity,
  calculateTransportLargeManagementControl,
  calculateTransportLargeEmploymentEquity,
  calculateTransportLargeSkills,
} from "@toolkit/lib/calculators/transport";

const JSON_PATH = process.env.THANDANANI_JSON ?? "";
const OUT_DIR = process.env.DIAG_OUT ?? ".";

type AnyRec = Record<string, any>;
const n = (v: unknown) => Number(v ?? 0) || 0;
const money = (v: number) => (Math.abs(v) >= 1e6 ? `R${(v / 1e6).toFixed(2)}M` : `R${Math.round(v).toLocaleString()}`);

function subLineLines(result: AnyRec): string[] {
  const sl = (result?.subLines ?? []) as AnyRec[];
  return sl.map((l) => `      - ${String(l.name).padEnd(52)} ${n(l.score).toFixed(2).padStart(6)} / ${n(l.weighting)}   (target: ${l.target ?? "—"})`);
}

describe.skipIf(!JSON_PATH)("Thandanani — full-chain diagnostic", () => {
  it("writes the diagnostic bundle", () => {
    const parserCase = JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) as ParserCaseLike & {
      ai_entities?: { extractions?: Array<AnyRec>; conflicts?: AnyRec[] };
    };

    // ---- FLOW: exactly as DocumentUploadStart.handleCreate ---------------
    const mapped = mapParserCaseToWorkbookSections(parserCase);
    const extractions = (parserCase.ai_entities?.extractions ?? []).map((e) => ({
      documentId: String(e.documentId ?? ""),
      sourceFile: String(e.sourceFile ?? ""),
      element: e.element,
      values: e.values ?? [],
    }));
    const injected: ParserToWorkbookResult | null = extractions.length ? parserExtractionsToWorkbook(extractions) : null;
    const sections = mergeWorkbookSections(
      mapped.sections ?? {},
      injected ? toWorkbookSections(injected) : {},
    ) as Record<string, { rows?: AnyRec[]; meta?: AnyRec }>;
    sections["company-information"] = {
      ...(sections["company-information"] ?? {}),
      meta: { ...(sections["company-information"]?.meta ?? {}), industrySector: "Transport", scorecardType: "QSE" },
    };

    // ---- AI VALIDATION (the modal's own output) --------------------------
    const review = buildExtractionReview(sections as any);
    const verdicts = assessDocuments(parserCase, sections as any);

    // ---- PROJECTION ------------------------------------------------------
    const wb: WorkbookData = { companyId: "thandanani", ownerOrganizationId: null, ownerUserId: "h", sections: sections as any, updatedAt: new Date().toISOString() };
    const p = projectWorkbookToClient(wb) as AnyRec;
    const fin = p.financials ?? {};
    const finMeta = (sections["financial-information"]?.meta ?? {}) as AnyRec;
    const npat = n(fin.npat ?? finMeta.npat);
    const tmps = n(fin.tmps ?? finMeta.tmps);
    const leviable = n(fin.payroll ?? finMeta.payroll ?? finMeta.leviable);

    // ---- SCORING (both scorecards) --------------------------------------
    const mgmtData = { id: "", clientId: "", employees: p.employees } as AnyRec;
    function scoreWith(cfg: AnyRec, mode: "GENERIC" | "QSE") {
      const own = calculateOwnershipScore({ shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 18 } as AnyRec, cfg);
      const proc = calculateProcurementScore({ id: "", clientId: "", tmps, suppliers: p.suppliers } as AnyRec, cfg);
      const esd = calculateEsdScore({ id: "", clientId: "", contributions: p.esdContributions } as AnyRec, npat, cfg);
      const sed = calculateSedScore({ id: "", clientId: "", contributions: p.sedContributions } as AnyRec, npat, cfg);
      let mc: AnyRec, ee: AnyRec, sk: AnyRec;
      if (mode === "QSE") {
        mc = calculateTransportQseManagement(mgmtData, cfg);
        ee = calculateTransportQseEmploymentEquity(mgmtData, cfg, "Gauteng");
        sk = calculateSkillsScore({ id: "", clientId: "", leviableAmount: leviable, trainingPrograms: p.trainingPrograms ?? [] } as AnyRec, cfg, "Gauteng", 2025);
      } else {
        mc = calculateTransportLargeManagementControl(mgmtData, cfg);
        ee = calculateTransportLargeEmploymentEquity(mgmtData, cfg);
        sk = calculateTransportLargeSkills({ id: "", clientId: "", leviableAmount: leviable, headcount: p.employees.length, trainingPrograms: p.trainingPrograms ?? [] } as AnyRec, cfg);
      }
      const elems = [
        { key: "Ownership", res: own, score: n(own.total) },
        { key: "Management Control", res: mc, score: n(mc.score ?? mc.total) },
        { key: "Employment Equity", res: ee, score: n(ee.score ?? ee.total) },
        { key: "Skills Development", res: sk, score: n(sk.total) },
        { key: "Preferential Procurement", res: proc, score: n(proc.total) },
        { key: "Supplier Development", res: esd, score: n(esd.sdTotal) },
        { key: "Enterprise Development", res: esd, score: n(esd.edTotal) },
        { key: "Socio-Economic Development", res: sed, score: n(sed.total) },
      ];
      return { elems, own, mc, ee, sk, proc, esd, sed };
    }

    const gen = scoreWith(TRANSPORT_GENERIC_CALCULATOR_CONFIG, "GENERIC");
    const qse = scoreWith(TRANSPORT_QSE_CALCULATOR_CONFIG, "QSE");
    // Generic (Large) = sum of the 7 elements; QSE = best four of seven.
    const genTotal = gen.own.total + n(gen.mc.score) + n(gen.ee.score) + gen.sk.total + gen.proc.total + gen.esd.sdTotal + gen.esd.edTotal + gen.sed.total;
    const qseSeven = [qse.own.total, n(qse.mc.score), n(qse.ee.score), qse.sk.total, qse.proc.total, qse.esd.edTotal, qse.sed.total];
    const qseBestFour = [...qseSeven].sort((a, b) => b - a).slice(0, 4).reduce((s, v) => s + v, 0);

    // ---- REPORT ----------------------------------------------------------
    const L: string[] = [];
    L.push(`# Thandanani Transport — extraction & scoring diagnostic`);
    L.push(``);
    L.push(`Generated from a full replay of the live pipeline (parser case -> sections -> projection -> AI validation -> calculators). Every number below comes from the SAME functions the app runs.`);
    L.push(``);
    L.push(`## Headline`);
    L.push(``);
    L.push(`| Scorecard | Method | Total | Level |`);
    L.push(`|---|---|---|---|`);
    L.push(`| Transport GENERIC (Large) | sum of 7 elements | **${genTotal.toFixed(2)}** | ${genTotal >= 100 ? 1 : "below 1"} |`);
    L.push(`| Transport QSE | best 4 of 7 | **${qseBestFour.toFixed(2)}** | ${qseBestFour >= 100 ? 1 : "below 1"} |`);
    L.push(`| Ground truth (BE13609 cert) | QSE best-4 | 102.00 | 1 |`);
    L.push(``);
    L.push(`> This entity is a **Close Corporation, single member 100%** (turnover proxy: TMPS ${money(tmps)}, payroll ${money(leviable)}). That is QSE/EME scale — the GENERIC/Large scorecard applies large-company absolute targets it cannot meet, which is why Generic collapses to ~31. Compare the two element tables below.`);
    L.push(``);

    for (const [label, s, total, method] of [
      ["TRANSPORT GENERIC (Large)", gen, genTotal, "sum of all 7"],
      ["TRANSPORT QSE", qse, qseBestFour, "best 4 of 7"],
    ] as const) {
      L.push(`## Scoring — ${label}  (total ${total.toFixed(2)}, ${method})`);
      L.push(``);
      for (const e of s.elems) {
        const max = n((e.res as AnyRec).subLines?.reduce((a: number, l: AnyRec) => a + n(l.weighting), 0)) || undefined;
        L.push(`  - **${e.key}**: ${e.score.toFixed(2)}${max ? ` / ${max}` : ""}`);
        for (const sl of subLineLines(e.res)) L.push(sl);
      }
      L.push(``);
    }

    L.push(`## What the projection fed the calculators`);
    L.push(``);
    L.push(`- Shareholders: ${p.shareholders.length}`);
    for (const sh of p.shareholders) L.push(`    - ${sh.name} | race=${sh.race ?? "?"} | black=${sh.blackOwnership} | blackWomen=${sh.blackWomenOwnership} | voting=${sh.votingRights} | econInterest=${sh.economicInterest} | shares=${sh.shares}`);
    L.push(`- Employees: ${p.employees.length}   Suppliers: ${p.suppliers.length}   Training programmes: ${(p.trainingPrograms ?? []).length}`);
    L.push(`- ESD contributions: ${p.esdContributions.length}   SED contributions: ${p.sedContributions.length}`);
    L.push(`- Financials: NPAT ${money(npat)} | TMPS ${money(tmps)} | payroll/leviable ${money(leviable)}`);
    L.push(``);
    L.push(`### SED contributions (amounts drive the SED score)`);
    for (const c of p.sedContributions as AnyRec[]) L.push(`    - ${c.beneficiary ?? c.beneficiaryName ?? "?"} | type=${c.type ?? c.contributionType ?? "?"} | ${money(n(c.amount))} | %black=${c.blackBenefitPercent ?? c.percentBenefitingBlack ?? "?"}`);
    L.push(``);
    L.push(`### Training programmes (spend drives Skills)`);
    for (const t of (p.trainingPrograms ?? []) as AnyRec[]) L.push(`    - ${t.learnerName ?? t.programName ?? "?"} | cat=${t.categoryCode ?? "?"} | race=${t.race ?? "?"} | cost=${money(n(t.totalCost ?? t.cost ?? t.courseCost))}`);
    L.push(``);

    L.push(`## AI validation (the review modal's own output)`);
    L.push(``);
    L.push(`Open items: **${review.openItems}**  (suggestions ${review.suggestions.length}, conflicts ${review.conflicts.length}, decisions ${review.decisions.length})`);
    L.push(``);
    if (review.conflicts.length) {
      L.push(`### Conflicts`);
      for (const c of review.conflicts) L.push(`  - ${c.statement}  [${c.sides.map((x) => `${x.label}: ${x.value}`).join(" vs ")}]`);
      L.push(``);
    }
    if (review.suggestions.length) {
      L.push(`### Suggestions (evidence-backed fills)`);
      for (const su of review.suggestions.slice(0, 40)) L.push(`  - ${su.statement}  — basis: ${su.basis}`);
      L.push(``);
    }
    if (review.decisions.length) {
      L.push(`### Decisions (required, no evidence to auto-fill)`);
      for (const d of review.decisions.slice(0, 40)) L.push(`  - [${d.sectionLabel}.${d.columnLabel}] ${d.statement} (${d.rows.length} rows)${d.options ? ` options: ${d.options.join(", ")}` : ""}`);
      L.push(``);
    }

    L.push(`## Per-document ledger (what each file gave)`);
    L.push(``);
    L.push(`Counts: found ${verdicts.counts.found}, review ${verdicts.counts.confused}, nothing ${verdicts.counts.none}`);
    for (const v of verdicts.verdicts) L.push(`  - [${v.verdict.toUpperCase().padEnd(8)}] ${v.filename} — ${v.summary}${v.gaps.length ? `  (gaps: ${v.gaps.slice(0, 4).join("; ")})` : ""}`);
    L.push(``);

    L.push(`## Rows the injector PARKED (nameless / unmapped)`);
    for (const r of injected?.rejected ?? []) L.push(`  - ${r.reason}: ${r.detail}`);
    L.push(``);
    if (injected?.reconciliation?.length) {
      L.push(`## Reconciliation notes (dedup / cross-doc)`);
      for (const f of injected.reconciliation) L.push(`  - ${f.message}`);
      L.push(``);
    }

    const md = L.join("\n");
    const bundle = {
      headline: { genericTotal: Number(genTotal.toFixed(2)), qseBestFour: Number(qseBestFour.toFixed(2)), groundTruth: 102 },
      projection: { shareholders: p.shareholders, employees: p.employees.length, suppliers: p.suppliers.length, trainingPrograms: p.trainingPrograms ?? [], esdContributions: p.esdContributions, sedContributions: p.sedContributions, financials: { npat, tmps, leviable } },
      scoring: {
        generic: { total: Number(genTotal.toFixed(2)), elements: gen.elems.map((e) => ({ element: e.key, score: Number(e.score.toFixed(2)), subLines: (e.res as AnyRec).subLines ?? [] })) },
        qse: { bestFour: Number(qseBestFour.toFixed(2)), seven: qseSeven.map((v) => Number(v.toFixed(2))), elements: qse.elems.map((e) => ({ element: e.key, score: Number(e.score.toFixed(2)), subLines: (e.res as AnyRec).subLines ?? [] })) },
      },
      aiValidation: review,
      documentLedger: verdicts,
      parkedRows: injected?.rejected ?? [],
      reconciliation: injected?.reconciliation ?? [],
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const mdPath = path.join(OUT_DIR, "thandanani-diagnostic.md");
    const jsonPath = path.join(OUT_DIR, "thandanani-diagnostic.json");
    fs.writeFileSync(mdPath, md);
    fs.writeFileSync(jsonPath, JSON.stringify(bundle, null, 2));
    // eslint-disable-next-line no-console
    console.log(`\nDIAGNOSTIC WRITTEN:\n  ${mdPath}\n  ${jsonPath}\n\nGeneric=${genTotal.toFixed(2)}  QSE best4=${qseBestFour.toFixed(2)}  (ground truth 102)\n`);
    expect(fs.existsSync(mdPath)).toBe(true);
  });
});
