/**
 * The drop zone, shared by the B-BBEE and ESG upload steps.
 *
 * Empty: one sentence, Upload files (the step's one filled button) and Upload
 * a folder. Once something is staged it folds to a one-line "Add more files"
 * target, so the list and the read bar below it are what the eye lands on.
 *
 * The hidden <input>s stay with the host — they carry its refs and test ids —
 * and this only asks for them to be opened.
 */
import { useState } from "react";
import { CloudUpload, FolderOpen, Plus, Upload } from "lucide-react";
import { READABLE_SUMMARY } from "./readableFiles";

export interface UploadSurfaceProps {
  /** "" for B-BBEE, "esg-" for ESG: the products' existing test ids. */
  testIdPrefix: "" | "esg-";
  /** Something is staged or read: fold to one line. */
  staged: boolean;
  /** The sentence before the list of formats, e.g. "Drop files or a folder." */
  lead: string;
  /** The folded line's words. */
  addMoreLabel?: string;
  onPickFiles: () => void;
  onPickFolder: () => void;
  onDropFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function UploadSurface({
  testIdPrefix: p,
  staged,
  lead,
  addMoreLabel = "Add more files",
  onPickFiles,
  onPickFolder,
  onDropFiles,
  disabled = false,
}: UploadSurfaceProps) {
  const [dragActive, setDragActive] = useState(false);

  return (
    <div
      className={`rounded-[18px] border border-dashed text-center transition-colors duration-200 ${
        dragActive ? "border-white/40 bg-white/[0.05]" : "border-white/[0.16] bg-[color:var(--ink-2)]"
      } ${staged ? "px-4 py-2.5" : "px-5 py-7"}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (!disabled && e.dataTransfer.files?.length) onDropFiles(Array.from(e.dataTransfer.files));
      }}
      data-testid={`${p}docs-drop-zone`}
    >
      {staged ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <button
            type="button"
            disabled={disabled}
            onClick={onPickFiles}
            className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[13px] font-medium text-[color:var(--body)] transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50"
            data-testid={`${p}add-more-documents-label`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {addMoreLabel}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onPickFolder}
            className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[12px] text-[color:var(--muted)] transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden />
            or a folder
          </button>
        </div>
      ) : (
        <>
          <CloudUpload className="mx-auto mb-3 h-6 w-6 text-[color:var(--body)]" aria-hidden />
          <p className="mx-auto mb-4 max-w-md text-[13px] leading-5 text-[color:var(--body)]">
            {lead} {READABLE_SUMMARY}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={onPickFiles}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-black transition-colors duration-200 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 disabled:opacity-50"
              data-testid={`${p}button-upload-documents`}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Upload files
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onPickFolder}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-white/[0.14] px-5 py-2.5 text-[14px] font-semibold text-[color:var(--body)] transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 disabled:opacity-50"
              data-testid={`${p}button-upload-folder`}
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
              Upload a folder
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default UploadSurface;
