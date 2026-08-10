/** TEMP transport-chain audit debug — delete after audit. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { normalizeExcelBuffer } from '@/lib/workbookExcelNormalizer';
import { projectWorkbookToClient, type WorkbookData } from '../../server/workbookRoutes';
import { calculateOwnershipScore } from '@toolkit/lib/calculators/ownership';
import { calculateSkillsScore } from '@toolkit/lib/calculators/skills';
import { calculateProcurementScore } from '@toolkit/lib/calculators/procurement';
import { calculateEsdScore, calculateSedScore } from '@toolkit/lib/calculators/esd-sed';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/transport-generic';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '@toolkit/lib/sectors/transport-qse';
import {
  calculateTransportQseManagement,
  calculateTransportQseEmploymentEquity,
  calculateTransportLargeManagementControl,
  calculateTransportLargeEmploymentEquity,
  calculateTransportLargeSkills,
} from '@toolkit/lib/calculators/transport';
import { isBlackRace } from '@toolkit/lib/calculators/shared';

const DIR = resolve(process.cwd(), '../../docs/Toolkit Testing Data');

function load(f: string) {
  const buf = readFileSync(resolve(DIR, f));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const imp = normalizeExcelBuffer(ab);
  const wb: WorkbookData = { companyId: 'h', ownerOrganizationId: null, ownerUserId: 'h', sections: imp.sections as any, updatedAt: new Date().toISOString() };
  return { imp, p: projectWorkbookToClient(wb) };
}

describe('transport audit debug', () => {
  it('GENERIC breakdown', () => {
    const { imp, p } = load('Sandile_Freight_Logistics_Transport_BBBEE.xlsx');
    const cfg = TRANSPORT_GENERIC_CALCULATOR_CONFIG;
    const fin = (imp.sections['financial-information']?.meta ?? {}) as Record<string, unknown>;
    console.log('FIN META:', fin);
    console.log('RAW OWNERSHIP ROWS:', JSON.stringify(imp.sections['ownership']?.rows, null, 1));
    console.log('PROJECTED SHAREHOLDERS:', JSON.stringify(p.shareholders.map((s: any) => ({
      name: s.name, race: s.race, gender: s.gender, blackOwn: s.blackOwnership, bwOwn: s.blackWomenOwnership,
      shares: s.shares, shareValue: s.shareValue, isDG: s.isDesignatedGroup, bne: s.blackNewEntrant, yearsHeld: s.yearsHeld,
    })), null, 1));
    const own = calculateOwnershipScore({ shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 } as any, cfg);
    console.log('OWNERSHIP SUBLINES:', JSON.stringify((own as any).subLines ?? own, null, 1));
    const mgmtData = { id: '', clientId: '', employees: p.employees } as any;
    console.log('MC:', calculateTransportLargeManagementControl(mgmtData, cfg));
    console.log('EE:', calculateTransportLargeEmploymentEquity(mgmtData, cfg));
    // EE band stats
    const emps = p.employees as any[];
    const byDesig: Record<string, any[]> = {};
    for (const e of emps) (byDesig[e.designation] ??= []).push(e);
    for (const [d, arr] of Object.entries(byDesig)) {
      const b = arr.filter((e) => isBlackRace(e.race)).length;
      const bw = arr.filter((e) => isBlackRace(e.race) && e.gender === 'Female').length;
      const dis = arr.filter((e) => e.isDisabled).length;
      console.log(`DESIG ${d}: n=${arr.length} black=${b} bw=${bw} disabled=${dis}`);
    }
    const disabledBlack = emps.filter((e) => e.isDisabled && isBlackRace(e.race)).length;
    const disabledBW = emps.filter((e) => e.isDisabled && isBlackRace(e.race) && e.gender === 'Female').length;
    console.log('TOTAL emp', emps.length, 'disabledBlack', disabledBlack, 'disabledBW', disabledBW);
    const leviable = Number(fin.payroll ?? 0);
    const sk = calculateTransportLargeSkills({ id: '', clientId: '', leviableAmount: leviable, headcount: emps.length, trainingPrograms: (p as any).trainingPrograms ?? [] } as any, cfg);
    console.log('SKILLS SUBLINES:', JSON.stringify(sk.subLines, null, 1), 'rawStats:', JSON.stringify(sk.rawStats));
    // black women spend for codes-faithful line 2
    const tps = (p as any).trainingPrograms ?? [];
    const bwSpend = tps.filter((t: any) => t.isBlack && t.gender === 'Female').reduce((a: number, t: any) => a + (t.totalCost ?? 0), 0);
    const disabledSpendAll = tps.filter((t: any) => t.isBlack && t.isDisabled).reduce((a: number, t: any) => a + (t.totalCost ?? 0), 0);
    const disabledBWSpend = tps.filter((t: any) => t.isBlack && t.isDisabled && t.gender === 'Female').reduce((a: number, t: any) => a + (t.totalCost ?? 0), 0);
    console.log('leviable', leviable, 'BW spend', bwSpend, `(${(bwSpend / leviable * 100).toFixed(2)}%)`, 'disabled spend', disabledSpendAll, `(${(disabledSpendAll / leviable * 100).toFixed(3)}%)`, 'disabled BW spend', disabledBWSpend);
    const npat = Number(fin.npat ?? 0);
    console.log('ESD CONTRIBS:', JSON.stringify((p as any).esdContributions.map((c: any) => ({ b: c.beneficiary, type: c.type, cat: c.category, amt: c.amount, prime: c.primeRate, act: c.actualRate })), null, 1));
    const esd = calculateEsdScore({ id: '', clientId: '', contributions: (p as any).esdContributions } as any, npat, cfg);
    console.log('ESD RESULT:', JSON.stringify(esd, null, 1));
    const sed = calculateSedScore({ id: '', clientId: '', contributions: (p as any).sedContributions } as any, npat, cfg);
    console.log('SED RESULT:', JSON.stringify(sed, null, 1));
    const proc = calculateProcurementScore({ id: '', clientId: '', tmps: Number(fin.tmps ?? 0), suppliers: (p as any).suppliers } as any, cfg);
    console.log('PROC total', proc.total);
    expect(true).toBe(true);
  });

  it('QSE breakdown', () => {
    const { imp, p } = load('QSE_Sandile_Freight_Transport_BBBEE.xlsx');
    const cfg = TRANSPORT_QSE_CALCULATOR_CONFIG;
    const fin = (imp.sections['financial-information']?.meta ?? {}) as Record<string, unknown>;
    console.log('PROJECTED SHAREHOLDERS:', JSON.stringify(p.shareholders.map((s: any) => ({
      name: s.name, race: s.race, gender: s.gender, blackOwn: s.blackOwnership, bwOwn: s.blackWomenOwnership,
      shares: s.shares, isDG: s.isDesignatedGroup, bne: s.blackNewEntrant,
    })), null, 1));
    const own = calculateOwnershipScore({ shareholders: p.shareholders, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 } as any, cfg);
    console.log('OWNERSHIP SUBLINES:', JSON.stringify((own as any).subLines ?? own, null, 1));
    const mgmtData = { id: '', clientId: '', employees: p.employees } as any;
    console.log('MC:', calculateTransportQseManagement(mgmtData, cfg));
    for (const prov of ['Gauteng', 'National']) {
      console.log(`EE (${prov}):`, calculateTransportQseEmploymentEquity(mgmtData, cfg, prov));
    }
    const emps = p.employees as any[];
    const byDesig: Record<string, any[]> = {};
    for (const e of emps) (byDesig[e.designation] ??= []).push(e);
    for (const [d, arr] of Object.entries(byDesig)) {
      const b = arr.filter((e) => isBlackRace(e.race)).length;
      const bw = arr.filter((e) => isBlackRace(e.race) && e.gender === 'Female').length;
      console.log(`DESIG ${d}: n=${arr.length} black=${b} (${(b / arr.length * 100).toFixed(1)}%) bw=${bw} (${(bw / arr.length * 100).toFixed(1)}%)`);
    }
    const leviable = Number(fin.payroll ?? 0);
    const skRes = calculateSkillsScore({ id: '', clientId: '', leviableAmount: leviable, trainingPrograms: (p as any).trainingPrograms ?? [] } as any, cfg, 'Gauteng', 2025);
    console.log('SKILLS elective total', skRes.total);
    expect(true).toBe(true);
  });
});
