/**
 * The speed bump before a batch goes in.
 *
 * Nearly every bad first score traces back to the upload, not the maths: last
 * year's financials, a draft share register, a photograph of a certificate too
 * dark to read, forty files where two of them belong to a different company.
 * By the time that surfaces we have already read the documents and the user has
 * already spent tokens — the cheapest possible place to catch it is here, in
 * the two seconds before they commit.
 *
 * So this is deliberately a plain list of what is about to be sent and a short
 * set of things worth glancing at. It is not a warning and it does not require
 * ticking anything: a dialog people have to defeat is a dialog people stop
 * reading.
 */
import { useEffect, useRef } from "react";
import { AlertTriangle, FileText, FolderOpen } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface PendingUpload {
  files: File[];
  /** The pillar batch these were dropped into. */
  batchLabel: string;
  /** The specific document type, when they used a per-document slot. */
  documentTypeName?: string;
  /** True when this came from a whole-folder pick. */
  fromFolder?: boolean;
}

/** The checks that actually catch faults, in the order they bite. */
const CHECKS = [
  "These belong to the company you are scoring — not a subsidiary, a client or a supplier.",
  "They cover the financial year you are being measured on.",
  "Signed and dated where a signature is required, and final rather than draft.",
  "Scans are legible end to end — no cropped edges, no pages missing.",
];

export function ConfirmUploadDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingUpload | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // The dialog animates out, so it is still on screen for a moment after
  // `pending` clears. Rendering the live value there would flash "Add 0
  // documents to this section?" on the way out; the last real payload is what
  // should fade.
  const lastPending = useRef<PendingUpload | null>(null);
  useEffect(() => {
    if (pending) lastPending.current = pending;
  }, [pending]);

  const shown = pending ?? lastPending.current;
  const files = shown?.files ?? [];
  const target = shown?.documentTypeName || shown?.batchLabel || "this section";

  return (
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent className="max-w-lg" data-testid="confirm-upload-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {shown?.fromFolder ? <FolderOpen className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            Add {files.length} {files.length === 1 ? "document" : "documents"} to {target}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Take a second to check these are the right files. Catching it now is free — catching it after we
            have read them is not.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-40 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-2">
          <ul className="space-y-0.5">
            {files.map((file) => (
              <li key={`${file.name}:${file.size}`} className="flex items-center gap-2 px-1.5 py-1 text-[12.5px]">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {file.size >= 1024 * 1024
                    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                    : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ul className="space-y-1.5">
          {CHECKS.map((check) => (
            <li key={check} className="flex items-start gap-2 text-[12.5px] leading-5 text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
              {check}
            </li>
          ))}
        </ul>

        <p className="text-[11.5px] leading-5 text-muted-foreground">
          Nothing is read or charged yet. We size the batch first and show you the token cost before any
          processing starts.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel data-testid="confirm-upload-cancel">Go back</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} data-testid="confirm-upload-accept">
            Yes, add {files.length === 1 ? "it" : "them"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmUploadDialog;
