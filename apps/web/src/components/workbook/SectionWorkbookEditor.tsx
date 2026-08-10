import { useCallback, useRef, useState } from "react";
import { BadgeCheck, Download, Loader2, Upload } from "lucide-react";
import type { SectionDef } from "./sections";
import { SpreadsheetGrid } from "./SpreadsheetGrid";
import type { PillarPermission } from "@/hooks/usePillarPermission";
import {
  diffSectionImport,
  exportSectionToXlsx,
  findHeaderRow,
  mergeSectionImport,
  readSectionMatrix,
  type SectionImportDiff,
} from "@/lib/workbookSectionImportExport";
import { normalizePaste } from "@/lib/aiMappingClient";
import { toGridRows, type NormalizationResult } from "@/lib/tabularNormalize";
import { API_BASE } from "@toolkit/lib/config";
import { SectionImportPreviewModal } from "./SectionImportPreviewModal";
import {
  autofillProcurementFromCertificates,
  rowsNeedingCertificateData,
  summariseAutofill,
  workbookDateToIso,
  type AutofillReport,
  type ProcurementRow,
} from "@/lib/certificateAutofill";

type Row = Record<string, unknown> & { _id: string };

interface Props {
  section: SectionDef;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  permissions: PillarPermission;
  /**
   * End of the measured financial period (ISO or dd/mm/yyyy), from
   * company-information meta.
   *
   * Decisive for certificate autofill, not cosmetic. A supplier is qualified by
   * the certificate that was live during the period being measured, and 90% of
   * the registry expires in the current year — so checking against TODAY rather
   * than the period end is the difference between filling most suppliers'
   * B-BBEE levels and filling almost none.
   */
  measurementPeriodEnd?: string | null;
}

