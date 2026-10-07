/**
 * The B-BBEE end-to-end gate: a real extracted pack, placed and scored exactly
 * as the create flow does, element by element against the certified result in
 * the pack's answer key.
 *
 *   BBBEE_EVAL_CASE=<run>/case.json BBBEE_EVAL_KEY=<pack>/.eval/answer-key.json \
 *     npx vitest run src/lib/bbbee/__eval__/bbbeePackEval.test.ts --pool=forks --testTimeout=60000
 *
 * Skipped unless pointed at a case: the pack, its case and its key are client
 * data and never live in the repository. The parser half
 * (okiru-ai-parser/scripts/pack-eval.ts --domain bbbee) produces the case;
 * okiru-ai-parser/scripts/bbbee-key-from-review.mjs produces the key.
 *
 * Mirrors DocumentUploadStart.handleCreate (merge the deterministic and AI
 * sections, stamp sector/size) → reconcileEntity → projectWorkbookToClient →
 * the sector calculators → best four of seven. Only Transport QSE is wired.
 *
 * - Writes e2e.json beside the case.
 * - First run (or UPDATE_BASELINE=1) records e2e-baseline.json beside the key.
 * - After that, FAILS if fewer elements land within tolerance of the certified
 *   points than the baseline (BBBEE_EVAL_TOLERANCE, default 1 point).
 *
 * A certificate scored under best-four-of-seven shows 0 for an element it did
 * not count; such an element agrees when it is not among our best four either.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapParserCaseToWorkbookSections, type ParserCaseLike } from "@/lib/parserWorkbookMap";
import { mergeWorkbookSections, parserExtractionsToWorkbook, toWorkbookSections } from "@/lib/parserToWorkbook";
import { reconcileEntity } from "@/lib/reconciliation/reconcileEntity";
import { projectWorkbookToClient, type WorkbookData } from "../../../../server/workbookRoutes";
import { TRANSPORT_QSE_CALCULATOR_CONFIG as CFG } from "@toolkit/lib/sectors/transport-qse";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { calculateEsdScore, calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import { calculateTransportQseManagement, calculateTransportQseEmploymentEquity } from "@toolkit/lib/calculators/transport";

interface AnswerKey {
  sector?: string;
  size?: string;
  yearEnd?: string;
  certified?: { score?: number; level?: number; elements?: Record<string, number> };
  documents?: Array<{ fields?: Array<{ label: string; value: unknown }> }>;
}

type PackCase = ParserCaseLike & {
  ai_entities?: {
    fields?: Record<string, { value?: unknown }>;
    extractions?: Array<{ documentId?: string; sourceFile?: string; element?: string; values?: Array<{ field: string; value: unknown }>; exceptions?: unknown[] }>;
  };
};

/** Our element names → the names the certificate (and the key) use. */
const CERTIFIED_NAME: Record<string, string> = {
  Ownership: "Ownership",
  "Management Control": "Management Control",
  "Employment Equity": "Employment Equity",
  "Skills Development": "Skills",
  "Preferential Procurement": "Procurement",
  "Enterprise Development": "ED",
  "Socio-Economic Development": "SED",
};

const CASE = process.env.BBBEE_EVAL_CASE;
const KEY = process.env.BBBEE_EVAL_KEY;
const TOLERANCE = Number(process.env.BBBEE_EVAL_TOLERANCE ?? 1);

