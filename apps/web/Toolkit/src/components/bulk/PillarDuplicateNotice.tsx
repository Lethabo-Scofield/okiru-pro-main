/**
 * Duplicate notice for a pillar's own rows.
 *
 * The bulk importer already warns about repeats — it runs `findDuplicates`
 * with each pillar's identity function and shows an amber panel before the
 * import lands. Nothing did the same for the rows already in the pillar, and
 * the manual add paths do not check anything at all: `addShareholder`,
 * `addEmployee`, `addSupplier`, `addTrainingProgram`, `addEsdContribution`
 * and `addSedContribution` are unconditional appends that toast success. So
 * the same supplier typed twice inflated TMPS and its own spend, the same
 * shareholder twice doubled a holding, and the same employee twice skewed the
 * EAP demographics — silently, and only on the manual path, so bulk and manual
 * disagreed about the same data.
 *
 * This closes that divergence by checking the rows themselves rather than the
 * entry point, so a duplicate is flagged however it arrived: typed, imported,
 * or restored from a saved client.
 *
 * Like the workbook, it advises and does not block. A repeated supplier can be
 * two genuine invoice lines, and two equal payments to one beneficiary in a
 * year are ordinary — collapsing those automatically would quietly reduce a
 * real figure, which is the same class of mistake in the other direction.
 */
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { findDuplicates, describeDuplicates } from "@/lib/duplicateRows";
import { BULK_IMPORT_SPECS, type BulkImportSpecKey } from "@toolkit/components/bulk/bulkImportSpecs";

interface PillarDuplicateNoticeProps<T> {
  /** Which pillar's identity rule to apply — the same one the importer uses. */
  specKey: BulkImportSpecKey;
  /** The rows currently held for this pillar. */
  rows: T[];
  /** Extra classes for placement within a page. */
  className?: string;
}

export function PillarDuplicateNotice<T>({
  specKey,
  rows,
  className,
}: PillarDuplicateNoticeProps<T>) {
  const spec = BULK_IMPORT_SPECS[specKey] as unknown as {
    noun: string;
    identity: (row: T) => string;
    duplicateLabel?: (row: T) => string;
    duplicateAmountField?: string;
  };

  const report = useMemo(() => {
    if (!rows || rows.length < 2) return null;
    const found = findDuplicates(rows, {
      identityOf: spec.identity,
      labelOf: spec.duplicateLabel,
    });
    return found.groups.length > 0 ? found : null;
  }, [rows, spec]);

  if (!report) return null;

  return (
    <div
      className={`rounded-lg border border-amber-500/40 bg-amber-500/[0.05] p-3 ${className ?? ""}`}
      data-testid={`pillar-duplicate-warning-${specKey}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-amber-500">
            {describeDuplicates(report, spec.noun)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {spec.duplicateAmountField
              ? `Each repeat is counted again, so the ${spec.duplicateAmountField} total includes it more than once. Remove the extras if they are the same record — leave them if they are genuinely separate entries.`
              : "Each repeat is scored again. Remove the extras if they are the same record."}
          </p>
          <div className="mt-2 max-h-[120px] overflow-y-auto">
            <table className="w-full text-[11px]">
              <tbody>
                {report.groups.slice(0, 8).map((group) => (
                  <tr key={group.key} className="border-t border-amber-500/20">
                    <td className="max-w-[240px] truncate px-2 py-1">
                      {group.label || "unnamed"}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      rows {group.positions.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PillarDuplicateNotice;
