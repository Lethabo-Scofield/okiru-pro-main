import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '@toolkit/lib/utils';

export interface ExtractionReviewPaneProps {
  file: File | null;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Split layout: document preview (left) + structured extraction review (right).
 * PDF: inline iframe when a blob URL is available. Excel/CSV: download + “preview limited” notice.
 */
export function ExtractionReviewPane({ file, title = 'Source document', className, children }: ExtractionReviewPaneProps) {
  const [docUrl, setDocUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setDocUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setDocUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const kind = useMemo(() => {
    const n = file?.name || '';
    if (/\.pdf$/i.test(n)) return 'pdf' as const;
    if (/\.(xlsx?|csv)$/i.test(n)) return 'spreadsheet' as const;
    return 'other' as const;
  }, [file]);

  return (
    <div className={cn('flex flex-col lg:flex-row flex-1 min-h-0 gap-0 rounded-2xl overflow-hidden', className)} style={{ border: '1px solid #2c2c2e' }}>
      <div
        className="flex flex-col min-h-[240px] lg:min-h-[420px] lg:w-1/2 shrink-0 bg-[#0d0d0d]"
        style={{ borderBottom: '1px solid #2c2c2e', borderRight: 'none' }}
      >
        <div className="px-4 py-3 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid #2c2c2e' }}>
          {kind === 'pdf' ? (
            <FileText className="w-4 h-4 text-amber-400 shrink-0" />
          ) : kind === 'spreadsheet' ? (
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-[#636366] shrink-0" />
          )}
          <span className="text-sm font-medium text-white truncate">{title}</span>
          {file && docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-[#5e9bff] hover:underline shrink-0"
            >
              Open <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          {!file && (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-[#8e8e93]">
              No file attached.
            </div>
          )}
          {file && kind === 'pdf' && docUrl && (
            <iframe title={title} src={docUrl} className="w-full flex-1 min-h-[320px] bg-[#111]" />
          )}
          {file && kind === 'spreadsheet' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <FileSpreadsheet className="w-10 h-10 text-emerald-500/50" />
              <p className="text-sm text-[#d1d1d6] max-w-sm">
                Spreadsheet preview is limited in the browser. Use{' '}
                <span className="text-white font-medium">Open</span> to view the file in a new tab, or download it to
                inspect rows alongside the extracted summary.
              </p>
              {docUrl && (
                <a
                  href={docUrl}
                  download={file.name}
                  className="text-[13px] font-semibold px-4 py-2 rounded-xl bg-[#1c1c1e] border border-[#2c2c2e] text-[#5e9bff] hover:bg-[#2c2c2e]"
                >
                  Download {file.name}
                </a>
              )}
            </div>
          )}
          {file && kind === 'other' && docUrl && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[#8e8e93]">
              <p>Preview isn&apos;t available for this file type.</p>
              <a href={docUrl} download={file.name} className="text-[#5e9bff] font-medium hover:underline">
                Download file
              </a>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 lg:w-1/2 overflow-y-auto bg-[#1c1c1e] lg:border-l lg:border-[#2c2c2e]">
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default ExtractionReviewPane;