export function SectionWorkbookEditor({
  section,
  rows,
  onChange,
  permissions,
  measurementPeriodEnd,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDiff, setImportDiff] = useState<SectionImportDiff | null>(null);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [importing, setImporting] = useState(false);
  const [normalization, setNormalization] = useState<NormalizationResult | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [autofilling, setAutofilling] = useState(false);
  const [autofillReport, setAutofillReport] = useState<AutofillReport | null>(null);

  const readOnly = !permissions.canEdit;
  const columns = section.columns ?? [];

  /**
   * Procurement is the one section whose missing values already exist somewhere
   * we can reach: each supplier's B-BBEE certificate, 2,951 of them in the
   * registry. Nothing else on the workbook has an authoritative external source,
   * so nothing else gets this control.
   */
  const supportsCertificateLookup = section.key === "procurement" || section.key === "suppliers";
  const rowsWithGaps = supportsCertificateLookup
    ? rowsNeedingCertificateData(rows as ProcurementRow[])
    : [];

  /**
   * Fill blank supplier details from the certificate registry.
   *
   * Blanks only — a figure the user typed or the import supplied is never
   * overwritten. Where the certificate disagrees, the user's value stays and the
   * disagreement is reported, because that gap is the interesting thing (a stale
   * certificate, or the wrong supplier matched) and resolving it is a judgement
   * call, not an automation.
   */
  const asOf = workbookDateToIso(measurementPeriodEnd);

  const runCertificateAutofill = useCallback(
    async (target: Row[]) => {
      if (!permissions.canEdit) return;
      setAutofilling(true);
      try {
        const { rows: enriched, report } = await autofillProcurementFromCertificates(
          target as ProcurementRow[],
          { asOf },
        );
        setAutofillReport(report);
        if (report.cellsFilled > 0) onChange(enriched as Row[]);
      } finally {
        setAutofilling(false);
      }
    },
    [permissions.canEdit, onChange, asOf],
  );

  const handleExport = useCallback(() => {
    if (!permissions.canExport || columns.length === 0) return;
    exportSectionToXlsx(section.label, columns, rows);
  }, [permissions.canExport, section.label, columns, rows]);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !permissions.canImport || columns.length === 0) return;
      setImportFile(file);
      setImportOpen(true);
      setImportDiff(null);
      setImportMode("append");
      setNormalization(null);
      setUsedAi(false);
      try {
        const matrix = await readSectionMatrix(file);
        // Skip leading title/blank rows (e.g. the merged section-title row our own
        // export writes) so the real header row lands at index 0 for normalizePaste.
        const headerIdx = findHeaderRow(matrix);
        const trimmed = headerIdx > 0 ? matrix.slice(headerIdx) : matrix;
        const { result, usedAi: ai } = await normalizePaste(trimmed, columns, API_BASE, {
          hasHeaderRow: true,
        });
        const parsed = toGridRows(result, columns);
        setNormalization(result);
        setUsedAi(ai);
        setImportDiff(diffSectionImport(rows, parsed, columns));
      } catch {
        setImportDiff({ added: [], updated: [], removed: [], unchanged: 0 });
      }
    },
    [permissions.canImport, columns, rows],
  );

  const confirmImport = useCallback(async () => {
    if (!importFile || !importDiff || !normalization || columns.length === 0) return;
    setImporting(true);
    try {
      const parsed = toGridRows(normalization, columns);
      const diff = diffSectionImport(rows, parsed, columns);
      const merged = mergeSectionImport(rows, parsed, importMode, diff);
      onChange(merged);
      setImportOpen(false);
      setImportFile(null);
      setImportDiff(null);
      setNormalization(null);

      // A procurement import is almost always names and rands with the scoring
      // columns blank — that is what the spreadsheet the client keeps looks
      // like. Filling those from the registry the moment they land is the point
      // of holding the certificates, so it happens without being asked for.
      if (supportsCertificateLookup) await runCertificateAutofill(merged);
    } finally {
      setImporting(false);
    }
  }, [
    importFile,
    importDiff,
    normalization,
    columns,
    rows,
    importMode,
    onChange,
    supportsCertificateLookup,
    runCertificateAutofill,
  ]);

  return (
    <>
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold tracking-tight text-white">{section.label}</h2>
            {section.description && (
              <p className="text-[13px] text-[#8e8e93] mt-0.5">{section.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {supportsCertificateLookup && permissions.canEdit && (
              <button
                type="button"
                onClick={() => void runCertificateAutofill(rows)}
                disabled={autofilling || rowsWithGaps.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2c2c2e] disabled:opacity-40 disabled:hover:bg-[#1c1c1e] text-[12px] text-[#d1d1d6] smooth press-sm"
                title={
                  rowsWithGaps.length === 0
                    ? "Every supplier already has its certificate details"
                    : `Look up ${rowsWithGaps.length} supplier${rowsWithGaps.length === 1 ? "" : "s"} in the certificate database`
                }
                data-testid="button-certificate-autofill"
              >
                {autofilling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BadgeCheck className="h-3.5 w-3.5" />
                )}
                Fill from certificates
                {rowsWithGaps.length > 0 && (
                  <span className="text-[#636366]">({rowsWithGaps.length})</span>
                )}
              </button>
            )}
            {permissions.canExport && (
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[12px] text-[#d1d1d6] smooth press-sm"
                data-testid="button-export-section"
              >
                <Download className="h-3.5 w-3.5" />
                Export section
              </button>
            )}
            {permissions.canImport && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  data-testid="input-section-import"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[12px] text-[#d1d1d6] smooth press-sm"
                  data-testid="button-import-section"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import section
                </button>
              </>
            )}
            {permissions.loading && (
              <Loader2 className="h-4 w-4 animate-spin text-[#636366]" />
            )}
          </div>
        </div>
      </div>

      {autofillReport && (
        <div
          className="px-6 py-3 border-b border-white/[0.06] text-[12px] space-y-1"
          data-testid="certificate-autofill-report"
        >
          <div className="flex items-start justify-between gap-4">
            <p className={autofillReport.cellsFilled > 0 ? "text-emerald-200/90" : "text-[#8e8e93]"}>
              {summariseAutofill(autofillReport) ||
                "No new supplier details found in the certificate database."}
            </p>
            <button
              type="button"
              onClick={() => setAutofillReport(null)}
              className="text-[11px] text-[#636366] hover:text-[#8e8e93] shrink-0"
              data-testid="button-dismiss-autofill-report"
            >
              Dismiss
            </button>
          </div>
          {/* Named, not just counted: a conflict is only actionable if the user
              can see which supplier and which figure to go and check. */}
          {autofillReport.conflicts.map((c) => (
            <p key={`conflict-${c.rowId}`} className="text-[11px] text-amber-200/80">
              {c.supplierName || "Unnamed supplier"}: certificate says{" "}
              {c.conflicts.map((x) => `${x.column} ${String(x.certificate)}`).join(", ")} — your entry
              was kept.
            </p>
          ))}
          {/* Validity is judged against the measured period, not today. When no
              period is set the check falls back to today — which for a registry
              where most certificates expire this year silently withholds far
              more than it should, so say so rather than let it look like the
              certificates are simply missing. */}
          {autofillReport.notValid.length > 0 && (
            <p className="text-[11px] text-[#8e8e93]">
              {asOf ? (
                <>Validity checked against the financial period end, {asOf}.</>
              ) : (
                <>
                  No financial period set, so validity was checked against today. Set
                  “Financial Period End” in Company Information and run this again — most
                  certificates on file expire within the current year.
                </>
              )}
            </p>
          )}
          {autofillReport.notValid.map((e) => (
            <p key={`notvalid-${e.rowId}`} className="text-[11px] text-amber-200/80">
              {e.supplierName || "Unnamed supplier"}:{" "}
              {e.reason === "expired"
                ? `certificate on file expired ${e.expiryDate} — B-BBEE level left blank, a renewal is needed.`
                : "certificate on file has no expiry date — B-BBEE level left blank until the record is corrected."}
            </p>
          ))}
          {autofillReport.ambiguous.map((a) => (
            <p key={`ambiguous-${a.rowId}`} className="text-[11px] text-[#8e8e93]">
              {a.supplierName || "Unnamed supplier"}: matches {a.candidates.join(" and ")} — too close
              to call, pick the right one manually.
            </p>
          ))}
        </div>
      )}

      <div className="px-6 pb-6 pt-5 space-y-4" data-testid={`section-editor-${section.key}`}>
        <SpreadsheetGrid
        columns={columns}
        rows={rows}
        onChange={onChange}
        rowValidate={section.rowValidate}
        sectionLabel={section.label}
        sectionDescription={section.description}
        gridTotals={section.gridTotals}
        readOnly={readOnly}
        canDeleteRows={permissions.canDelete}
        canAddRows={permissions.canEdit}
      />

      <SectionImportPreviewModal
        open={importOpen}
        sectionLabel={section.label}
        fileName={importFile?.name ?? ""}
        diff={importDiff}
        importMode={importMode}
        onImportModeChange={setImportMode}
        canReplace={permissions.canReplaceOnImport}
        importing={importing}
        columns={columns}
        normalization={normalization}
        usedAi={usedAi}
        onClose={() => {
          if (importing) return;
          setImportOpen(false);
          setImportFile(null);
          setImportDiff(null);
          setNormalization(null);
        }}
        onConfirm={confirmImport}
      />
      </div>
    </>
  );
}
