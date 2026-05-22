import { useCallback, useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import type { SectionDef } from "./sections";
import { SpreadsheetGrid } from "./SpreadsheetGrid";
import type { PillarPermission } from "@/hooks/usePillarPermission";
import {
  diffSectionImport,
  exportSectionToXlsx,
  mergeSectionImport,
  parseSectionFile,
  type SectionImportDiff,
} from "@/lib/workbookSectionImportExport";
import { SectionImportPreviewModal } from "./SectionImportPreviewModal";

type Row = Record<string, unknown> & { _id: string };

interface Props {
  section: SectionDef;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  permissions: PillarPermission;
}

export function SectionWorkbookEditor({
  section,
  rows,
  onChange,
  permissions,
}: Props) {
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDiff, setImportDiff] = useState<SectionImportDiff | null>(null);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const readOnly = !permissions.canEdit;
  const columns = section.columns ?? [];

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
      try {
        const parsed = await parseSectionFile(file, columns);
        setImportDiff(diffSectionImport(rows, parsed, columns));
      } catch {
        setImportDiff({ added: [], updated: [], removed: [], unchanged: 0 });
      }
    },
    [permissions.canImport, columns, rows],
  );

  const confirmImport = useCallback(async () => {
    if (!importFile || !importDiff || columns.length === 0) return;
    setImporting(true);
    try {
      const parsed = await parseSectionFile(importFile, columns);
      const diff = diffSectionImport(rows, parsed, columns);
      const merged = mergeSectionImport(rows, parsed, importMode, diff);
      onChange(merged);
      setImportOpen(false);
      setImportFile(null);
      setImportDiff(null);
    } finally {
      setImporting(false);
    }
  }, [importFile, importDiff, columns, rows, importMode, onChange]);

  return (
    <div className="space-y-4" data-testid={`section-editor-${section.key}`}>
      <div className="flex flex-wrap items-center justify-end gap-2">
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

      <SpreadsheetGrid
        columns={columns}
        rows={rows}
        onChange={onChange}
        rowValidate={section.rowValidate}
        sectionLabel={section.label}
        sectionDescription={section.description}
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
        onClose={() => {
          if (importing) return;
          setImportOpen(false);
          setImportFile(null);
          setImportDiff(null);
        }}
        onConfirm={confirmImport}
      />
    </div>
  );
}
