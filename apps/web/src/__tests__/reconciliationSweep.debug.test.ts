/**
 * CROSS-SECTOR reconciliation sweep — evidence that ONE layer heals ALL sectors.
 *
 * For every ground-truth workbook (all 16 sector/scorecard variants) it:
 *   1. reconciles the CLEAN workbook            → must not harm it (safety)
 *   2. injects the SAME universal corruption    → the defects the extractor
 *      into that sector's ownership + a date       actually produces, sector-blind
 *   3. reconciles the CORRUPTED workbook        → must heal it back (generality)
 *
 * The corruption is deliberately the real extraction failure modes, not sector-
 * specific: the company listed as its own shareholder, the sole holder duplicated
 * under a name variant with a zeroed economic interest, and an Excel date serial.
 * If reconciliation removes all three in EVERY sector, the fix is general.
 *
 *   RECON_SWEEP=1 npx vitest run src/__tests__/reconciliationSweep.debug.test.ts --pool=forks --testTimeout=120000
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { normalizeExcelBuffer } from "@/lib/workbookExcelNormalizer";
import { reconcileEntity } from "@/lib/reconciliation/reconcileEntity";
import type { WorkbookSections } from "@/lib/reconciliation/types";

const DIR = resolve(process.cwd(), "../../docs/Toolkit Testing Data");
const suite = process.env.RECON_SWEEP && existsSync(DIR) ? describe : describe.skip;

function clone(sections: WorkbookSections): WorkbookSections {
  const out: WorkbookSections = {};
  for (const [k, v] of Object.entries(sections)) {
    out[k] = { meta: v.meta ? { ...v.meta } : undefined, rows: (v.rows ?? []).map((r) => ({ ...r })) };
  }
  return out;
}

/** The universal, sector-blind corruption — the extractor's real failure modes. */
function corrupt(sections: WorkbookSections, companyName: string): { injected: number } {
  const own = sections.ownership?.rows ?? [];
  let injected = 0;
  // 1. The company as its own shareholder (well-formedness).
  own.push({ _id: "corrupt_self", shareholderName: companyName, numberOfShares: 999999, votingRights: 1 } as any);
  injected++;
  // 2. Duplicate the first real holder under a comma variant, economic interest
  //    zeroed (identity + derivation).
  const first = own.find((r) => r._id !== "corrupt_self" && String(r.shareholderName ?? "").trim());
  if (first) {
    const nm = String(first.shareholderName);
    const variant = nm.includes(" ") ? nm.replace(/\s+(\S+)$/, ", $1") : nm; // "A B" -> "A, B"
    own.push({ ...first, _id: "corrupt_dup", shareholderName: variant, economicInterest: 0, votingRights: 0 } as any);
    injected++;
  }
  sections.ownership = { ...(sections.ownership ?? {}), rows: own };
  // 3. An Excel date serial in a date cell (representation).
  const sed = sections.sed?.rows ?? [];
  if (sed[0]) { (sed[0] as any).dateOfTransaction = 46066; injected++; }
  return { injected };
}

suite("reconciliation heals every sector", () => {
  const files = existsSync(DIR)
    ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"))
    : [];

  it(`safety + healing across all ${files.length} sector workbooks`, () => {
    const rows: string[] = [];
    let safetyFails = 0;
    let healFails = 0;

    for (const f of files) {
      const buf = readFileSync(resolve(DIR, f));
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const imp = normalizeExcelBuffer(ab);
      const meta = (imp.sections["company-information"]?.meta ?? {}) as Record<string, unknown>;
      const sector = String(meta.industrySector ?? "?");
      const type = String(meta.scorecardType ?? "?");
      const companyName = String(meta.companyName ?? f.replace(/_/g, " ").replace(/\.xlsx$/i, ""));
      const opts = { sectorCode: sector, scorecardType: type };

      // 1. SAFETY — reconcile the clean workbook; it must not introduce blocking
      //    issues or lose shareholders.
      const cleanIn = clone(imp.sections as WorkbookSections);
      cleanIn["company-information"] = { meta: { ...meta, companyName } };
      const clean = reconcileEntity(cleanIn, opts);
      const cleanShareholders = clean.sections.ownership?.rows?.length ?? 0;
      const cleanSafe = clean.counts.blocking === 0;
      if (!cleanSafe) safetyFails++;

      // 2 + 3. HEALING — corrupt, then reconcile; the injected defects must be gone.
      const corruptIn = clone(imp.sections as WorkbookSections);
      corruptIn["company-information"] = { meta: { ...meta, companyName } };
      const { injected } = corrupt(corruptIn, companyName);
      const healed = reconcileEntity(corruptIn, opts);
      const healedRows = healed.sections.ownership?.rows ?? [];
      const selfGone = !healedRows.some((r) => r._id === "corrupt_self");
      const dupGone = !healedRows.some((r) => r._id === "corrupt_dup");
      const dateFixed = String(healed.sections.sed?.rows?.[0]?.dateOfTransaction ?? "").match(/^\d{4}-\d{2}-\d{2}$/) !== null
        || (imp.sections.sed?.rows?.length ?? 0) === 0;
      const shareholdersRestored = (healed.sections.ownership?.rows?.length ?? 0) === cleanShareholders;
      const healOk = selfGone && dupGone && dateFixed && shareholdersRestored;
      if (!healOk) healFails++;

      rows.push(
        `${f.slice(0, 30).padEnd(30)} | ${sector.padEnd(5)}/${type.slice(0, 4).padEnd(4)} | ` +
        `clean: ${cleanShareholders} sh, ${clean.counts.blocking} block ${cleanSafe ? "OK" : "FAIL"} | ` +
        `healed: self${selfGone ? "✓" : "✗"} dup${dupGone ? "✓" : "✗"} date${dateFixed ? "✓" : "✗"} count${shareholdersRestored ? "✓" : "✗"} ${healOk ? "OK" : "FAIL"} (injected ${injected})`,
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      "\n===== Reconciliation cross-sector sweep =====\n" + rows.join("\n") +
      `\n\nSAFETY (clean not harmed): ${files.length - safetyFails}/${files.length}` +
      `\nHEALING (corruption removed): ${files.length - healFails}/${files.length}\n`,
    );

    expect(safetyFails, "reconciliation harmed a clean workbook in some sector").toBe(0);
    expect(healFails, "reconciliation failed to heal the corruption in some sector").toBe(0);
  }, 120_000);
});
