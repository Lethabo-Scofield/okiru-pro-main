/**
 * Toolkit Testing Data harness — runs every workbook in docs/Toolkit Testing Data
 * through the REAL bulk-upload pipeline (normalizeExcelBuffer → projectWorkbookToClient)
 * and reports import health per entity/sector. This is the headless equivalent of
 * uploading each file via the create-scorecard UI.
 *
 * Opt-in (keeps the normal suite quiet): run with
 *   TOOLKIT_HARNESS=1 npx vitest run src/__tests__/toolkitTestData.harness.test.ts --pool=forks --poolOptions.forks.singleFork=true
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { normalizeExcelBuffer } from '@/lib/workbookExcelNormalizer';
import { projectWorkbookToClient, type WorkbookData } from '../../server/workbookRoutes';

const DIR = resolve(process.cwd(), '../../docs/Toolkit Testing Data');
const suite = process.env.TOOLKIT_HARNESS ? describe : describe.skip;

suite('Toolkit Testing Data — bulk-upload import harness', () => {
  const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'));

  it(`imports all ${files.length} test workbooks`, () => {
    const rows: string[] = [];
    const failures: string[] = [];
    for (const f of files) {
      const buf = readFileSync(resolve(DIR, f));
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      let line: string;
      try {
        const imp = normalizeExcelBuffer(ab);
        const meta = (imp.sections['company-information']?.meta ?? {}) as Record<string, unknown>;
        const sector = String(meta.industrySector ?? '?');
        const type = String(meta.scorecardType ?? meta.constructionSubSector ?? '?');
        const wb: WorkbookData = {
          companyId: 'harness', ownerOrganizationId: null, ownerUserId: 'h',
          sections: imp.sections as any, updatedAt: new Date().toISOString(),
        };
        const p = projectWorkbookToClient(wb);
        const mapped = Object.keys(imp.mappedSheets ?? {}).length;
        line = `${f.replace('_BBBEE.xlsx', '').slice(0, 38).padEnd(38)} | ${sector.padEnd(12)} | ${type.padEnd(11)} | sheets ${mapped} | sh ${p.shareholders.length} emp ${p.employees.length} sup ${p.suppliers.length} esd ${p.esdContributions.length} sed ${p.sedContributions.length} | warn ${imp.warnings.length} | crit ${imp.criticalBlocked}`;
        if (imp.criticalBlocked) failures.push(`${f}: criticalBlocked — ${imp.validationIssues.slice(0, 2).map((i: any) => i.message).join('; ')}`);
        if (p.employees.length === 0 && p.suppliers.length === 0) failures.push(`${f}: no employees AND no suppliers ingested`);
      } catch (e) {
        line = `${f.padEnd(38)} | IMPORT THREW: ${(e as Error).message.slice(0, 60)}`;
        failures.push(`${f}: threw ${(e as Error).message.slice(0, 80)}`);
      }
      rows.push(line);
    }
    // eslint-disable-next-line no-console
    console.log('\n===== Toolkit Testing Data — bulk-upload import results =====\n' + rows.join('\n') + '\n');
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.log('FAILURES (' + failures.length + '):\n  ' + failures.join('\n  ') + '\n');
    }
    expect(files.length).toBeGreaterThan(0);
    // Hard gate: no workbook should be critically blocked from importing.
    expect(failures.filter((x) => x.includes('criticalBlocked') || x.includes('threw'))).toEqual([]);
  });
});
