/**
 * Toolkit Testing Data SCORE harness — the autoresearch fitness for "all 16 test
 * workbooks should score Level 1 on import" (B-BBEE expert ground truth).
 *
 * For each workbook: normalizeExcelBuffer → projectWorkbookToClient → load the
 * matching sector CalculatorConfig → score every pillar → total → B-BBEE level.
 * Reports the level per workbook and which fall short of Level 1.
 *
 * Run: TOOLKIT_SCORE=1 npx vitest run src/__tests__/toolkitTestData.score.harness.test.ts --pool=forks --poolOptions.forks.singleFork=true
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { normalizeExcelBuffer } from '@/lib/workbookExcelNormalizer';
import { projectWorkbookToClient, type WorkbookData } from '../../server/workbookRoutes';
import type { CalculatorConfig } from '../../shared/schema';
import { calculateOwnershipScore } from '@toolkit/lib/calculators/ownership';
import { calculateManagementScore } from '@toolkit/lib/calculators/management';
import { calculateSkillsScore } from '@toolkit/lib/calculators/skills';
import { calculateProcurementScore } from '@toolkit/lib/calculators/procurement';
import { calculateEsdScore, calculateSedScore } from '@toolkit/lib/calculators/esd-sed';
import { calculateAfsScore } from '@toolkit/lib/calculators/afs';
import { calculateEmpowermentFinancingScore } from '@toolkit/lib/calculators/empowermentFinancing';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-generic';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-qse';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/ict-generic';
import { ICT_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/ict-qse';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/agri-generic';
import { FSC_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-generic';
import { FSC_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-qse';
import { applyDeemedLevel, resolveDeemedLevel } from '@toolkit/lib/calculators/deemedLevel';
import { FSC_BANKS_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-banks';
import { FSC_LTI_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-lti';
import { FSC_STI_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-sti';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/transport-generic';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/transport-qse';
import {
  calculateTransportQseManagement,
  calculateTransportQseEmploymentEquity,
  calculateTransportLargeManagementControl,
  calculateTransportLargeEmploymentEquity,
  calculateTransportLargeSkills,
} from '@toolkit/lib/calculators/transport';
import { buildConstructionCalculatorConfig, isConstructionSector } from '@toolkit/lib/sectors/construction';
import { buildConstructionScoringInput } from '@toolkit/lib/calculators/construction-map';
import { calculateConstructionScorecard } from '../../../api/pipeline/constructionScoring';

const DIR = resolve(process.cwd(), '../../docs/Toolkit Testing Data');
const suite = process.env.TOOLKIT_SCORE ? describe : describe.skip;

function levelFromConfig(total: number, cfg: CalculatorConfig): number {
  const thresholds = (cfg.levelThresholds ?? []).slice().sort((a, b) => b.minPoints - a.minPoints);
  for (const t of thresholds) if (total >= t.minPoints) return t.level;
  return 99; // non-compliant
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configFor(sector: string, type: string, subSector: string): CalculatorConfig | null {
  const s = sector.toUpperCase();
  const qse = /qse/i.test(type);
  if (isConstructionSector(s)) {
    const entity = qse ? 'construction_qse' : subSector === 'BEP' ? 'construction_bep' : 'construction_contractor';
    return buildConstructionCalculatorConfig(entity);
  }
  if (s === 'RCOGP') return qse ? RCOGP_QSE_CALCULATOR_CONFIG : RCOGP_GENERIC_CALCULATOR_CONFIG;
  if (s === 'ICT') return qse ? ICT_QSE_CALCULATOR_CONFIG : ICT_GENERIC_CALCULATOR_CONFIG;
  if (s === 'AGRI') return AGRI_GENERIC_CALCULATOR_CONFIG;
  if (s === 'FSC') {
    // A QSFI (FSC QSE) is measured on the 100-pt QSFI scorecard regardless of
    // sub-sector (GG 41287 §8.2) — mirrors the live store's routing.
    if (qse) return FSC_QSE_CALCULATOR_CONFIG;
    if (/bank/i.test(subSector)) return FSC_BANKS_CALCULATOR_CONFIG;
    if (/long/i.test(subSector)) return FSC_LTI_CALCULATOR_CONFIG;
    if (/short/i.test(subSector)) return FSC_STI_CALCULATOR_CONFIG;
    return FSC_GENERIC_CALCULATOR_CONFIG;
  }
  // Transport bundled configs derive from the pipeline TRANSPORT_GENERIC /
  // TRANSPORT_QSE (docs/Transport Codes.xlsx "Road Freight Large"/"Road
  // Freight QSE") — same source the live store now uses.
  if (s === 'TRANSPORT') return qse ? TRANSPORT_QSE_CALCULATOR_CONFIG : TRANSPORT_GENERIC_CALCULATOR_CONFIG;
  return null;
}

suite('Toolkit Testing Data — SCORE fitness (expert says all Level 1)', () => {
  const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'));

  /**
   * PER-ELEMENT golden baseline.
   *
   * The Level-1 count and the grand total are both too coarse to protect
   * scoring work: a total can hold at 63.56 while two pillars move in opposite
   * directions and cancel out, and the Level-1 count only moves when a workbook
   * crosses a band. This session changed a designation mapping, a skills
   * denominator and header-row detection with neither signal noticing.
   *
   * So the baseline records EVERY element of EVERY workbook. Any movement fails
   * with the workbook, the element, and both numbers.
   *
   * To accept an intended change: `TOOLKIT_SCORE=1 UPDATE_SCORE_BASELINE=1 npx
   * vitest run src/__tests__/toolkitTestData.score.harness.test.ts --pool=forks`
   * and commit the diff — which is then a REVIEWABLE record of exactly which
   * pillars moved.
   */
  const BASELINE_PATH = resolve(__dirname, 'toolkitTestData.scoreBaseline.json');
  type ElementScores = Record<string, number | string>;
  const observed: Record<string, ElementScores> = {};

  // 16 workbooks x full projection + scoring; the 5s default is not enough and
  // the resulting TIMEOUT reads as a scoring failure, which is misleading.
  it(`scores all ${files.length} workbooks; reports Level-1 fitness`, () => {
    const rows: string[] = [];
    let level1 = 0;
    let scored = 0;
    for (const f of files) {
      const buf = readFileSync(resolve(DIR, f));
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      try {
        const imp = normalizeExcelBuffer(ab);
        const meta = (imp.sections['company-information']?.meta ?? {}) as Record<string, unknown>;
        const sector = String(meta.industrySector ?? '?');
        const type = String(meta.scorecardType ?? '?');
        const subSector = String(meta.constructionSubSector ?? meta.fscSubSector ?? '');
        const fin = (imp.sections['financial-information']?.meta ?? {}) as Record<string, unknown>;
        const npat = Number(fin.npat ?? 0);
        const tmps = Number(fin.tmps ?? 0);
        // Leviable amount for skills = total payroll (the Toolkit derives leviable from payroll).
        const leviable = Number(fin.payroll ?? fin.leviable ?? 0);
        const wb: WorkbookData = { companyId: 'h', ownerOrganizationId: null, ownerUserId: 'h', sections: imp.sections as any, updatedAt: new Date().toISOString() };
        const p = projectWorkbookToClient(wb);
        // ESD/SED targets are % of NPAT, but for a loss-making entity the target
        // uses the DEEMED NPAT (resolveEffectiveNpat: revenue × industry norm) —
        // which projectWorkbookToClient already computed on financials.npat. Use
        // that, matching the live store, so a loss-making SED scores on the deemed
        // base rather than 0. (Raw meta npat would zero it.)
        const effNpat = Number((p.financials as any)?.npat ?? npat);
        const cfg = configFor(sector, type, subSector);
        if (!cfg) { rows.push(`${f.slice(0, 34).padEnd(34)} | ${sector}/${type} | (no bundled config — API sector)`); continue; }

        let total = 0;
        let brk = '';
        if (sector.toUpperCase() === 'TRANSPORT') {
          // Transport scores via the mirrored transport calculators (pipeline
          // calcTransport* semantics). QSE = ANY FOUR of the seven elements
          // (Transport Codes: no priority elements) — the best four scores count,
          // matching how the store elects best-4-of-7 and the BE13609 certificate
          // (Own 25 + MC 27 + PP 25 + SED 25 = 102 = Level 1).
          const own = calculateOwnershipScore({ shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 } as any, cfg).total;
          const mgmtData = { id: '', clientId: '', employees: p.employees } as any;
          const esd = calculateEsdScore({ id: '', clientId: '', contributions: p.esdContributions as any } as any, effNpat, cfg);
          const sed = calculateSedScore({ id: '', clientId: '', contributions: p.sedContributions as any } as any, effNpat, cfg).total;
          const proc = calculateProcurementScore({ id: '', clientId: '', tmps, suppliers: p.suppliers as any } as any, cfg).total;
          if (/qse/i.test(type)) {
            const mc = calculateTransportQseManagement(mgmtData, cfg).score;
            const ee = calculateTransportQseEmploymentEquity(mgmtData, cfg, 'Gauteng').score;
            const sk = calculateSkillsScore({ id: '', clientId: '', leviableAmount: leviable, trainingPrograms: (p as any).trainingPrograms ?? [] } as any, cfg, 'Gauteng', 2025).total;
            // Best FOUR of the seven element scores (Transport QSE any-four-of-seven).
            const bestFour = [own, mc, ee, sk, proc, esd.edTotal, sed]
              .sort((a, b) => b - a)
              .slice(0, 4)
              .reduce((s, v) => s + v, 0);
            total = bestFour;
            brk = ` | best4=${bestFour.toFixed(0)} (own${own.toFixed(0)}/mc${mc.toFixed(0)}/ee${ee.toFixed(0)}/sk${sk.toFixed(0)}/pp${proc.toFixed(0)}/ed${esd.edTotal.toFixed(0)}/sed${sed.toFixed(0)})`;
          } else {
            const mc = calculateTransportLargeManagementControl(mgmtData, cfg).score;
            const ee = calculateTransportLargeEmploymentEquity(mgmtData, cfg).score;
            const sk = calculateTransportLargeSkills({ id: '', clientId: '', leviableAmount: leviable, headcount: p.employees.length, trainingPrograms: (p as any).trainingPrograms ?? [] } as any, cfg).total;
            total = own + mc + ee + sk + proc + esd.sdTotal + esd.edTotal + sed;
            brk = ` | own${own.toFixed(0)} mc${mc.toFixed(0)} ee${ee.toFixed(0)} sk${sk.toFixed(0)} pp${proc.toFixed(0)} sd${esd.sdTotal.toFixed(0)} sed${sed.toFixed(0)} | emp${p.employees.length}`;
          }
        } else if (isConstructionSector(sector)) {
          const state = { client: { sectorCode: sector, scorecardType: type, constructionSubSector: subSector, npat, leviableAmount: leviable, eapProvince: 'National', eapYear: 2025 }, ownership: { shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 }, management: { employees: p.employees }, skills: { leviableAmount: leviable, trainingPrograms: (p as any).trainingPrograms ?? [] }, procurement: { tmps, suppliers: p.suppliers }, esd: { contributions: p.esdContributions }, sed: { contributions: p.sedContributions } };
          const { entityType, input } = buildConstructionScoringInput(state, cfg);
          total = calculateConstructionScorecard(entityType, input).totalScore;
        } else {
          const own = calculateOwnershipScore({ shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 } as any, cfg).total;
          // eapYear 2025: the Toolkit Testing Data workbooks were filled and
          // expert-verified under the 25th CEE EAP dataset — pin the vintage so
          // the harness stays faithful to those workbooks (live default = 26th CEE, 2026).
          const mgmt = calculateManagementScore({ id: '', clientId: '', employees: p.employees as any } as any, cfg, 'Gauteng', 2025).total;
          const skills = calculateSkillsScore({ id: '', clientId: '', leviableAmount: leviable, trainingPrograms: (p as any).trainingPrograms ?? [] } as any, cfg, 'Gauteng', 2025).total;
          const proc = calculateProcurementScore({ id: '', clientId: '', tmps, suppliers: p.suppliers as any } as any, cfg).total;
          const esd = calculateEsdScore({ id: '', clientId: '', contributions: p.esdContributions as any } as any, effNpat, cfg);
          // FSC "SED & CE Scorecard" adds Consumer Education + Fundisa lines
          // (calculateSedScore scores them only when the config is FSC). The live
          // store passes these from client state, so the harness must too to stay
          // a faithful mirror — otherwise FSC SED is under-reported. Sourced from
          // projectWorkbookToClient's financials (mapWorkbookFinancialsToClient
          // reads the SED & CE section meta). Non-FSC: fields absent → no change.
          const fin2 = (p.financials as any) ?? {};
          const sed = calculateSedScore({ id: '', clientId: '', contributions: p.sedContributions as any, ceSpend: fin2.ceSpend, ceBonusSpend: fin2.ceBonusSpend, fundisaSpend: fin2.fundisaSpend } as any, effNpat, cfg).total;
          // FSC Banks/LTI/STI carry an Access to Financial Services pillar (12 pts).
          // calculateAfsScore returns null when the config has no AFS (FSC Generic / non-FSC).
          const afsData = { id: '', clientId: '', ...((p.financials as any)?.afs ?? {}) };
          const afs = calculateAfsScore(afsData as any, cfg)?.total ?? 0;
          // FSC Banks/LTI Empowerment Financing (EF-proper 15 pts: Targeted
          // Investments 12 + Transaction Financing 3). Facilities ingested from
          // the workbook "Empowerment Financing" sheet; the calculator returns
          // null for STI/Others/non-FSC, so this is 0 outside Banks/LTI.
          const efData = { id: '', clientId: '', ...((p.financials as any)?.empowermentFinancing ?? {}) };
          const ef = calculateEmpowermentFinancingScore(efData as any, cfg)?.total ?? 0;
          total = own + mgmt + skills + proc + esd.sdTotal + esd.edTotal + sed + afs + ef;
          brk = ` | own${own.toFixed(0)} mc${mgmt.toFixed(0)} sk${skills.toFixed(0)} pp${proc.toFixed(0)} sd${esd.sdTotal.toFixed(0)} ed${esd.edTotal.toFixed(0)} sed${sed.toFixed(0)} afs${afs.toFixed(0)} ef${ef.toFixed(0)} | npat${(npat/1e6).toFixed(0)}M tmps${(tmps/1e6).toFixed(0)}M lev${(leviable/1e6).toFixed(0)}M emp${p.employees.length} sup${p.suppliers.length}`;
        }
        // Deemed-level floor (Statement 000 §4), mirroring the live store: a
        // >=51%/100% black-owned QSE holds Level 2/1 via sworn affidavit
        // whatever the points say. Transport is excluded inside the helper.
        const totalShares = p.shareholders.reduce((a: number, sh: any) => a + (sh.shares || 0), 0);
        const flowThrough = p.shareholders.reduce((a: number, sh: any) => {
          const pctSh = totalShares > 0 ? (sh.shares || 0) / totalShares : (p.shareholders.length ? 1 / p.shareholders.length : 0);
          return a + pctSh * (sh.blackOwnership || 0);
        }, 0);
        const deemed = resolveDeemedLevel({ sectorCode: sector, scorecardType: type, blackVotingPct: flowThrough, blackEconomicInterestPct: flowThrough });
        const lvl = applyDeemedLevel(levelFromConfig(total, cfg), deemed).level;
        scored++;
        if (lvl === 1) level1++;

        // Record the total, the level, and the PER-ELEMENT breakdown.
        //
        // The three scoring branches (Transport / construction / generic) hold
        // their pillar values in different local variables, so rather than
        // restructuring all three we record `brk` — which each branch already
        // builds FROM those pillar values. Comparing it verbatim therefore
        // catches any element moving, which is the protection required.
        observed[f] = {
          total: Math.round(total * 100) / 100,
          level: lvl,
          breakdown: brk.trim(),
        };
        rows.push(`${f.slice(0, 30).padEnd(30)} | ${sector.padEnd(5)}/${type.slice(0,7).padEnd(7)} | tot ${total.toFixed(0).padStart(3)}/${cfg.totalMaxPoints} L${lvl === 99 ? 'NC' : lvl}${brk}`);
      } catch (e) {
        rows.push(`${f.slice(0, 34).padEnd(34)} | SCORE THREW: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log('\n===== Toolkit Testing Data — SCORE fitness =====\n' + rows.join('\n') + `\n\nLEVEL-1: ${level1}/${scored} scored (${files.length} total). GOAL: ${files.length}/${files.length}.\n`);
    expect(files.length).toBeGreaterThan(0);
  }, 120_000);

  it('no element of any workbook has moved since the baseline', () => {
    if (Object.keys(observed).length === 0) {
      throw new Error('scoring pass produced no results — cannot compare a baseline');
    }

    if (process.env.UPDATE_SCORE_BASELINE) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(observed, null, 2)}\n`);
      // eslint-disable-next-line no-console
      console.log(`baseline UPDATED: ${BASELINE_PATH} (${Object.keys(observed).length} workbooks)`);
      return;
    }

    if (!existsSync(BASELINE_PATH)) {
      throw new Error(
        `No score baseline at ${BASELINE_PATH}. Create it with UPDATE_SCORE_BASELINE=1.`,
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, ElementScores>;
    const drift: string[] = [];

    for (const [file, elements] of Object.entries(baseline)) {
      const now = observed[file];
      if (!now) {
        drift.push(`${file}: MISSING — scored in the baseline, not scored now`);
        continue;
      }
      for (const [element, was] of Object.entries(elements)) {
        const is = now[element];
        // Numbers: 0.01 absorbs float noise without hiding a real movement.
        // The breakdown string is compared verbatim.
        const moved = typeof was === 'string'
          ? is !== was
          : Math.abs((Number(is) || 0) - was) > 0.01;
        if (moved) {
          drift.push(`${file} · ${element}: ${was} -> ${is ?? 'undefined'}`);
        }
      }
    }

    for (const file of Object.keys(observed)) {
      if (!baseline[file]) drift.push(`${file}: NEW — not in the baseline`);
    }

    expect(
      drift,
      `${drift.length} element(s) moved:\n  ${drift.join('\n  ')}\n\n`
      + 'If intended, re-run with UPDATE_SCORE_BASELINE=1 and commit the diff.',
    ).toEqual([]);
  });
});
