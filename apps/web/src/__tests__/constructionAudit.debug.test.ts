/* Temporary debug harness — dump per-indicator construction scoring for Khethiwe workbooks. */
import { describe as suite, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { normalizeExcelBuffer } from '@/lib/workbookExcelNormalizer';
import { projectWorkbookToClient, type WorkbookData } from '../../server/workbookRoutes';
import { buildConstructionCalculatorConfig } from '@toolkit/lib/sectors/construction';
import { buildConstructionScoringInput } from '@toolkit/lib/calculators/construction-map';
import { calculateConstructionScorecard } from '../../../api/pipeline/constructionScoring';

const DIR = resolve(__dirname, '../../../../docs/Toolkit Testing Data');

suite('construction debug', () => {
  it('dumps per-indicator results', () => {
    for (const f of ['Khethiwe_Construction_Contractor_BBBEE.xlsx', 'QSE_Khethiwe_Construction_BBBEE.xlsx']) {
      const buf = readFileSync(resolve(DIR, f));
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const imp = normalizeExcelBuffer(ab);
      const meta = (imp.sections['company-information']?.meta ?? {}) as Record<string, unknown>;
      const sector = String(meta.industrySector ?? '?');
      const type = String(meta.scorecardType ?? '?');
      const subSector = String(meta.constructionSubSector ?? '');
      const fin = (imp.sections['financial-information']?.meta ?? {}) as Record<string, unknown>;
      const npat = Number(fin.npat ?? 0);
      const tmps = Number(fin.tmps ?? 0);
      const leviable = Number(fin.payroll ?? fin.leviable ?? 0);
      const wb: WorkbookData = { companyId: 'h', ownerOrganizationId: null, ownerUserId: 'h', sections: imp.sections as any, updatedAt: new Date().toISOString() };
      const p = projectWorkbookToClient(wb);
      const entity = /qse/i.test(type) ? 'construction_qse' : subSector === 'BEP' ? 'construction_bep' : 'construction_contractor';
      const cfg = buildConstructionCalculatorConfig(entity);
      const state = { client: { sectorCode: sector, scorecardType: type, constructionSubSector: subSector, npat, leviableAmount: leviable, eapProvince: 'National', eapYear: 2025 }, ownership: { shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 }, management: { employees: p.employees }, skills: { leviableAmount: leviable, trainingPrograms: (p as any).trainingPrograms ?? [] }, procurement: { tmps, suppliers: p.suppliers }, esd: { contributions: p.esdContributions }, sed: { contributions: p.sedContributions } };
      const { entityType, input } = buildConstructionScoringInput(state, cfg);
      const out = calculateConstructionScorecard(entityType, input);
      console.log(`\n===== ${f} -> ${entityType} total ${out.totalScore}/${out.totalAvailable}`);
      console.log('financials:', JSON.stringify(input.financials), 'fin.meta:', JSON.stringify(fin));
      console.log('meta keys:', JSON.stringify(meta));
      console.log('indicators supplied:', JSON.stringify(input.indicators, null, 0));
      for (const r of out.indicators) {
        console.log(`${r.status.padEnd(12)} ${String(r.achievedPoints).padStart(6)}/${String(r.availablePoints).padEnd(5)} ${r.code.padEnd(52)} actual=${r.actual} target=${r.target} missing=${r.missingFields.join(',')}`);
      }
      // sample projected rows
      console.log('sample employee:', JSON.stringify((p.employees as any[])[0]));
      console.log('sample trainingProgram:', JSON.stringify(((p as any).trainingPrograms ?? [])[0]));
      console.log('sample supplier:', JSON.stringify((p.suppliers as any[])[0]));
      console.log('sample esd:', JSON.stringify((p.esdContributions as any[])[0]));
      console.log('sample sed:', JSON.stringify((p.sedContributions as any[])[0]));
      console.log('sample shareholder:', JSON.stringify((p.shareholders as any[])[0]));
      console.log('RAW ownership rows:', JSON.stringify((imp.sections['ownership']?.rows ?? []).slice(0, 3)));
      console.log('RAW employee row:', JSON.stringify((imp.sections['management-control']?.rows ?? (imp.sections as any)['employees']?.rows ?? []).slice(0, 1)));
      console.log('RAW skills row:', JSON.stringify((imp.sections['skills-development']?.rows ?? []).slice(0, 1)));
      console.log('RAW esd row:', JSON.stringify((imp.sections['enterprise-supplier-development']?.rows ?? (imp.sections as any)['esd']?.rows ?? []).slice(0, 1)));
      console.log('section keys:', Object.keys(imp.sections).join(','));
    }
  });
});
