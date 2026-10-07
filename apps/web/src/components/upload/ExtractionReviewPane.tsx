import React from 'react';
import { cn } from '@toolkit/lib/utils';
import { DocumentPreview, type PreviewFocus } from '@/components/review/DocumentPreview';

export interface ExtractionReviewPaneProps {
  file: File | null;
  title?: string;
  className?: string;
  /** The page or sheet to show — the citation of the value being checked. */
  focus?: PreviewFocus | null;
  children: React.ReactNode;
}

/**
 * Split layout: document preview (left) + structured extraction review (right).
 *
 * The preview is the shared one: PDFs drawn page by page with pdf.js,
 * spreadsheets as tables, images inline. It replaced an iframe of the blob,
 * which the production CSP blocked (a blank grey box) and phones cannot show.
 */
export function ExtractionReviewPane({ file, title = 'Source document', className, focus, children }: ExtractionReviewPaneProps) {
  return (
    <div className={cn('flex flex-col lg:flex-row flex-1 min-h-0 gap-0 rounded-2xl overflow-hidden', className)} style={{ border: '1px solid var(--rule)' }}>
      <div className="flex flex-col min-h-[320px] lg:min-h-[420px] lg:w-1/2 shrink-0 bg-[#0d0d0d]" style={{ borderBottom: '1px solid var(--rule)' }}>
        {file ? (
          <DocumentPreview name={file.name || title} file={file} focus={focus} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-[color:var(--body)]">
            No file attached.
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 lg:w-1/2 overflow-y-auto bg-[color:var(--ink-3)] lg:border-l lg:border-[color:var(--rule)]">
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default ExtractionReviewPane;
