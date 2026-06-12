import type { EsgImportPreview } from "@/lib/esg/esgWorkbookImport";

type Props = {
  open: boolean;
  preview: EsgImportPreview | null;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
};

export function EsgImportPreviewModal({ open, preview, onClose, onConfirm, confirming }: Props) {
  if (!open || !preview) return null;
  const sectionIds = Object.keys(preview.sections);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      data-testid="esg-import-preview-modal"
    >
      <div className="max-w-lg w-full rounded-2xl border border-white/[0.06] bg-[#141416] p-6">
        <h3 className="text-[16px] font-semibold text-white mb-2">Import preview</h3>
        <p className="text-[12px] text-[#8e8e93] mb-4">
          {sectionIds.length} section(s) will be updated. Review before confirming.
        </p>
        <ul className="text-[12px] space-y-1 mb-4 max-h-48 overflow-y-auto">
          {sectionIds.map((id) => (
            <li key={id} className="text-[#d1d1d6]">
              {id}: {Object.keys(preview.sections[id]?.cells ?? {}).length} cells
            </li>
          ))}
        </ul>
        {preview.warnings.length > 0 ? (
          <p className="text-[11px] text-amber-300 mb-3">{preview.warnings.join("; ")}</p>
        ) : null}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#2c2c2e] text-[13px] text-[#d1d1d6]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-[13px] font-semibold disabled:opacity-50"
            data-testid="esg-import-confirm"
          >
            {confirming ? "Importing…" : "Confirm import"}
          </button>
        </div>
      </div>
    </div>
  );
}
