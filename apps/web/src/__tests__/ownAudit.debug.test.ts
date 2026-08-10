/** TEMP audit probe — delete after run. */
import { describe, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeExcelBuffer } from '@/lib/workbookExcelNormalizer';
import { projectWorkbookToClient } from '../../server/workbookRoutes';
import { calculateOwnershipScore } from '@toolkit/lib/calculators/ownership';
import { buildConstructionScoringInput, isConstructionSector } from '@toolkit/lib/calculators/construction-map';
import { calculateConstructionScorecard } from '../../../api/pipeline/constructionScoring';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/rcogp-generic';
import { buildConstructionCalculatorConfig } from '@toolkit/lib/sectors/construction';

const DIR = path.resolve(__dirname, '../../../../docs/Toolkit Testing Data');

function load(f: string) {
  const buf = fs.readFileSync(path.join(DIR, f));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const imp = normalizeExcelBuffer(ab as ArrayBuffer);
  return { imp, p: projectWorkbookToClient({ sections: imp.sections } as any) };
}

// Faithful flags per the workbook sheet: DG=Yes on all black rows, NE=Yes on Nomvula.
function fixFlags(shs: any[]) {
  return shs.map((sh) => ({
    ...sh,
    isDesignatedGroup: sh.blackOwnership > 0, // workbook DG? = Yes for all black holders
    blackNewEntrant: /nomvula/i.test(sh.name), // workbook NE? = Yes only for Nomvula
  }));
}

describe('ownership scoring delta probe', () => {
  it('generic RCOGP delta', () => {
    const { p } = load('Kgodiso_Industrial_Holdings_Generic_BBBEE.xlsx');
    const base = { companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 };
    const cur = calculateOwnershipScore({ shareholders: p.shareholders, ...base } as any, RCOGP_GENERIC_CALCULATOR_CONFIG);
    const fix = calculateOwnershipScore({ shareholders: fixFlags(p.shareholders), ...base } as any, RCOGP_GENERIC_CALCULATOR_CONFIG);
    console.log('GENERIC current:', cur.total, JSON.stringify({ ne: cur.newEntrants, dg: cur.designatedGroups, raw: cur.rawStats }));
    console.log('GENERIC fixed  :', fix.total, JSON.stringify({ ne: fix.newEntrants, dg: fix.designatedGroups, raw: fix.rawStats }));
  });

  it('construction deltas', () => {
    for (const [f, type, sub] of [
      ['Khethiwe_Construction_Contractor_BBBEE.xlsx', 'Generic', 'Contractor'],
      ['QSE_Khethiwe_Construction_BBBEE.xlsx', 'QSE', 'Contractor'],
    ] as const) {
      const { imp, p } = load(f);
      const meta = (imp.sections['company-information']?.meta ?? {}) as any;
      const fin = (imp.sections['financial-information']?.meta ?? {}) as any;
      const cfg = buildConstructionCalculatorConfig({ scorecardType: type, constructionSubSector: sub } as any);
      const mk = (shs: any[]) => {
        const state = {
          client: { sectorCode: 'CONSTRUCTION', scorecardType: type, constructionSubSector: sub, npat: Number(fin.npat ?? 0), leviableAmount: Number(fin.payroll ?? 0), eapProvince: 'National', eapYear: 2025 },
          ownership: { shareholders: shs, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 },
          management: { employees: p.employees },
          skills: { leviableAmount: Number(fin.payroll ?? 0), trainingPrograms: (p as any).trainingPrograms ?? [] },
          procurement: { tmps: Number(fin.tmps ?? 0), suppliers: p.suppliers },
          esd: { contributions: p.esdContributions },
          sed: { contributions: p.sedContributions },
        };
        const { entityType, input } = buildConstructionScoringInput(state as any, cfg);
        const r = calculateConstructionScorecard(entityType, input);
        return r;
      };
      const cur = mk(p.shareholders);
      const fix = mk(fixFlags(p.shareholders));
      console.log(`${f}: current total ${cur.totalScore} -> fixed ${fix.totalScore}`);
      const interesting = (r: any) => (r.pillars ?? r.pillarResults ?? []).flatMap((pl: any) => (pl.indicators ?? []).filter((i: any) => /entrant|designated/i.test(i.name)).map((i: any) => `${i.name}: ${i.score}/${i.weight}`));
      console.log('  cur:', interesting(cur));
      console.log('  fix:', interesting(fix));
    }
  });
});
