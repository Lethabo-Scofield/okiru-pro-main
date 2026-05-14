import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@toolkit/components/ui/button';
import {
  ToolkitExcelDropZone,
  ToolkitStructuredReview,
  mapExtractionToFoundation,
  mapExtractionToPillars,
  type ExtractionApiResult,
} from '@/components/upload/UploadWizard';
import type { FoundationData } from '@/components/build/FoundationStep';
import type { BuildPillarsData } from '@/components/build/BuildPillarsStep';
import { EMPTY_CLIENT_INFO } from '@/components/build/ClientInformationForm';
import { normalizeSectorCodeForExtraction } from '@/lib/bbeeSectorCodes';
import { cn } from '@toolkit/lib/utils';

export interface BuildPopulateUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bump when opening the dialog so the drop zone resets between visits. */
  dropzoneResetKey: number;
  /** Prefer foundation / session sector when overriding ambiguous extraction */
  sectorCodeHint: string;
  /** True when collaborator may merge pillar slices (false = foundation/financials only). */
  canWritePillars: boolean;
  /** Applies extraction into manual-build state (parent owns merge + toast). */
  onApplyExtraction: (extraction: ExtractionApiResult) => void;
}

export function BuildPopulateUploadDialog({
  open,
  onOpenChange,
  dropzoneResetKey,
  sectorCodeHint,
  canWritePillars,
  onApplyExtraction,
}: BuildPopulateUploadDialogProps) {
  const [extraction, setExtraction] = useState<ExtractionApiResult | null>(null);
  const [foundationPreview, setFoundationPreview] = useState<Partial<FoundationData>>({});
  const [pillarPreview, setPillarPreview] = useState<Partial<BuildPillarsData>>({});

  useEffect(() => {
    if (!open) {
      setExtraction(null);
      setFoundationPreview({});
      setPillarPreview({});
    }
  }, [open]);

  const handlePayload = useCallback(
    (data: ExtractionApiResult) => {
      setExtraction(data);
      const fdPrev = mapExtractionToFoundation(data);
      const pdPrev = mapExtractionToPillars(data);
      const hint = sectorCodeHint || fdPrev.clientInfo?.sectorCode || '';
      fdPrev.clientInfo = {
        ...(fdPrev.clientInfo || EMPTY_CLIENT_INFO),
        sectorCode: normalizeSectorCodeForExtraction(hint || fdPrev.clientInfo?.sectorCode || ''),
      };
      setFoundationPreview(fdPrev);
      setPillarPreview(pdPrev);
    },
    [sectorCodeHint],
  );

  const handleApply = () => {
    if (!extraction) return;
    onApplyExtraction(extraction);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-2xl max-h-[90vh] overflow-y-auto gap-4',
          'sm:max-w-2xl',
        )}
      >
        <DialogHeader>
          <DialogTitle>Populate with upload</DialogTitle>
          <DialogDescription>
            Upload your B-BBEE toolkit workbook (.xlsx, .csv, or PDF). We run the same structured extract as{' '}
            <span className="text-foreground font-medium">Upload &amp; extract</span>, then merge rows into your manual
            forms — without switching workflows.
          </DialogDescription>
        </DialogHeader>

        {!canWritePillars && (
          <p className="text-sm text-amber-700 dark:text-amber-400 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            View-only access: client info and financials can still be filled from the file; pillar tables will not be
            overwritten.
          </p>
        )}

        <div className="rounded-xl border border-border bg-zinc-950 p-4 text-white">
          <ToolkitExcelDropZone
            key={dropzoneResetKey}
            onExtractionPayload={(payload) => handlePayload(payload)}
          />
        </div>

        {extraction && (
          <div className="rounded-xl border border-border bg-zinc-950 p-4">
            <ToolkitStructuredReview
              result={extraction}
              foundationPreview={foundationPreview}
              pillarPreview={pillarPreview}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!extraction} onClick={handleApply}>
            Apply to forms
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
