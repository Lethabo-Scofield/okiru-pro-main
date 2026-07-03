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
import { readdirSync, readFileSync } from 'node:fs';
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
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-generic';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-qse';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/ict-generic';
import { ICT_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/ict-qse';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/agri-generic';
import { FSC_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/fsc-generic';
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
        const cfg = configFor(sector, type, subSector);
        if (!cfg) { rows.push(`${f.slice(0, 34).padEnd(34)} | ${sector}/${type} | (no bundled config — API sector)`); continue; }

        let total = 0;
        let brk = '';
        if (sector.toUpperCase() === 'TRANSPORT') {
          // Transport scores via the mirrored transport calculators (pipeline
          // calcTransport* semantics). QSE = Ownership + MC + EE compulsory +
          // BEST elective of Skills/PP/ED/SED (choose-one, Transport Codes).
          const own = calculateOwnershipScore({ shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 } as any, cfg).total;
          const mgmtData = { id: '', clientId: '', employees: p.employees } as any;
          const esd = calculateEsdScore({ id: '', clientId: '', contributions: p.esdContributions as any } as any, npat, cfg);
          const sed = calculateSedScore({ id: '', clientId: '', contributions: p.sedContributions as any } as any, npat, cfg).total;
          const proc = calculateProcurementScore({ id: '', clientId: '', tmps, suppliers: p.suppliers as any } as any, cfg).total;
          if (/qse/i.test(type)) {
            const mc = calculateTransportQseManagement(mgmtData, cfg).score;
            const ee = calculateTransportQseEmploymentEquity(mgmtData, cfg, 'Gauteng').score;
            const sk = calculateSkillsScore({ id: '', clientId: '', leviableAmount: leviable, trainingPrograms: (p as any).trainingPrograms ?? [] } as any, cfg, 'Gauteng', 2025).total;
            const elective = Math.max(sk, proc, esd.edTotal, sed);
            total = own + mc + ee + elective;
            brk = ` | own${own.toFixed(0)} mc${mc.toFixed(0)} ee${ee.toFixed(0)} elective${elective.toFixed(0)} (sk${sk.toFixed(0)}/pp${proc.toFixed(0)}/ed${esd.edTotal.toFixed(0)}/sed${sed.toFixed(0)})`;
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
          const esd = calculateEsdScore({ id: '', clientId: '', contributions: p.esdContributions as any } as any, npat, cfg);
          const sed = calculateSedScore({ id: '', clientId: '', contributions: p.sedContributions as any } as any, npat, cfg).total;
          // FSC Banks/LTI/STI carry an Access to Financial Services pillar (12 pts).
          // calculateAfsScore returns null when the config has no AFS (FSC Generic / non-FSC).
          const afsData = { id: '', clientId: '', ...((p.financials as any)?.afs ?? {}) };
          const afs = calculateAfsScore(afsData as any, cfg)?.total ?? 0;
          total = own + mgmt + skills + proc + esd.sdTotal + esd.edTotal + sed + afs;
          brk = ` | own${own.toFixed(0)} mc${mgmt.toFixed(0)} sk${skills.toFixed(0)} pp${proc.toFixed(0)} sd${esd.sdTotal.toFixed(0)} ed${esd.edTotal.toFixed(0)} sed${sed.toFixed(0)} afs${afs.toFixed(0)} | npat${(npat/1e6).toFixed(0)}M tmps${(tmps/1e6).toFixed(0)}M lev${(leviable/1e6).toFixed(0)}M emp${p.employees.length} sup${p.suppliers.length}`;
        }
        const lvl = levelFromConfig(total, cfg);
        scored++;
        if (lvl === 1) level1++;
        rows.push(`${f.slice(0, 30).padEnd(30)} | ${sector.padEnd(5)}/${type.slice(0,7).padEnd(7)} | tot ${total.toFixed(0).padStart(3)}/${cfg.totalMaxPoints} L${lvl === 99 ? 'NC' : lvl}${brk}`);
      } catch (e) {
        rows.push(`${f.slice(0, 34).padEnd(34)} | SCORE THREW: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log('\n===== Toolkit Testing Data — SCORE fitness =====\n' + rows.join('\n') + `\n\nLEVEL-1: ${level1}/${scored} scored (${files.length} total). GOAL: ${files.length}/${files.length}.\n`);
    expect(files.length).toBeGreaterThan(0);
  });
});