describe.skipIf(!CASE || !KEY)("B-BBEE pack end-to-end gate", () => {
  it("lands at least as many elements on the certified points as the baseline", () => {
    const parserCase = JSON.parse(readFileSync(CASE!, "utf8")) as PackCase;
    const key = JSON.parse(readFileSync(KEY!, "utf8")) as AnswerKey;
    if (!/^transport$/i.test(key.sector ?? "") || !/^qse$/i.test(key.size ?? "")) {
      throw new Error(`Only Transport QSE is wired into this gate; the key says ${key.sector} ${key.size}`);
    }

    const mapped = mapParserCaseToWorkbookSections(parserCase);
    const extractions = (parserCase.ai_entities?.extractions ?? []).map((e) => ({
      documentId: String(e.documentId ?? ""),
      sourceFile: String(e.sourceFile ?? ""),
      element: e.element,
      values: e.values ?? [],
      exceptions: (e.exceptions ?? []).map((note) => String(note ?? "")),
    }));
    const injected = extractions.length ? parserExtractionsToWorkbook(extractions) : null;
    const sections = mergeWorkbookSections(
      mapped.sections ?? {},
      injected ? toWorkbookSections(injected) : {},
    ) as Record<string, { rows?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>;

    // The name the client types on the form: the measured entity as the key has it.
    const measured = (key.documents ?? [])
      .flatMap((d) => d.fields ?? [])
      .find((f) => /^measured entity$/i.test(f.label))?.value;
    const companyName = String(measured ?? "Measured entity");
    sections["company-information"] = {
      ...(sections["company-information"] ?? {}),
      meta: { ...(sections["company-information"]?.meta ?? {}), companyName, industrySector: "Transport", scorecardType: "QSE" },
    };

    // Entity aliases from the extraction (registered names), as handleCreate builds them.
    const aliases: string[] = [];
    const add = (v: unknown) => { const s = String(v ?? "").trim(); if (s && !/<\/?[a-z]/i.test(s)) aliases.push(s); };
    add(parserCase.ai_entities?.fields?.entity_name?.value);
    for (const e of parserCase.ai_entities?.extractions ?? []) {
      for (const v of e?.values ?? []) if (/entity_name|company_name/i.test(String(v?.field ?? ""))) add(v?.value);
    }
    const reconciled = reconcileEntity(sections as never, { sectorCode: "TRANSPORT", scorecardType: "QSE", entityAliases: [companyName, ...aliases] });

    const wb: WorkbookData = {
      companyId: "eval", ownerOrganizationId: null, ownerUserId: "eval",
      sections: reconciled.sections as never, updatedAt: new Date().toISOString(),
    };
    const p = projectWorkbookToClient(wb);
    const fin = (p.financials as Record<string, unknown> | undefined) ?? {};
    const finMeta = (sections["financial-information"]?.meta ?? {}) as Record<string, unknown>;
    const npat = Number(fin.npat ?? finMeta.npat ?? 0);
    const tmps = Number(fin.tmps ?? finMeta.tmps ?? 0);
    const leviable = Number(fin.payroll ?? finMeta.payroll ?? finMeta.leviable ?? 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const any = (v: unknown) => v as any;
    const mgmtData = any({ id: "", clientId: "", employees: p.employees });
    const elems = [
      { name: "Ownership", score: calculateOwnershipScore(any({ shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 }), CFG).total },
      { name: "Management Control", score: calculateTransportQseManagement(mgmtData, CFG).score },
      { name: "Employment Equity", score: calculateTransportQseEmploymentEquity(mgmtData, CFG, "Gauteng").score },
      { name: "Skills Development", score: calculateSkillsScore(any({ id: "", clientId: "", leviableAmount: leviable, trainingPrograms: any(p).trainingPrograms ?? [] }), CFG, "Gauteng", 2025).total },
      { name: "Preferential Procurement", score: calculateProcurementScore(any({ id: "", clientId: "", tmps, suppliers: p.suppliers }), CFG).total },
      { name: "Enterprise Development", score: calculateEsdScore(any({ id: "", clientId: "", contributions: p.esdContributions }), npat, CFG).edTotal },
      { name: "Socio-Economic Development", score: calculateSedScore(any({ id: "", clientId: "", contributions: p.sedContributions }), npat, CFG).total },
    ];
    const bestFour = new Set([...elems].sort((a, b) => b.score - a.score).slice(0, 4).map((e) => e.name));
    const total = [...elems].filter((e) => bestFour.has(e.name)).reduce((s, e) => s + e.score, 0);

    const certified = key.certified?.elements ?? {};
    const comparison = elems.map((e) => {
      const target = certified[CERTIFIED_NAME[e.name]];
      const ours = Math.round(e.score * 100) / 100;
      const within = target === undefined
        ? null
        : target === 0
          ? !bestFour.has(e.name)
          : Math.abs(ours - target) <= TOLERANCE;
      return { element: e.name, certified: target ?? null, ours, inOurBestFour: bestFour.has(e.name), within };
    });
    const within = comparison.filter((c) => c.within === true).length;
    const compared = comparison.filter((c) => c.within !== null).length;
    const report = {
      certified: { score: key.certified?.score ?? null, level: key.certified?.level ?? null },
      ours: { total: Math.round(total * 100) / 100, level: total >= 100 ? 1 : total >= 95 ? 2 : total >= 90 ? 3 : "below 3" },
      tolerance: TOLERANCE,
      within,
      compared,
      elements: comparison,
      ingested: {
        shareholders: p.shareholders.length,
        employees: p.employees.length,
        suppliers: p.suppliers.length,
        trainingPrograms: (any(p).trainingPrograms ?? []).length,
        esdContributions: p.esdContributions.length,
        sedContributions: p.sedContributions.length,
        npat, tmps, leviable,
      },
    };
    writeFileSync(join(dirname(CASE!), "e2e.json"), JSON.stringify(report, null, 2));

    // The run must be the recorded one: a replay that missed the cassette left
    // a document unread, and its score says nothing about the code.
    const summaryPath = join(dirname(CASE!), "summary.json");
    expect(existsSync(summaryPath), `no summary.json beside ${CASE}`).toBe(true);
    const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as { mode?: string; cassette?: { misses?: number } };
    expect(summary.mode === "replay" ? summary.cassette?.misses ?? 0 : 0, "replay missed the cassette").toBe(0);

    const baselinePath = join(dirname(KEY!), "e2e-baseline.json");
    if (!existsSync(baselinePath) || process.env.UPDATE_BASELINE === "1") {
      // Only a faithful replay that compared something may become the baseline.
      expect(compared).toBeGreaterThan(0);
      expect(summary.mode, "a baseline must come from a replay run").toBe("replay");
      writeFileSync(baselinePath, JSON.stringify({ within, compared, total: report.ours.total, at: new Date().toISOString() }, null, 2));
      return;
    }
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { within: number; total: number };
    expect(
      within,
      `elements within ${TOLERANCE} point(s) of the certificate: ${within}/${compared}; the baseline was ${baseline.within}`,
    ).toBeGreaterThanOrEqual(baseline.within);
  });
});
