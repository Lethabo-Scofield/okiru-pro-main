import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import * as pdfjsLib from 'pdfjs-dist';
import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@toolkit/lib/auth';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  X, Home, ArrowLeft, CloudUpload, Puzzle, Cpu, SearchCheck,
  Check, AlertTriangle, PlusCircle, Loader2, Trash2, ChevronRight, ChevronLeft,
  Circle, Zap, ListChecks, CheckCheck, FileText, FileSpreadsheet,
  FileImage, File, FileQuestion, Building2, ScanLine, Monitor, HelpCircle, LogOut
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface StoredTemplate {
  id: number;
  name: string;
  description: string;
  version: string;
  entities: { label: string; definition: string; synonyms?: string[]; zones?: string[]; keywords?: any; pattern?: string; positives?: string[]; negatives?: string[] }[];
  createdAt: string;
  updatedAt: string;
}

interface UploadedFile {
  id: number;
  file: File;
  name: string;
  size: string;
  type: string;
  uploadProgress: number;
  status: 'uploading' | 'ready' | 'error';
  textContent: string;
}

interface CompanyInfo {
  name: string;
  sector: string;
  registrationNumber: string;
  annualTurnover: string;
  employees: string;
  financialYearEnd: string;
  address: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  currentBBEELevel: string;
  notes: string;
  logo?: string;
}

interface ProcessorSession {
  id: string;
  companyInfo: CompanyInfo;
  createdAt: string;
  updatedAt: string;
  currentStep: 'company-info' | 'upload' | 'classify' | 'extract' | 'processing' | 'review' | 'scorecard';
  filesData: { id: number; name: string; size: string; type: string; textContent: string }[];
  fileClassifications: Record<string, number>;
  extractionResults: any[];
  docStatuses: Record<number, string>;
  isComplete: boolean;
  scorecardResult?: any;
}

const BBEE_SECTORS = [
  'Agriculture', 'Construction', 'Education', 'Financial Services',
  'Healthcare', 'Information Technology', 'Manufacturing', 'Mining',
  'Professional Services', 'Retail', 'Transportation', 'Other',
];

const BBEE_LEVELS = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8', 'Non-Compliant', 'Not Verified'];
const FYE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const EMPTY_COMPANY_INFO: CompanyInfo = {
  name: '', sector: '', registrationNumber: '', annualTurnover: '', employees: '',
  financialYearEnd: '', address: '', contactName: '', contactEmail: '',
  contactPhone: '', currentBBEELevel: '', notes: '',
};

function generateSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function apiSaveSession(session: ProcessorSession): Promise<ProcessorSession | null> {
  try {
    const res = await fetch('/api/processor-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        companyInfo: session.companyInfo,
        currentStep: session.currentStep,
        filesData: session.filesData,
        fileClassifications: session.fileClassifications,
        extractionResults: session.extractionResults,
        docStatuses: session.docStatuses,
        isComplete: session.isComplete,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function apiLoadSession(sessionId: string): Promise<ProcessorSession | null> {
  try {
    const res = await fetch(`/api/processor-sessions/${sessionId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.sessionId || data.id,
      companyInfo: data.companyInfo,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      currentStep: data.currentStep,
      filesData: data.filesData || [],
      fileClassifications: data.fileClassifications || {},
      extractionResults: data.extractionResults || [],
      docStatuses: data.docStatuses || {},
      isComplete: data.isComplete || false,
      scorecardResult: data.scorecardResult || null,
    };
  } catch { return null; }
}

const FileIcon = ({ type, className }: { type: string; className?: string }) => {
  const props = { className: className || "w-4 h-4" };
  switch (type) {
    case 'PDF': case 'TXT': case 'DOC': case 'DOCX': return <FileText {...props} />;
    case 'CSV': return <FileSpreadsheet {...props} />;
    case 'JPG': case 'JPEG': case 'PNG': return <FileImage {...props} />;
    default: return <File {...props} />;
  }
};

function FileFormatBadge({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' | 'lg' }) {
  const configs: Record<string, { bg: string; text: string; label: string }> = {
    PDF:  { bg: '#FF3B30', text: '#fff', label: 'PDF' },
    DOCX: { bg: '#007AFF', text: '#fff', label: 'DOC' },
    DOC:  { bg: '#007AFF', text: '#fff', label: 'DOC' },
    XLSX: { bg: '#34C759', text: '#fff', label: 'XLS' },
    XLS:  { bg: '#34C759', text: '#fff', label: 'XLS' },
    CSV:  { bg: '#30D158', text: '#fff', label: 'CSV' },
    TXT:  { bg: '#636366', text: '#fff', label: 'TXT' },
    JPG:  { bg: '#AF52DE', text: '#fff', label: 'JPG' },
    JPEG: { bg: '#AF52DE', text: '#fff', label: 'JPG' },
    PNG:  { bg: '#5E5CE6', text: '#fff', label: 'PNG' },
    EML:  { bg: '#FF9F0A', text: '#fff', label: 'EML' },
    JSON: { bg: '#FF6B00', text: '#fff', label: 'JSON' },
  };
  const cfg = configs[type?.toUpperCase()] || { bg: '#48484a', text: '#fff', label: type?.slice(0, 4)?.toUpperCase() || 'FILE' };

  const dims = size === 'sm' ? { w: 36, h: 44, foldSize: 9, labelSize: 7 }
             : size === 'lg' ? { w: 52, h: 64, foldSize: 14, labelSize: 10 }
             : { w: 44, h: 54, foldSize: 11, labelSize: 8 };

  const { w, h, foldSize, labelSize } = dims;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d={`M4 0 H${w - foldSize} L${w} ${foldSize} V${h - 4} Q${w} ${h} ${w - 4} ${h} H4 Q0 ${h} 0 ${h - 4} V4 Q0 0 4 0Z`}
        fill={cfg.bg}
        opacity="0.18"
      />
      <path
        d={`M4 0.5 H${w - foldSize} L${w - 0.5} ${foldSize} V${h - 4} Q${w - 0.5} ${h - 0.5} ${w - 4} ${h - 0.5} H4 Q0.5 ${h - 0.5} 0.5 ${h - 4} V4 Q0.5 0.5 4 0.5Z`}
        stroke={cfg.bg}
        strokeWidth="1"
        fill="none"
        opacity="0.4"
      />
      <path
        d={`M${w - foldSize} 0 L${w - foldSize} ${foldSize} L${w} ${foldSize}`}
        fill={cfg.bg}
        opacity="0.35"
      />
      <rect x={2} y={h - 18} width={w - 4} height={16} rx={3} fill={cfg.bg} />
      <text
        x={w / 2}
        y={h - 7}
        textAnchor="middle"
        fill={cfg.text}
        fontSize={labelSize}
        fontWeight="800"
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
        letterSpacing="0.5"
      >
        {cfg.label}
      </text>
    </svg>
  );
}

function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const raw = line.replace(/\r$/, '');
    if (!raw.trim()) continue;
    const fields: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"') {
        if (inQuotes && raw[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        fields.push(field); field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    rows.push(fields);
  }
  return rows;
}

function CSVTableViewer({ text, isExcel }: { text: string; isExcel: boolean }) {
  const sections = useMemo(() => {
    if (!text) return [];
    if (isExcel) {
      const chunks = text.split(/=== Sheet: (.+?) ===\n?/);
      const sheets: { name: string; rows: string[][] }[] = [];
      for (let i = 1; i < chunks.length; i += 2) {
        const name = chunks[i]?.trim() || `Sheet ${Math.ceil(i / 2)}`;
        const content = chunks[i + 1] || '';
        const rows = parseCSVRows(content);
        if (rows.length > 0) sheets.push({ name, rows });
      }
      return sheets.length > 0 ? sheets : [{ name: '', rows: parseCSVRows(text) }];
    }
    return [{ name: '', rows: parseCSVRows(text) }];
  }, [text, isExcel]);

  const [activeSheet, setActiveSheet] = useState(0);
  const section = sections[activeSheet] || sections[0];

  if (!section) return (
    <div className="flex flex-col items-center justify-center py-16">
      <FileQuestion className="w-8 h-8 text-gray-300 mb-3" />
      <p className="text-gray-400 text-sm">No content to display</p>
    </div>
  );

  const { rows } = section;
  const header = rows[0] || [];
  const body = rows.slice(1);
  const maxCols = Math.max(...rows.map(r => r.length), 1);
  const colsToShow = Math.min(maxCols, 20);

  return (
    <div className="flex flex-col h-full">
      {sections.length > 1 && (
        <div className="flex gap-1 px-4 pt-3 pb-0 flex-wrap">
          {sections.map((s, i) => (
            <button key={i} onClick={() => setActiveSheet(i)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                activeSheet === i
                  ? 'bg-white text-gray-800 shadow-sm border border-gray-200'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-white/60'
              }`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
          <table className="w-full text-left border-collapse" style={{ fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 border-b border-gray-200 select-none" style={{ width: 36, minWidth: 36 }}>#</th>
                {header.slice(0, colsToShow).map((h, ci) => (
                  <th key={ci} className="px-3 py-2 text-[11px] font-semibold text-gray-600 border-b border-gray-200 border-l border-gray-100 whitespace-nowrap" style={{ maxWidth: 200 }}>
                    {h || <span className="text-gray-300">Col {ci + 1}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.length === 0 ? (
                <tr><td colSpan={colsToShow + 1} className="px-4 py-6 text-center text-gray-400 text-sm">No data rows</td></tr>
              ) : (
                body.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td className="px-3 py-1.5 text-[10px] text-gray-300 font-mono select-none">{ri + 2}</td>
                    {Array.from({ length: colsToShow }).map((_, ci) => {
                      const val = row[ci] ?? '';
                      const isNum = val !== '' && !isNaN(Number(val));
                      return (
                        <td key={ci} className="px-3 py-1.5 border-l border-gray-100 text-gray-700" style={{ maxWidth: 200 }}>
                          <div className="truncate" style={{ maxWidth: 180 }}>
                            {isNum
                              ? <span className="font-mono text-[11px] text-blue-700">{val}</span>
                              : <span className="text-[12px]">{val}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {maxCols > colsToShow && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-[11px] text-gray-400">
              Showing {colsToShow} of {maxCols} columns
            </div>
          )}
        </div>
        <div className="mt-2 text-[11px] text-gray-400 text-right">
          {body.length} row{body.length !== 1 ? 's' : ''} · {header.length} column{header.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

function getEntityColors(_dark?: boolean) {
  const c = { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.35)', text: '#c084fc', underline: '#a855f7' };
  return [c, c, c, c, c, c, c, c];
}

function HighlightedDocument({ text, entities, hoveredEntity, onHoverEntity }: {
  text: string; entities: any[];
  hoveredEntity: number | null; onHoverEntity: (idx: number | null) => void;
}) {
  const highlighted = useMemo(() => {
    if (!text || !entities || entities.length === 0) return [{ text, highlight: false, entityIdx: -1 }];

    const matches: { start: number; end: number; entityIdx: number }[] = [];
    entities.forEach((entity: any, idx: number) => {
      if (!entity.value || entity.status === 'not_found' || entity.status === 'rejected') return;
      const val = entity.value.trim();
      if (!val || val.length < 2) return;

      const escapedVal = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        const regex = new RegExp(escapedVal, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          matches.push({ start: match.index, end: match.index + match[0].length, entityIdx: idx });
        }
      } catch {}
    });

    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const filtered: typeof matches = [];
    for (const m of matches) {
      if (filtered.length === 0 || m.start >= filtered[filtered.length - 1].end) {
        filtered.push(m);
      } else if (m.end - m.start > filtered[filtered.length - 1].end - filtered[filtered.length - 1].start && m.start === filtered[filtered.length - 1].start) {
        filtered[filtered.length - 1] = m;
      }
    }

    if (filtered.length === 0) return [{ text, highlight: false, entityIdx: -1 }];

    const segments: { text: string; highlight: boolean; entityIdx: number }[] = [];
    let pos = 0;
    for (const m of filtered) {
      if (m.start > pos) segments.push({ text: text.slice(pos, m.start), highlight: false, entityIdx: -1 });
      segments.push({ text: text.slice(m.start, m.end), highlight: true, entityIdx: m.entityIdx });
      pos = m.end;
    }
    if (pos < text.length) segments.push({ text: text.slice(pos), highlight: false, entityIdx: -1 });
    return segments;
  }, [text, entities]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 min-h-[400px]">
      <p className="text-[15px] text-gray-900 whitespace-pre-wrap font-sans leading-[1.8] break-words" style={{ fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: '0' }}>
        {highlighted.map((seg, i) => {
          if (!seg.highlight) return <span key={i}>{seg.text}</span>;
          const colors = getEntityColors(false);
          const color = colors[seg.entityIdx % colors.length];
          const isHovered = hoveredEntity === seg.entityIdx;
          const entityName = entities[seg.entityIdx]?.name || '';
          return (
            <span key={i} className="relative inline-block group/mark"
              onMouseEnter={() => onHoverEntity(seg.entityIdx)}
              onMouseLeave={() => onHoverEntity(null)}
            >
              <span className="absolute -top-5 left-0 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap px-1.5 py-0.5 rounded-t-md z-10 pointer-events-none"
                style={{
                  backgroundColor: color.underline,
                  color: '#fff',
                  opacity: isHovered ? 1 : 0,
                  transition: 'opacity 0.15s',
                }}>
                {entityName}
              </span>
              <mark style={{
                backgroundColor: isHovered ? color.bg.replace('0.15', '0.35') : color.bg,
                borderBottom: `3px solid ${color.underline}`,
                color: '#111827',
                padding: '2px 3px',
                borderRadius: '3px',
                transition: 'background-color 0.15s',
                fontWeight: isHovered ? 600 : 400,
              }}>
                {seg.text}
              </mark>
            </span>
          );
        })}
      </p>
    </div>
  );
}

interface PageData {
  imageUrl: string;
  textItems: { str: string; left: number; top: number; width: number; height: number; fontSize: number }[];
  width: number;
  height: number;
}

function PDFPageCanvas({ page, entities, entityMatchers, entityColors, hoveredEntity, onHoverEntity }: {
  page: PageData;
  entities: any[];
  entityMatchers: { regex: RegExp; entityIdx: number }[];
  entityColors: ReturnType<typeof getEntityColors>;
  hoveredEntity: number | null;
  onHoverEntity: (idx: number | null) => void;
}) {
  return (
    <div className="relative shadow-2xl rounded-lg overflow-hidden" style={{ width: page.width }}>
      <img src={page.imageUrl} alt="PDF page" className="block w-full h-auto" draggable={false} />
      <div className="absolute inset-0">
        {page.textItems.map((item, itemIdx) => {
          let matchedEntityIdx = -1;
          for (const matcher of entityMatchers) {
            matcher.regex.lastIndex = 0;
            if (matcher.regex.test(item.str)) {
              matchedEntityIdx = matcher.entityIdx;
              break;
            }
          }
          if (matchedEntityIdx === -1) return null;

          const color = entityColors[matchedEntityIdx % entityColors.length];
          const isHovered = hoveredEntity === matchedEntityIdx;
          const entityName = entities[matchedEntityIdx]?.name || '';

          return (
            <span
              key={itemIdx}
              className="absolute cursor-pointer"
              style={{
                left: item.left,
                top: item.top,
                width: item.width,
                height: item.height + 4,
                backgroundColor: isHovered ? color.bg.replace('0.15', '0.45') : color.bg.replace('0.15', '0.25'),
                borderBottom: `3px solid ${color.underline}`,
                borderRadius: '2px',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={() => onHoverEntity(matchedEntityIdx)}
              onMouseLeave={() => onHoverEntity(null)}
            >
              {isHovered && (
                <span
                  className="absolute -top-6 left-0 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap px-1.5 py-0.5 rounded-md z-20 pointer-events-none"
                  style={{ backgroundColor: color.underline, color: '#fff' }}
                >
                  {entityName}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PDFDocumentViewer({ file, entities, hoveredEntity, onHoverEntity }: {
  file: File;
  entities: any[];
  hoveredEntity: number | null;
  onHoverEntity: (idx: number | null) => void;
}) {
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const scale = 1.5;
  const entityColors = useMemo(() => getEntityColors(true), []);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;
    const imageUrls: string[] = [];

    const renderPdf = async () => {
      setLoading(true);
      setError(false);
      try {
        const arrayBuffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const rendered: PageData[] = [];

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;

          const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
          const url = URL.createObjectURL(blob);
          imageUrls.push(url);

          const textContent = await page.getTextContent();
          const textItems = textContent.items
            .filter((item: any) => item.str && item.str.trim())
            .map((item: any) => {
              const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
              const fontHeight = Math.abs(tx[3]);
              return {
                str: item.str,
                left: tx[4],
                top: tx[5] - fontHeight,
                width: item.width * scale,
                height: fontHeight,
                fontSize: fontHeight,
              };
            });

          rendered.push({
            imageUrl: url,
            textItems,
            width: viewport.width,
            height: viewport.height,
          });

          canvas.width = 0;
          canvas.height = 0;
        }
        if (!cancelled) {
          setPages(rendered);
          setLoading(false);
        }
      } catch (err) {
        console.error('PDF render failed:', err);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    };
    renderPdf();
    return () => {
      cancelled = true;
      imageUrls.forEach((url) => URL.revokeObjectURL(url));
      if (pdfDoc) pdfDoc.destroy();
    };
  }, [file, scale]);

  const entityMatchers = useMemo(() => {
    return entities
      .map((entity: any, idx: number) => {
        if (!entity.value || entity.status === 'not_found' || entity.status === 'rejected') return null;
        const val = entity.value.trim();
        if (!val || val.length < 2) return null;
        const escapedVal = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          return { regex: new RegExp(escapedVal, 'gi'), entityIdx: idx };
        } catch { return null; }
      })
      .filter(Boolean) as { regex: RegExp; entityIdx: number }[];
  }, [entities]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        <p className="text-[#8e8e93] text-sm">Rendering document...</p>
      </div>
    );
  }

  if (error || pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <FileQuestion className="w-8 h-8 text-[#636366]" />
        <p className="text-[#636366] text-sm">Could not render document</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {pages.map((page, pageIdx) => (
        <div key={pageIdx} className="relative">
          <PDFPageCanvas
            page={page}
            entities={entities}
            entityMatchers={entityMatchers}
            entityColors={entityColors}
            hoveredEntity={hoveredEntity}
            onHoverEntity={onHoverEntity}
          />
          <div className="absolute bottom-2 right-3 text-[10px] text-white/40 font-medium bg-black/40 px-2 py-0.5 rounded-md">
            Page {pageIdx + 1}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DocumentProcessor() {
  const { isDark } = useTheme();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const entityColors = useMemo(() => getEntityColors(isDark), [isDark]);
  const [currentPage, setCurrentPage] = useState<'company-info' | 'upload' | 'classify' | 'extract' | 'processing' | 'review'>('company-info');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(() => {
    return new URLSearchParams(window.location.search).has('session');
  });
  const sessionCreatedAt = useRef<string>(new Date().toISOString());
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [fileClassifications, setFileClassifications] = useState<Record<string, number>>({});
  const [fileDocTypes, setFileDocTypes] = useState<Record<string, 'digital' | 'scanned'>>({});
  const [extractionResults, setExtractionResults] = useState<any[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [activeReviewDoc, setActiveReviewDoc] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'edited'>('all');
  const [docStatuses, setDocStatuses] = useState<Record<number, 'waiting' | 'processing' | 'done' | 'error'>>({});
  const [completedCount, setCompletedCount] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const processingFinalized = useRef(false);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/templates");
      if (res.ok) setTemplates(await res.json());
    } catch (err) { console.error("Error fetching templates:", err); }
    finally { setLoadingTemplates(false); }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (!sid) return;
    setIsLoadingSession(true);
    apiLoadSession(sid).then(sess => {
      setIsLoadingSession(false);
      if (!sess) {
        toast({ title: 'Session not found', description: 'Could not resume that session.', variant: 'destructive' });
        return;
      }
      setSessionId(sess.id);
      sessionCreatedAt.current = sess.createdAt;
      setCompanyInfo({ ...EMPTY_COMPANY_INFO, ...sess.companyInfo });
      setFileClassifications(sess.fileClassifications || {});
      const normalizeResults = (results: any[]) => (results || []).map((r: any) => ({
        ...r,
        entities: (r.entities || []).map((e: any) => ({
          ...e,
          name: e.name || e.entity || '',
          confidence: e.confidence ?? e.conf ?? 0,
        })),
      }));
      setExtractionResults(normalizeResults(sess.extractionResults));
      if (sess.filesData && sess.filesData.length > 0) {
        const NativeFile = window.File as typeof globalThis.File;
        const restored: UploadedFile[] = sess.filesData.map((fd: any) => {
          let fileObj: globalThis.File;
          if (fd.fileBase64) {
            try {
              const binary = atob(fd.fileBase64);
              const bytes = new Uint8Array(binary.length);
              for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
              fileObj = new NativeFile([bytes], fd.name, { type: 'application/pdf' });
            } catch {
              fileObj = new NativeFile([], fd.name, { type: 'application/pdf' });
            }
          } else {
            fileObj = new NativeFile([], fd.name, { type: fd.type === 'PDF' ? 'application/pdf' : 'application/octet-stream' });
          }
          return { id: fd.id, file: fileObj, name: fd.name, size: fd.size, type: fd.type, uploadProgress: 100, status: 'ready' as const, textContent: fd.textContent || '' };
        });
        setUploadedFiles(restored);
      }
      const validSteps = ['company-info', 'upload', 'classify', 'extract', 'review', 'scorecard'];
      const step = sess.currentStep && validSteps.includes(sess.currentStep)
        ? sess.currentStep
        : sess.scorecardResult ? 'scorecard'
        : sess.extractionResults && sess.extractionResults.length > 0 ? 'review'
        : sess.filesData && sess.filesData.length > 0 ? 'classify'
        : 'upload';
      setCurrentPage(step as any);
      toast({ title: `Resumed: ${sess.companyInfo.name}`, description: 'Your session has been loaded.' });
    });
  }, [location]);

  const persistSession = useCallback(async (step: string, opts?: {
    ci?: CompanyInfo;
    files?: UploadedFile[];
    classifications?: Record<string, number>;
    results?: any[];
    statuses?: Record<number, string>;
    complete?: boolean;
    scorecardResult?: any;
  }) => {
    const sid = sessionId || generateSessionId();
    if (!sessionId) setSessionId(sid);
    const ci = opts?.ci ?? companyInfo;
    if (!ci.name) return sid;
    const sess: ProcessorSession = {
      id: sid,
      companyInfo: ci,
      createdAt: sessionCreatedAt.current,
      updatedAt: new Date().toISOString(),
      currentStep: step as ProcessorSession['currentStep'],
      filesData: await Promise.all((opts?.files ?? uploadedFiles).map(async f => {
        let fileBase64: string | undefined;
        if (f.type === 'PDF' && f.file && f.file.size > 0) {
          try {
            const buf = await f.file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let j = 0; j < bytes.length; j += 8192) {
              const chunk = Array.from(bytes.subarray(j, j + 8192));
              binary += String.fromCharCode(...chunk);
            }
            fileBase64 = btoa(binary);
          } catch { /* skip */ }
        }
        return { id: f.id, name: f.name, size: f.size, type: f.type, textContent: f.textContent, ...(fileBase64 ? { fileBase64 } : {}) };
      })),
      fileClassifications: opts?.classifications ?? fileClassifications,
      extractionResults: opts?.results ?? extractionResults,
      docStatuses: opts?.statuses ?? docStatuses,
      isComplete: opts?.complete ?? false,
      scorecardResult: opts?.scorecardResult ?? undefined,
    };
    await apiSaveSession(sess);
    return sid;
  }, [sessionId, companyInfo, uploadedFiles, fileClassifications, extractionResults, docStatuses]);

  const lastSavedFilesRef = useRef<string>('');
  useEffect(() => {
    if (!sessionId || currentPage !== 'upload') return;
    const allReady = uploadedFiles.length > 0 && uploadedFiles.every(f => f.status === 'ready');
    if (!allReady) return;
    const key = uploadedFiles.map(f => f.id + f.status).join(',');
    if (key === lastSavedFilesRef.current) return;
    lastSavedFilesRef.current = key;
    persistSession('upload', { files: uploadedFiles });
  }, [uploadedFiles, currentPage, sessionId, persistSession]);

  const lastSavedClassifyRef = useRef<string>('');
  useEffect(() => {
    if (!sessionId || currentPage !== 'classify') return;
    const key = JSON.stringify(fileClassifications);
    if (key === lastSavedClassifyRef.current || key === '{}') return;
    lastSavedClassifyRef.current = key;
    const t = setTimeout(() => { persistSession('classify', { classifications: fileClassifications }); }, 800);
    return () => clearTimeout(t);
  }, [fileClassifications, currentPage, sessionId, persistSession]);

  const extractPdfText = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((item: any) => item.str).join(' '));
      }
      return pages.join('\n\n');
    } catch (err) {
      console.error('PDF extraction failed:', err);
      return `[Could not extract text from PDF: ${file.name}]`;
    }
  };

  const extractDocxText = async (file: File): Promise<string> => {
    try {
      const JSZip = (await import('jszip')).default;
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = zip.file('word/document.xml');
      if (!docXml) return `[No document.xml found in DOCX: ${file.name}]`;
      const xmlText = await docXml.async('text');
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'application/xml');
      const paragraphs: string[] = [];
      const pNodes = doc.getElementsByTagName('w:p');
      for (let i = 0; i < pNodes.length; i++) {
        const tNodes = pNodes[i].getElementsByTagName('w:t');
        let pText = '';
        for (let j = 0; j < tNodes.length; j++) {
          pText += tNodes[j].textContent || '';
        }
        if (pText.trim()) paragraphs.push(pText);
      }
      return paragraphs.join('\n') || `[No text content in DOCX: ${file.name}]`;
    } catch (err) {
      console.error('DOCX extraction failed:', err);
      return `[Could not extract text from DOCX: ${file.name}]`;
    }
  };

  const extractXlsxText = async (file: File): Promise<string> => {
    try {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheets: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) {
          sheets.push(`=== Sheet: ${sheetName} ===\n${csv}`);
        }
      }
      return sheets.join('\n\n') || `[No text content in Excel file: ${file.name}]`;
    } catch (err) {
      console.error('Excel extraction failed:', err);
      return `[Could not extract text from Excel file: ${file.name}]`;
    }
  };

  const readFileText = async (file: File): Promise<string> => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPdfText(file);
    if (name.endsWith('.docx') || name.endsWith('.doc') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocxText(file);
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel') return extractXlsxText(file);
    if (name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.eml') || name.endsWith('.json') || name.endsWith('.md') || name.endsWith('.html') || name.endsWith('.xml') || file.type.startsWith('text/')) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string || '');
        reader.onerror = () => resolve(`[Could not read file: ${file.name}]`);
        reader.readAsText(file);
      });
    }
    return `[Unsupported file format: ${file.name}. Supported formats: PDF, DOCX, XLSX, XLS, TXT, CSV, EML, JSON]`;
  };

  const handleFiles = (files: File[]) => {
    const newFiles: UploadedFile[] = files.map(file => ({
      id: Date.now() + Math.random(),
      file, name: file.name,
      size: (file.size / 1024).toFixed(1),
      type: file.name.split('.').pop()?.toUpperCase() || 'UNKNOWN',
      uploadProgress: 0, status: 'uploading' as const, textContent: '',
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach(async (newFile) => {
      const textContent = await readFileText(newFile.file);
      let prog = 0;
      const interval = setInterval(() => {
        prog += Math.random() * 30 + 10;
        if (prog >= 100) {
          clearInterval(interval);
          setUploadedFiles(prev => prev.map(f => f.id === newFile.id ? { ...f, uploadProgress: 100, status: 'ready' as const, textContent } : f));
        } else {
          setUploadedFiles(prev => prev.map(f => f.id === newFile.id ? { ...f, uploadProgress: Math.min(prog, 99) } : f));
        }
      }, 150);
    });
  };

  const removeFile = (fileId: number) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    const c = { ...fileClassifications }; delete c[String(fileId)]; setFileClassifications(c);
  };

  useEffect(() => { return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); }; }, []);

  const startProcessing = () => {
    const unclassified = uploadedFiles.filter(f => !fileClassifications[String(f.id)]);
    if (unclassified.length > 0) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    processingFinalized.current = false;

    const initialStatuses: Record<number, 'processing' | 'done' | 'error' | 'waiting'> = {};
    uploadedFiles.forEach((_, i) => { initialStatuses[i] = 'processing'; });
    setDocStatuses(initialStatuses);
    setCompletedCount(0);
    setProcessingError(null);
    setExtractionResults([]);
    setCurrentPage('extract');

    const documents = uploadedFiles.map((file) => {
      const templateId = fileClassifications[String(file.id)];
      const template = templates.find(t => t.id === templateId);
      return {
        fileName: file.name, templateId,
        templateName: template?.name || "Unknown",
        entitiesToExtract: template?.entities || [],
        documentText: file.textContent || '',
      };
    });

    const resultsAccumulator: any[] = new Array(documents.length).fill(null);

    const finalizeResults = () => {
      if (processingFinalized.current) return;
      processingFinalized.current = true;
      const finalResults = resultsAccumulator.map((r, i) => r || {
        fileName: documents[i].fileName, templateId: documents[i].templateId,
        templateName: documents[i].templateName, entities: [],
      });
      setExtractionResults(finalResults);
      persistSession('review', { results: finalResults });
      setTimeout(() => setCurrentPage('review'), 600);
    };

    const handleEvent = (eventType: string, data: any) => {
      if (controller.signal.aborted || processingFinalized.current) return;
      switch (eventType) {
        case "doc-start":
          setDocStatuses(prev => ({ ...prev, [data.index]: 'processing' }));
          break;
        case "doc-done":
        case "doc-error":
          setDocStatuses(prev => ({ ...prev, [data.index]: eventType === 'doc-done' ? 'done' : 'error' }));
          resultsAccumulator[data.index] = {
            fileName: data.fileName, templateId: data.templateId,
            templateName: data.templateName,
            entities: (data.entities || []).map((e: any) => ({
              ...e,
              name: e.name || e.entity || '',
              confidence: e.confidence ?? e.conf ?? 0,
            })),
          };
          setCompletedCount(prev => { const next = prev + 1; if (next >= documents.length) finalizeResults(); return next; });
          break;
        case "complete":
          finalizeResults();
          break;
      }
    };

    const parseSSEBlock = (block: string) => {
      const normalized = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let eventType = "";
      let dataLines: string[] = [];
      for (const line of normalized.split("\n")) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (eventType && dataLines.length > 0) {
        try { handleEvent(eventType, JSON.parse(dataLines.join("\n"))); } catch {}
      }
    };

    const splitSSEBlocks = (raw: string) => raw.split(/\r?\n\r?\n/);

    fetch("/api/process-documents-stream", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents }), signal: controller.signal,
    }).then(response => {
      if (!response.ok) throw new Error("Server returned an error");
      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const pump = (): Promise<void> => {
        return reader.read().then(({ done, value }) => {
          if (controller.signal.aborted) return;
          if (done) {
            if (buffer.trim()) splitSSEBlocks(buffer).filter(b => b.trim()).forEach(parseSSEBlock);
            finalizeResults();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const blocks = splitSSEBlocks(buffer);
          buffer = blocks.pop() || "";
          blocks.filter(b => b.trim()).forEach(parseSSEBlock);
          return pump();
        });
      };
      return pump();
    }).catch(err => {
      if (err.name === 'AbortError') return;
      console.error("Stream error:", err);
      setProcessingError(err.message);
      setExtractionResults(documents.map(doc => ({
        fileName: doc.fileName, templateId: doc.templateId, templateName: doc.templateName,
        entities: doc.entitiesToExtract.map((e: any) => ({ name: e.label, value: `Error`, confidence: 0, status: 'error' })),
      })));
      setCurrentPage('review');
      toast({ title: "Processing error", description: err.message || "Extraction failed", variant: "destructive" });
    });
  };

  const extractSingleDocument = async (fileIdx: number) => {
    const file = uploadedFiles[fileIdx];
    if (!file) return;
    const templateId = fileClassifications[String(file.id)];
    if (!templateId) return;
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    setDocStatuses(prev => ({ ...prev, [fileIdx]: 'processing' }));

    try {
      const response = await fetch("/api/process-documents-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: [{
            fileName: file.name,
            templateId,
            templateName: template.name,
            entitiesToExtract: template.entities || [],
            documentText: file.textContent || '',
          }],
        }),
      });

      if (!response.ok) throw new Error("Server error");
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: any = null;

      const parseBlock = (block: string) => {
        const normalized = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let eventType = "";
        let dataLines: string[] = [];
        for (const line of normalized.split("\n")) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (eventType && dataLines.length > 0) {
          try {
            const data = JSON.parse(dataLines.join("\n"));
            if (eventType === "doc-done" || eventType === "doc-error") {
              result = {
                fileName: data.fileName || file.name,
                templateId, templateName: template.name,
                entities: (data.entities || []).map((e: any) => ({
                  ...e,
                  name: e.name || e.entity || '',
                  confidence: e.confidence ?? e.conf ?? 0,
                })),
              };
            }
          } catch {}
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";
        blocks.filter(b => b.trim()).forEach(parseBlock);
      }
      if (buffer.trim()) buffer.split(/\r?\n\r?\n/).filter(b => b.trim()).forEach(parseBlock);

      if (result) {
        setExtractionResults(prev => {
          const newResults = [...prev];
          const existingIdx = newResults.findIndex(r => r.fileName === file.name);
          if (existingIdx >= 0) {
            newResults[existingIdx] = result;
          } else {
            newResults.push(result);
          }
          return newResults;
        });
      }
      setDocStatuses(prev => ({ ...prev, [fileIdx]: 'done' }));
      setCompletedCount(prev => prev + 1);
    } catch (err: any) {
      console.error("Single extraction error:", err);
      setDocStatuses(prev => ({ ...prev, [fileIdx]: 'error' }));
      toast({ title: "Extraction failed", description: err.message || "Could not extract entities", variant: "destructive" });
    }
  };

  const inlineEditEntity = (docIdx: number, entIdx: number, newValue: string) => {
    const r = structuredClone(extractionResults);
    const entity = r[docIdx]?.entities[entIdx];
    if (!entity) return;
    entity.value = newValue;
    entity.status = 'edited';
    setExtractionResults(r);
  };
  const approveEntity = (docIdx: number, entIdx: number) => {
    const r = structuredClone(extractionResults);
    r[docIdx].entities[entIdx].status = 'approved';
    setExtractionResults(r);
  };
  const rejectEntity = (docIdx: number, entIdx: number) => {
    const r = structuredClone(extractionResults);
    r[docIdx].entities[entIdx].status = 'rejected';
    setExtractionResults(r);
  };
  const approveAllForDoc = (docIdx: number) => {
    const r = structuredClone(extractionResults);
    let count = 0;
    r[docIdx].entities.forEach((e: any) => { if (e.status !== 'rejected' && e.status !== 'edited') { e.status = 'approved'; count++; } });
    setExtractionResults(r);
    if (count > 0) toast({ title: "All approved", description: `${count} entities approved` });
  };

  const exportResults = () => {
    const blob = new Blob([JSON.stringify(extractionResults, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `extraction-results-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Results saved as JSON" });
  };
  const exportCSV = () => {
    let csv = "Document,Template,Entity,Value,Confidence,Status\n";
    extractionResults.forEach(r => { r.entities.forEach((e: any) => {
      csv += `"${r.fileName}","${r.templateName}","${e.name}","${(e.value || '').replace(/"/g, '""')}",${e.confidence},"${e.status}"\n`;
    }); });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `extraction-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Results saved as CSV" });
  };

  const allClassified = uploadedFiles.length > 0 && uploadedFiles.every(f => fileClassifications[String(f.id)]);
  const allReady = uploadedFiles.length > 0 && uploadedFiles.every(f => f.status === 'ready');
  const totalEntities = extractionResults.reduce((a, r) => a + r.entities.length, 0);
  const approvedCount = extractionResults.reduce((a, r) => a + r.entities.filter((e: any) => e.status === 'approved').length, 0);

  const [hoveredEntity, setHoveredEntity] = useState<number | null>(null);
  const [openTemplateDropdown, setOpenTemplateDropdown] = useState<string | null>(null);

  const activeDocText = useMemo(() => {
    if (currentPage !== 'review' || !extractionResults[activeReviewDoc]) return '';
    const fileName = extractionResults[activeReviewDoc].fileName;
    const file = uploadedFiles.find(f => f.name === fileName);
    return file?.textContent || '';
  }, [currentPage, activeReviewDoc, extractionResults, uploadedFiles]);

  const activeDocFile = useMemo(() => {
    if (currentPage !== 'review' || !extractionResults[activeReviewDoc]) return null;
    const fileName = extractionResults[activeReviewDoc].fileName;
    return uploadedFiles.find(f => f.name === fileName) || null;
  }, [currentPage, activeReviewDoc, extractionResults, uploadedFiles]);

  const isPdfFile = useMemo(() => {
    if (!activeDocFile) return false;
    const name = activeDocFile.name.toLowerCase();
    return name.endsWith('.pdf') || activeDocFile.file.type === 'application/pdf';
  }, [activeDocFile]);

  const activeFileType = useMemo(() => {
    if (!activeDocFile) return 'text';
    const name = activeDocFile.name.toLowerCase();
    if (name.endsWith('.pdf') || activeDocFile.file.type === 'application/pdf') return 'pdf';
    if (name.endsWith('.xlsx') || name.endsWith('.xls') ||
        activeDocFile.file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        activeDocFile.file.type === 'application/vnd.ms-excel') return 'excel';
    if (name.endsWith('.csv') || activeDocFile.file.type === 'text/csv') return 'csv';
    return 'text';
  }, [activeDocFile]);

  const stepIdx = currentPage === 'company-info' ? 0 : currentPage === 'upload' ? 1 : currentPage === 'classify' ? 2 : (currentPage === 'extract' || currentPage === 'processing') ? 3 : 4;

  return (
    <div className="bg-black text-white font-sans h-screen overflow-hidden flex flex-col" style={{ letterSpacing: '-0.011em' }}>


      <header className="h-14 shrink-0 z-20 sticky top-0 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="max-w-[1400px] mx-auto w-full px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 text-[#98989f] hover:text-white smooth group shrink-0">
              <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 smooth" />
              <span className="text-[13px] font-medium tracking-wide">Back to Dashboard</span>
            </Link>
            <div className="w-px h-5 bg-[#2c2c2e] hidden sm:block"></div>
            <div className="flex items-center gap-3 press-sm">
              <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
              <span className="text-lg font-semibold tracking-tight text-white border-l border-[#2c2c2e] pl-3">Document Processor</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/builder" className="text-[13px] font-medium text-[#8e8e93] hover:text-white smooth px-3 py-1.5 rounded-lg hover:bg-[#1c1c1e] press-sm" data-testid="link-builder-nav">
              <ArrowLeft className="w-3.5 h-3.5 mr-1 inline-block" /> Builder
            </Link>
            <div className="w-px h-4 bg-[#2c2c2e] mx-1"></div>
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c1c1e] text-[12px]" data-testid="user-menu">
              <span className="inline-flex h-5 w-5 rounded-full bg-purple-600 items-center justify-center text-white font-semibold text-[9px]">
                {(user?.fullName || user?.username || 'U').charAt(0).toUpperCase()}
              </span>
              <span className="text-[#d1d1d6] font-medium">{user?.fullName || user?.username || ''}</span>
            </div>
            <button
              onClick={async () => { await logout(); navigate('/auth'); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-[#3a3a3c] text-[12px] smooth press-sm text-[#8e8e93] hover:text-[#d1d1d6]"
              data-testid="button-sign-out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="bg-black px-6 py-3" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="max-w-[1400px] mx-auto w-full flex items-center justify-between">
          {['Company', 'Upload', 'Template', 'Extract', 'Review', 'Scorecard'].map((label, idx) => {
            const StepIcons = [Building2, CloudUpload, Puzzle, Cpu, SearchCheck, FileText];
            const pageMap = ['company-info', 'upload', 'classify', 'extract', 'review', 'scorecard'] as const;
            type PageMapType = typeof pageMap[number];
            const safeCurrentPage = currentPage as PageMapType;
            const stepIdx = pageMap.indexOf(safeCurrentPage);
            const isComplete = idx < stepIdx;
            const isCurrent = idx === stepIdx;
            const canNavigate = isComplete && safeCurrentPage !== 'company-info';
            const StepIcon = StepIcons[idx];
            return (
              <React.Fragment key={label}>
                <div className={`flex items-center gap-2.5 ${canNavigate ? 'cursor-pointer group' : ''}`}
                  onClick={() => { if (canNavigate) setCurrentPage(pageMap[idx] as PageMapType); }}>
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs smooth ${isComplete ? 'border-green-500 bg-green-500 text-white group-hover:bg-green-400' : isCurrent ? 'border-purple-600 bg-purple-600 text-white' : 'border-transparent text-[#636366]'}`}>
                    {isComplete ? <Check className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`text-[13px] font-medium hidden sm:inline smooth ${isComplete ? 'text-green-400 group-hover:text-green-300' : isCurrent ? 'text-purple-400' : 'text-[#636366]'}`}>{label}</span>
                </div>
                {idx < 5 && (
                  <div className="flex-1 h-0.5 bg-[#1c1c1e] mx-4 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 transition-all duration-700 rounded-full" style={{ width: isComplete ? '100%' : '0%' }}></div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className={`${currentPage === 'review' ? '' : 'max-w-[1400px] mx-auto w-full'} p-6`}>

          {currentPage === 'company-info' && (
            <div>
              {isLoadingSession ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                  <p className="text-[#8e8e93] text-sm">Loading session...</p>
                </div>
              ) : (
                <>
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center mx-auto mb-4">
                      <Building2 className="w-7 h-7" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">New Client Assessment</h2>
                    <p className="text-[#8e8e93] text-sm">Enter the client company's details before uploading documents</p>
                  </div>

                  <div className="mb-6">
                    <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest mb-3">Company Logo</p>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-20 h-20 rounded-2xl bg-[#1c1c1e] border-2 border-dashed border-[#3a3a3c] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-purple-500/50 transition-colors"
                        onClick={() => (document.getElementById('logo-input') as HTMLInputElement)?.click()}
                        data-testid="logo-upload-zone"
                      >
                        {companyInfo.logo ? (
                          <img src={companyInfo.logo} alt="Company logo" className="w-full h-full object-contain" />
                        ) : (
                          <Building2 className="w-7 h-7 text-[#3a3a3c]" />
                        )}
                      </div>
                      <div>
                        <input
                          id="logo-input"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          data-testid="input-logo"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 2 * 1024 * 1024) {
                              toast({ title: 'File too large', description: 'Logo must be under 2 MB.', variant: 'destructive' });
                              e.target.value = '';
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setCompanyInfo(p => ({ ...p, logo: ev.target?.result as string }));
                            };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => (document.getElementById('logo-input') as HTMLInputElement)?.click()}
                          className="px-4 py-2 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[#d1d1d6] text-[12px] font-medium smooth press-sm border border-[#3a3a3c]"
                          data-testid="button-upload-logo"
                        >
                          {companyInfo.logo ? 'Change Logo' : 'Upload Logo'}
                        </button>
                        {companyInfo.logo && (
                          <button
                            type="button"
                            onClick={() => setCompanyInfo(p => ({ ...p, logo: '' }))}
                            className="ml-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[12px] font-medium smooth press-sm"
                            data-testid="button-remove-logo"
                          >
                            Remove
                          </button>
                        )}
                        <p className="text-[11px] text-[#636366] mt-2">PNG, JPG or SVG · max 2 MB</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest">Company Details</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Company Name <span className="text-red-400">*</span></label>
                      <input type="text" value={companyInfo.name} onChange={(e) => setCompanyInfo(p => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Acme Holdings (Pty) Ltd"
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white placeholder-[#636366] focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all"
                        data-testid="input-company-name" autoFocus />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Registration Number</label>
                      <input type="text" value={companyInfo.registrationNumber} onChange={(e) => setCompanyInfo(p => ({ ...p, registrationNumber: e.target.value }))}
                        placeholder="e.g. 2021/123456/07"
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white placeholder-[#636366] focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all"
                        data-testid="input-company-regno" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Industry Sector <span className="text-red-400">*</span></label>
                      <select value={companyInfo.sector} onChange={(e) => setCompanyInfo(p => ({ ...p, sector: e.target.value }))}
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all appearance-none"
                        data-testid="select-company-sector">
                        <option value="">Select a sector...</option>
                        {BBEE_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Annual Turnover (ZAR)</label>
                      <input type="text" value={companyInfo.annualTurnover} onChange={(e) => setCompanyInfo(p => ({ ...p, annualTurnover: e.target.value }))}
                        placeholder="e.g. R 50,000,000"
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white placeholder-[#636366] focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all"
                        data-testid="input-annual-turnover" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Number of Employees</label>
                      <input type="text" value={companyInfo.employees} onChange={(e) => setCompanyInfo(p => ({ ...p, employees: e.target.value }))}
                        placeholder="e.g. 150"
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white placeholder-[#636366] focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all"
                        data-testid="input-employees" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Financial Year End</label>
                      <select value={companyInfo.financialYearEnd} onChange={(e) => setCompanyInfo(p => ({ ...p, financialYearEnd: e.target.value }))}
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all appearance-none"
                        data-testid="select-fye">
                        <option value="">Select month...</option>
                        {FYE_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Current B-BBEE Level</label>
                      <select value={companyInfo.currentBBEELevel} onChange={(e) => setCompanyInfo(p => ({ ...p, currentBBEELevel: e.target.value }))}
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all appearance-none"
                        data-testid="select-bbee-level">
                        <option value="">Select level...</option>
                        {BBEE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Physical Address</label>
                      <input type="text" value={companyInfo.address} onChange={(e) => setCompanyInfo(p => ({ ...p, address: e.target.value }))}
                        placeholder="e.g. 10 Mandela Square, Sandton, 2196"
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white placeholder-[#636366] focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all"
                        data-testid="input-address" />
                    </div>
                  </div>

                  <div className="mb-3 mt-6">
                    <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest">Contact Person</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Full Name</label>
                      <input type="text" value={companyInfo.contactName} onChange={(e) => setCompanyInfo(p => ({ ...p, contactName: e.target.value }))}
                        placeholder="e.g. Jane Dlamini"
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white placeholder-[#636366] focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all"
                        data-testid="input-contact-name" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Email Address</label>
                      <input type="email" value={companyInfo.contactEmail} onChange={(e) => setCompanyInfo(p => ({ ...p, contactEmail: e.target.value }))}
                        placeholder="e.g. jane@company.co.za"
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white placeholder-[#636366] focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all"
                        data-testid="input-contact-email" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#b0b0b8] uppercase tracking-wider mb-2">Phone Number</label>
                      <input type="tel" value={companyInfo.contactPhone} onChange={(e) => setCompanyInfo(p => ({ ...p, contactPhone: e.target.value }))}
                        placeholder="e.g. +27 82 123 4567"
                        className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white placeholder-[#636366] focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all"
                        data-testid="input-contact-phone" />
                    </div>
                  </div>

                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest">Additional Notes</p>
                  </div>
                  <div className="mb-8">
                    <textarea value={companyInfo.notes} onChange={(e) => setCompanyInfo(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Any additional context about this client or assessment..."
                      rows={3}
                      className="w-full bg-[#1c1c1e] border border-transparent rounded-xl px-4 py-3 text-sm text-white placeholder-[#636366] focus:border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-500/15 transition-all resize-none"
                      data-testid="input-notes" />
                  </div>

                  <button
                    onClick={async () => {
                      if (!companyInfo.name.trim() || !companyInfo.sector) {
                        toast({ title: "Missing information", description: "Please provide a company name and sector.", variant: "destructive" });
                        return;
                      }
                      setIsSavingSession(true);
                      const sid = sessionId || generateSessionId();
                      if (!sessionId) {
                        setSessionId(sid);
                        sessionCreatedAt.current = new Date().toISOString();
                      }
                      await apiSaveSession({
                        id: sid, companyInfo,
                        createdAt: sessionCreatedAt.current,
                        updatedAt: new Date().toISOString(),
                        currentStep: 'upload',
                        filesData: [], fileClassifications: {},
                        extractionResults: [], docStatuses: {}, isComplete: false,
                      });
                      setIsSavingSession(false);
                      setCurrentPage('upload');
                    }}
                    disabled={!companyInfo.name.trim() || !companyInfo.sector || isSavingSession}
                    className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#1c1c1e] disabled:text-[#636366] text-white rounded-2xl font-semibold text-[13px] smooth press"
                    data-testid="button-next-upload"
                  >
                    {isSavingSession
                      ? <><Loader2 className="w-3.5 h-3.5 mr-2 inline-block animate-spin" />Saving...</>
                      : <>Continue to Upload <ChevronRight className="w-3 h-3 ml-1.5 inline-block" /></>}
                  </button>
                </>
              )}
            </div>
          )}

          {currentPage === 'upload' && (
            <div>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-1">Upload Documents</h2>
                <p className="text-[#8e8e93] text-sm">Drag and drop files or click to browse</p>
              </div>

              {templates.length === 0 && !loadingTemplates && (
                <div className="bg-amber-500/10 rounded-xl p-4 mb-6 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-400">No templates in repository</p>
                    <p className="text-xs text-amber-500/70 mt-1">Publish a template from the Entity Builder first. <Link href="/builder" className="underline font-medium text-amber-400">Go to Builder</Link></p>
                  </div>
                </div>
              )}

              <div
                className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer mb-6 ${isDragActive ? 'border-purple-500 bg-purple-500/10' : uploadedFiles.length > 0 ? 'border-[#2c2c2e] bg-[#1c1c1e] p-6' : 'border-[#2c2c2e] bg-[#1c1c1e] hover:border-[#3a3a3c]'}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragActive(false); }}
                onDrop={(e) => { e.preventDefault(); setIsDragActive(false); if (e.dataTransfer.files?.length) handleFiles(Array.from(e.dataTransfer.files)); }}
                onClick={() => document.getElementById('fileInput')?.click()} data-testid="drop-zone"
              >
                <input type="file" id="fileInput" multiple className="hidden" accept=".pdf,.txt,.csv,.doc,.docx,.xlsx,.xls,.eml,.json"
                  onChange={(e) => { if (e.target.files?.length) handleFiles(Array.from(e.target.files)); }} />
                {uploadedFiles.length === 0 ? (
                  <>
                    <div className={`w-16 h-16 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center mx-auto mb-4 transition-transform ${isDragActive ? 'scale-110' : ''}`}>
                      <CloudUpload className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">Drop files here</h3>
                    <p className="text-[#8e8e93] text-sm mb-3">or click to browse</p>
                    <div className="flex items-center justify-center gap-2 text-xs text-[#636366]">
                      {['PDF', 'XLSX', 'XLS', 'CSV', 'DOCX', 'TXT'].map(ext => (
                        <span key={ext} className="px-2 py-0.5 bg-[#2c2c2e] rounded-lg text-[#8e8e93]">{ext}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-purple-400">
                    <PlusCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Add more files</span>
                  </div>
                )}
              </div>

              {uploadedFiles.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white text-sm">
                      {uploadedFiles.length} document{uploadedFiles.length !== 1 ? 's' : ''}
                      {!allReady && <span className="text-purple-400 ml-2 font-normal text-xs inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Loading...</span>}
                    </h3>
                    <button onClick={() => { setUploadedFiles([]); setFileClassifications({}); }} className="text-xs text-red-400 hover:text-red-300 smooth press-sm" data-testid="button-clear-all">
                      <Trash2 className="w-3 h-3 mr-1 inline-block" />Clear all
                    </button>
                  </div>
                  <div className="space-y-2 mb-6">
                    {uploadedFiles.map((file) => (
                      <div key={file.id} className={`bg-[#1c1c1e] rounded-2xl px-4 py-3 flex items-center gap-3 transition-all ${file.status === 'uploading' ? 'opacity-70' : ''}`} data-testid={`file-row-${file.id}`}>
                        <div className="shrink-0">
                          <FileFormatBadge type={file.type} size="sm" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{file.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-[#8e8e93]">{file.size} KB</span>
                            {file.status === 'uploading' && (
                              <div className="flex-1 h-1 bg-[#2c2c2e] rounded-full overflow-hidden max-w-[100px]">
                                <div className="h-full bg-purple-600 transition-all rounded-full" style={{ width: `${file.uploadProgress}%` }}></div>
                              </div>
                            )}
                            {file.status === 'ready' && <span className="text-xs text-green-400 inline-flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />Ready</span>}
                          </div>
                        </div>
                        <button onClick={() => removeFile(file.id)} className="p-2 text-[#636366] hover:text-red-400 rounded-[10px] hover:bg-red-500/10 smooth press-sm" data-testid={`button-remove-${file.id}`}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setCurrentPage('company-info')}
                      className="px-5 py-3.5 bg-[#1c1c1e] text-[#d1d1d6] hover:text-white rounded-2xl text-[13px] font-medium smooth press-sm" data-testid="button-back-company-info">
                      <ChevronLeft className="w-3 h-3 mr-1.5 inline-block" /> Back
                    </button>
                    <button onClick={async () => { if (allReady && !isSavingSession) { setIsSavingSession(true); await persistSession('classify'); setIsSavingSession(false); setCurrentPage('classify'); } }} disabled={!allReady || isSavingSession}
                      className="flex-1 py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#1c1c1e] disabled:text-[#636366] text-white rounded-2xl font-semibold text-[13px] smooth press" data-testid="button-next-classify">
                      {isSavingSession ? <><Loader2 className="w-3.5 h-3.5 mr-2 inline-block animate-spin" />Saving...</> : <>Continue <ChevronRight className="w-3 h-3 ml-1.5 inline-block" /></>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {currentPage === 'classify' && (
            <div>
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Assign Templates</h2>
                <p className="text-[#8e8e93] text-sm">Choose which template to use for each document</p>
              </div>
              <div className="space-y-3 mb-8">
                {uploadedFiles.map((file) => {
                  const selectedId = fileClassifications[String(file.id)];
                  const selectedTemplate = templates.find(t => t.id === selectedId);
                  return (
                    (() => {
                      const docType = fileDocTypes[String(file.id)] || 'digital';
                      const isScanned = docType === 'scanned';
                      const isDropdownOpen = openTemplateDropdown === String(file.id);
                      return (
                        <div
                          key={file.id}
                          className={`rounded-2xl transition-all ${selectedTemplate ? 'ring-1 ring-purple-500/25' : 'ring-1 ring-[#2c2c2e]'}`}
                          style={{ background: '#1c1c1e', position: 'relative', zIndex: isDropdownOpen ? 50 : 1 }}
                          data-testid={`classify-row-${file.id}`}
                        >
                          {/* Main row: icon + name + controls */}
                          <div className="flex items-start gap-4 p-4">
                            {/* File format badge */}
                            <div className="shrink-0 pt-0.5">
                              <FileFormatBadge type={file.type} size="md" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 space-y-3">
                              {/* File name + size */}
                              <div>
                                <div className="text-[14px] font-semibold text-white truncate leading-tight">{file.name}</div>
                                <div className="text-[11px] text-[#636366] mt-0.5">{file.size} KB</div>
                              </div>

                              {/* Template picker */}
                              <div className="relative" data-testid={`select-template-${file.id}`}>
                                <button
                                  type="button"
                                  onClick={() => setOpenTemplateDropdown(prev => prev === String(file.id) ? null : String(file.id))}
                                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all ${
                                    selectedTemplate
                                      ? 'bg-purple-500/10 border border-purple-500/30 text-white'
                                      : 'bg-[#141414] border border-[#3a3a3c] text-[#8e8e93] hover:border-[#48484a] hover:text-white'
                                  }`}
                                >
                                  <Puzzle className={`w-3.5 h-3.5 shrink-0 ${selectedTemplate ? 'text-purple-400' : 'text-[#48484a]'}`} />
                                  <span className="flex-1 truncate">
                                    {selectedTemplate ? selectedTemplate.name : 'Choose a template…'}
                                  </span>
                                  {selectedTemplate
                                    ? <span className="text-[10px] text-purple-400/60 shrink-0 font-normal">{selectedTemplate.entities.length} fields</span>
                                    : null}
                                  <svg className={`w-4 h-4 shrink-0 text-[#48484a] transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none">
                                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>

                                {isDropdownOpen && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setOpenTemplateDropdown(null)} />
                                    <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden" style={{ background: '#2c2c2e', border: '1px solid #3a3a3c' }}>
                                      <div className="px-3 pt-3 pb-1.5">
                                        <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest">Select Template</p>
                                      </div>
                                      <div className="max-h-56 overflow-y-auto pb-1.5">
                                        {loadingTemplates ? (
                                          <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-[#8e8e93]">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                                          </div>
                                        ) : templates.length === 0 ? (
                                          <div className="px-4 py-3 text-[13px] text-[#636366]">No templates — create one in Builder first.</div>
                                        ) : (
                                          templates.map((t) => {
                                            const isSel = selectedId === t.id;
                                            return (
                                              <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => {
                                                  setFileClassifications(prev => ({ ...prev, [String(file.id)]: t.id }));
                                                  setOpenTemplateDropdown(null);
                                                }}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 mx-1.5 rounded-xl text-left transition-colors mb-0.5 ${
                                                  isSel ? 'bg-purple-500/20' : 'hover:bg-[#3a3a3c]'
                                                }`}
                                                style={{ width: 'calc(100% - 12px)' }}
                                              >
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isSel ? 'bg-purple-500/30' : 'bg-[#1c1c1e]'}`}>
                                                  <Puzzle className={`w-3.5 h-3.5 ${isSel ? 'text-purple-300' : 'text-[#636366]'}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <div className={`text-[13px] font-semibold truncate ${isSel ? 'text-purple-200' : 'text-white'}`}>{t.name}</div>
                                                  <div className="text-[11px] text-[#636366]">{t.entities.length} field{t.entities.length !== 1 ? 's' : ''} · v{t.version}</div>
                                                </div>
                                                {isSel && (
                                                  <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
                                                    <Check className="w-3 h-3 text-white" />
                                                  </div>
                                                )}
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Document type segmented pill */}
                              <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#141414', border: '1px solid #2c2c2e' }} data-testid={`select-doctype-${file.id}`}>
                                <button
                                  type="button"
                                  onClick={() => setFileDocTypes(prev => ({ ...prev, [String(file.id)]: 'digital' }))}
                                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-semibold transition-all ${
                                    !isScanned ? 'bg-[#1c4ed8]/25 text-blue-300' : 'text-[#636366] hover:text-[#8e8e93]'
                                  }`}
                                >
                                  <Monitor className="w-3.5 h-3.5" />
                                  Digital
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFileDocTypes(prev => ({ ...prev, [String(file.id)]: 'scanned' }))}
                                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-semibold transition-all ${
                                    isScanned ? 'bg-amber-500/20 text-amber-300' : 'text-[#636366] hover:text-[#8e8e93]'
                                  }`}
                                >
                                  <ScanLine className="w-3.5 h-3.5" />
                                  Scanned
                                </button>
                              </div>

                              {/* Entity chips */}
                              {selectedTemplate && selectedTemplate.entities.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {selectedTemplate.entities.slice(0, 6).map((ent, i) => (
                                    <span key={i} className="text-[10px] px-2 py-1 rounded-lg font-medium" style={{ background: '#2c2c2e', color: '#8e8e93' }}>{ent.label}</span>
                                  ))}
                                  {selectedTemplate.entities.length > 6 && (
                                    <span className="text-[10px] px-2 py-1 rounded-lg font-medium" style={{ background: '#2c2c2e', color: '#636366' }}>+{selectedTemplate.entities.length - 6} more</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Remove button */}
                            <button
                              onClick={() => removeFile(file.id)}
                              className="shrink-0 p-2 rounded-xl text-[#48484a] hover:text-red-400 hover:bg-red-500/10 transition-all mt-0.5"
                              data-testid={`button-remove-${file.id}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  );
                })}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCurrentPage('upload')} className="px-5 py-3.5 bg-[#1c1c1e] text-[#d1d1d6] hover:text-white rounded-2xl text-[13px] font-medium smooth press-sm" data-testid="button-back-upload">
                  <ChevronLeft className="w-3 h-3 mr-1.5 inline-block" /> Back
                </button>
                <button onClick={async () => { if (allClassified && !isSavingSession) { setIsSavingSession(true); await persistSession('extract'); setIsSavingSession(false); setCurrentPage('extract'); } }} disabled={!allClassified || isSavingSession}
                  className="flex-1 py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#1c1c1e] disabled:text-[#636366] text-white rounded-2xl font-semibold text-[13px] smooth press" data-testid="button-next-extract">
                  {isSavingSession ? <><Loader2 className="w-3.5 h-3.5 mr-2 inline-block animate-spin" />Saving...</> : <>Continue <ChevronRight className="w-3 h-3 ml-1.5 inline-block" /></>}
                </button>
              </div>
            </div>
          )}

          {currentPage === 'extract' && (() => {
            const entityMap = new Map<string, { label: string; definition: string; files: string[] }>();
            uploadedFiles.forEach(file => {
              const tid = fileClassifications[String(file.id)];
              const t = templates.find(tp => tp.id === tid);
              if (t) t.entities.forEach(ent => {
                const existing = entityMap.get(ent.label);
                if (existing) { existing.files.push(file.name); }
                else { entityMap.set(ent.label, { label: ent.label, definition: ent.definition, files: [file.name] }); }
              });
            });
            const allEntities = Array.from(entityMap.values());
            const anyProcessing = Object.values(docStatuses).some(s => s === 'processing');
            const anyDone = Object.values(docStatuses).some(s => s === 'done');
            const allDone = uploadedFiles.length > 0 && uploadedFiles.every((_, i) => docStatuses[i] === 'done');
            return (
              <div>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {anyProcessing ? 'Extracting...' : allDone ? 'Extraction Complete' : 'Ready to Extract'}
                  </h2>
                  <p className="text-[#8e8e93] text-sm">
                    {anyProcessing ? `Processing ${Object.values(docStatuses).filter(s => s === 'processing').length} of ${uploadedFiles.length} documents` :
                     allDone ? 'All entities have been extracted from your documents' :
                     `${allEntities.length} entities will be extracted from ${uploadedFiles.length} document${uploadedFiles.length !== 1 ? 's' : ''}`}
                  </p>
                </div>

                {!anyProcessing && !allDone && (
                  <div className="bg-[#1c1c1e] rounded-2xl p-5 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <ListChecks className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-semibold text-white">Entities to Extract</span>
                      <span className="text-xs text-[#636366] ml-auto">{allEntities.length} total</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {allEntities.map((ent, i) => {
                        const color = entityColors[i % entityColors.length];
                        return (
                          <div key={ent.label} className="flex items-start gap-3 p-3 rounded-xl bg-[#2c2c2e]">
                            <div className="w-1.5 h-full min-h-[36px] rounded-full shrink-0 mt-0.5" style={{ backgroundColor: color.underline }}></div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-white">{ent.label}</span>
                              {ent.definition && <p className="text-[11px] text-[#8e8e93] mt-0.5 line-clamp-1">{ent.definition}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2 mb-8">
                  {uploadedFiles.map((file, idx) => {
                    const status = docStatuses[idx] || 'waiting';
                    const tid = fileClassifications[String(file.id)];
                    const tmpl = templates.find(t => t.id === tid);
                    return (
                      <div key={file.id} className={`bg-[#1c1c1e] rounded-2xl px-4 py-3 flex items-center gap-3 transition-all ${status === 'done' ? 'ring-1 ring-green-500/20' : status === 'error' ? 'ring-1 ring-red-500/20' : status === 'processing' ? 'ring-1 ring-purple-500/20' : ''}`} data-testid={`extract-row-${idx}`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${status === 'done' ? 'bg-green-500/15' : status === 'processing' ? 'bg-purple-500/15' : status === 'error' ? 'bg-red-500/15' : 'bg-[#2c2c2e]'}`}>
                          {status === 'waiting' && <Circle className="w-2 h-2 text-[#636366]" />}
                          {status === 'processing' && <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />}
                          {status === 'done' && <Check className="w-4 h-4 text-green-400" />}
                          {status === 'error' && <X className="w-4 h-4 text-red-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{file.name}</div>
                          <div className="text-xs text-[#636366] mt-0.5">
                            {status === 'processing' ? 'Extracting entities...' : status === 'done' ? 'Complete' : status === 'error' ? 'Failed' : tmpl ? tmpl.name : ''}
                          </div>
                        </div>
                        {status === 'processing' && (
                          <div className="flex gap-1">
                            {[0, 1, 2].map(i => (
                              <div key={i} className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.15}s` }}></div>
                            ))}
                          </div>
                        )}
                        {status === 'done' && (
                          <span className="text-xs text-green-400 font-medium inline-flex items-center gap-1"><Check className="w-2.5 h-2.5" />Done</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {anyProcessing && (
                  <div className="max-w-md mx-auto mb-8">
                    <div className="h-1.5 bg-[#2c2c2e] rounded-full overflow-hidden">
                      <div className="h-full bg-purple-600 transition-all duration-500 rounded-full" style={{ width: `${uploadedFiles.length > 0 ? (Object.values(docStatuses).filter(s => s === 'done').length / uploadedFiles.length) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => { if (!anyProcessing) setCurrentPage('classify'); }} disabled={anyProcessing}
                    className="px-5 py-3.5 bg-[#1c1c1e] text-[#d1d1d6] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl text-[13px] font-medium smooth press-sm" data-testid="button-back-classify">
                    <ChevronLeft className="w-3 h-3 mr-1.5 inline-block" /> Back
                  </button>
                  {!allDone && (
                    <button onClick={startProcessing} disabled={anyProcessing}
                      className="flex-1 py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#1c1c1e] disabled:text-[#636366] text-white rounded-2xl font-semibold text-[13px] smooth press" data-testid="button-start-extract">
                      {anyProcessing ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 inline-block animate-spin" />Extracting...</>
                      ) : (
                        <><Zap className="w-3.5 h-3.5 mr-1.5 inline-block" />Extract All</>
                      )}
                    </button>
                  )}
                  {allDone && (
                    <button onClick={() => {
                      const results = uploadedFiles.map((file, i) => {
                        const templateId = fileClassifications[String(file.id)];
                        const template = templates.find(t => t.id === templateId);
                        return extractionResults[i] || {
                          fileName: file.name, templateId, templateName: template?.name || "Unknown", entities: [],
                        };
                      }).filter(r => r.entities.length > 0);
                      if (results.length > 0) {
                        setExtractionResults(results);
                        setCurrentPage('review');
                      }
                    }}
                    className="flex-1 py-3.5 bg-green-600 hover:bg-green-500 text-white rounded-2xl font-semibold text-[13px] smooth press" data-testid="button-go-review">
                      Review Results <ChevronRight className="w-3 h-3 ml-1.5 inline-block" />
                    </button>
                  )}
                </div>
              </div>
            );
          })()}


          {currentPage === 'review' && extractionResults.length > 0 && (() => {
            const isLastDoc = activeReviewDoc === extractionResults.length - 1;
            const handleNext = async () => {
              setIsSavingSession(true);
              await persistSession('review', { results: extractionResults, complete: false });
              setIsSavingSession(false);
              setActiveReviewDoc(prev => prev + 1);
              setHoveredEntity(null);
              setReviewFilter('all');
            };
            const handleSubmit = async () => {
              setIsSavingSession(true);
              
              // 1. Gather all document texts
              const documentTexts = uploadedFiles
                .filter(file => file.textContent)
                .map(file => file.textContent);

              // 2. Base fallback if info missing
              const sectorCode = 'RCOGP'; // Defaulting to generic for now until sector logic upgraded
              const scorecardType = parseFloat(companyInfo.annualTurnover.replace(/[^\d]/g, '')) <= 50000000 ? 'QSE' : 'Generic';

              try {
                // 3. Make the API Call to extract-and-score
                const res = await fetch('/api/extract-and-score', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    documentTexts,
                    sectorCode,
                    scorecardType,
                    clientName: companyInfo.name
                  }),
                });

                if (!res.ok) throw new Error('Scoring failed');
                
                const scoreData = await res.json();
                
                // 4. Update the session with the new scorecardResult
                await persistSession('scorecard', { 
                  results: extractionResults, 
                  complete: true,
                  scorecardResult: scoreData
                });
                
                setIsSubmitted(true);
                setCurrentPage('scorecard');
                toast({ title: "Assessment complete", description: "Scorecard generated successfully!" });

              } catch (err: any) {
                console.error("Scorecard generation error", err);
                toast({ title: "Generation Failed", description: "Could not generate scorecard. Review extraction results.", variant: "destructive" });
                // Fallback to basic complete if scoring fails
                await persistSession('review', { results: extractionResults, complete: true });
                setIsSubmitted(true);
              } finally {
                setIsSavingSession(false);
              }
            };
            return (
            <div className="flex flex-col h-full -m-6">
              <div className="px-6 py-4 flex items-center justify-between bg-black shrink-0" style={{ borderBottom: '1px solid #2c2c2e' }}>
                <div className="flex items-center gap-4">
                  <button onClick={() => {
                    if (activeReviewDoc > 0) { setActiveReviewDoc(prev => prev - 1); setHoveredEntity(null); setReviewFilter('all'); }
                    else setCurrentPage('extract');
                  }} className="p-2 -ml-2 text-[#8e8e93] hover:text-white hover:bg-[#1c1c1e] rounded-[10px] smooth press-sm" data-testid="button-back-extract">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <div>
                    <h2 className="text-[15px] font-semibold text-white leading-tight">Review Results</h2>
                    <p className="text-[11px] text-[#636366] truncate max-w-[240px]">{extractionResults[activeReviewDoc]?.fileName}</p>
                  </div>
                  {extractionResults.length > 1 && (
                    <span className="px-2.5 py-1 bg-[#1c1c1e] text-[#8e8e93] rounded-lg text-[11px] font-medium">
                      {activeReviewDoc + 1} / {extractionResults.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isLastDoc ? (
                    <button onClick={handleSubmit} disabled={isSubmitted || isSavingSession}
                      className={`px-4 py-2 rounded-[10px] font-semibold text-[13px] smooth press-sm flex items-center gap-1.5 ${isSubmitted ? 'bg-green-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                      data-testid="button-submit">
                      {isSavingSession ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving...</>
                        : isSubmitted ? <><Check className="w-3.5 h-3.5" />Complete</>
                        : 'Submit & Complete'}
                    </button>
                  ) : (
                    <button onClick={handleNext} disabled={isSavingSession}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-[10px] font-semibold text-[13px] smooth press-sm flex items-center gap-1.5 disabled:opacity-60"
                      data-testid="button-next-doc">
                      {isSavingSession ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving...</>
                        : <>Next Document <ChevronRight className="w-3.5 h-3.5" /></>}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="w-1/2 overflow-y-auto bg-[#f5f5f5]" style={{ borderRight: '1px solid #2c2c2e' }}>
                  <div className="px-5 py-4 sticky top-0 bg-[#f5f5f5] z-10" style={{ borderBottom: '1px solid #d1d5db' }}>
                    <div className="flex items-center gap-2">
                      {activeFileType === 'pdf' ? <FileText className="w-4 h-4 text-red-400" /> :
                       activeFileType === 'excel' ? <FileSpreadsheet className="w-4 h-4 text-green-500" /> :
                       activeFileType === 'csv' ? <FileSpreadsheet className="w-4 h-4 text-green-400" /> :
                       <FileText className="w-4 h-4 text-gray-400" />}
                      <span className="text-sm font-medium text-gray-700">
                        {activeFileType === 'pdf' ? 'PDF Viewer' :
                         activeFileType === 'excel' ? 'Spreadsheet Viewer' :
                         activeFileType === 'csv' ? 'CSV Viewer' : 'Document'}
                      </span>
                      {activeFileType === 'text' && <span className="text-xs text-gray-400 ml-auto">{activeDocText.length.toLocaleString()} chars</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {extractionResults[activeReviewDoc]?.entities
                        .filter((e: any) => e.value && e.status !== 'not_found' && e.status !== 'rejected')
                        .map((e: any, i: number) => {
                          const fmtLabel = (s: string) => s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z\d])([A-Z])/g, '$1 $2');
                          return (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-md border bg-gray-100 border-gray-300 text-gray-600">
                              {fmtLabel(e.name)}
                            </span>
                          );
                        })}
                    </div>
                  </div>
                  <div className={activeFileType === 'pdf' && activeDocFile?.file?.size ? "px-2 py-2" : activeFileType === 'csv' || activeFileType === 'excel' ? "" : "p-5"}>
                    {activeFileType === 'pdf' && activeDocFile?.file?.size ? (
                      <PDFDocumentViewer
                        file={activeDocFile.file}
                        entities={[]}
                        hoveredEntity={null}
                        onHoverEntity={() => {}}
                      />
                    ) : (activeFileType === 'csv' || activeFileType === 'excel') && activeDocText ? (
                      <CSVTableViewer text={activeDocText} isExcel={activeFileType === 'excel'} />
                    ) : activeDocText ? (
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 min-h-[400px]">
                        <p className="text-[15px] text-gray-900 whitespace-pre-wrap font-sans leading-[1.8] break-words" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{activeDocText}</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center py-16 text-center">
                        <FileQuestion className="w-8 h-8 text-gray-300 mb-3" />
                        <p className="text-gray-400 text-sm">Document content not available</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-1/2 overflow-y-auto bg-black">
                  <div className="px-5 py-4 sticky top-0 bg-black z-10" style={{ borderBottom: '1px solid #2c2c2e' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ListChecks className="w-4 h-4 text-[#636366]" />
                        <span className="text-sm font-medium text-[#d1d1d6]">Extracted Entities</span>
                        <span className="text-[11px] text-[#636366] bg-[#1c1c1e] px-2 py-0.5 rounded-md">
                          {extractionResults[activeReviewDoc]?.entities?.length ?? 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(['all', 'edited'] as const).map(f => (
                          <button key={f} onClick={() => setReviewFilter(f)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium smooth press-sm capitalize ${reviewFilter === f ? 'bg-[#1c1c1e] text-white' : 'text-[#8e8e93] hover:text-white'}`}>
                            {f}
                          </button>
                        ))}
                        <button onClick={() => approveAllForDoc(activeReviewDoc)}
                          className="px-2.5 py-1 bg-[#1c1c1e] text-[#8e8e93] hover:text-white border border-[#2c2c2e] rounded-lg text-[11px] font-medium hover:border-[#636366] smooth press-sm ml-1" data-testid="button-approve-all">
                          <CheckCheck className="w-3 h-3 mr-1 inline-block" />Approve All
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    {(() => {
                      const entities = extractionResults[activeReviewDoc]?.entities || [];
                      const templateForResult = templates?.find((t: any) => t.id === extractionResults[activeReviewDoc]?.templateId);
                      const getEntityDef = (name: string) => templateForResult?.entities?.find((e: any) => e.label === name)?.definition || '';
                      const fmtLabel = (s: string) => s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z\d])([A-Z])/g, '$1 $2');
                      const filtered = entities.filter((e: any) => {
                        if (reviewFilter === 'edited') return e.status === 'edited';
                        return true;
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-[#1c1c1e] flex items-center justify-center mb-4">
                              <FileQuestion className="w-5 h-5 text-[#636366]" />
                            </div>
                            <p className="text-[#d1d1d6] text-sm font-medium mb-1">
                              {reviewFilter === 'all' ? 'No entities found' : 'No edited entities'}
                            </p>
                            <p className="text-[#636366] text-xs">
                              {reviewFilter === 'all' ? 'The template entities were not detected in this document' : 'Switch to "All" to see everything'}
                            </p>
                          </div>
                        );
                      }

                      return filtered.map((entity: any) => {
                        const realIdx = entities.indexOf(entity);
                        const isHovered = hoveredEntity === realIdx;
                        const def = getEntityDef(entity.name);
                        const isApproved = entity.status === 'approved';
                        const isRejected = entity.status === 'rejected';
                        const isEdited = entity.status === 'edited';
                        return (
                          <div key={realIdx}
                            className={`rounded-xl border transition-all ${isHovered ? 'border-[#48484a]' : 'border-[#2c2c2e]'} ${isApproved ? 'border-green-500/30' : ''} ${isRejected ? 'opacity-40' : ''}`}
                            onMouseEnter={() => setHoveredEntity(realIdx)}
                            onMouseLeave={() => setHoveredEntity(null)}
                            data-testid={`review-entity-${realIdx}`}
                          >
                            <div className="bg-[#1c1c1e] rounded-xl p-3.5">
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-semibold text-[#8e8e93] uppercase tracking-widest leading-none">
                                      {fmtLabel(entity.name)}
                                    </span>
                                    {isApproved && <span className="text-[10px] text-green-400 font-medium">· Approved</span>}
                                    {isEdited && <span className="text-[10px] text-[#8e8e93] font-medium">· Edited</span>}
                                    {isRejected && <span className="text-[10px] text-red-400 font-medium">· Rejected</span>}
                                  </div>
                                  {def && <p className="text-[10px] text-[#48484a] leading-relaxed mb-2 line-clamp-2">{def}</p>}
                                  <input
                                    type="text"
                                    defaultValue={entity.value || ''}
                                    placeholder="No value extracted"
                                    onBlur={(e) => { const val = e.target.value; if (val !== entity.value) inlineEditEntity(activeReviewDoc, realIdx, val); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    className="w-full text-sm text-white bg-[#2c2c2e] rounded-lg px-3 py-2 border border-transparent focus:border-[#48484a] focus:outline-none transition-colors placeholder:text-[#48484a] placeholder:italic"
                                    data-testid={`input-entity-value-${realIdx}`}
                                  />
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                                  {!isApproved && (
                                    <button onClick={() => approveEntity(activeReviewDoc, realIdx)}
                                      className="p-1.5 text-[#636366] hover:text-green-400 hover:bg-green-500/10 rounded-lg smooth press-sm" title="Approve"
                                      data-testid={`button-approve-${realIdx}`}>
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {!isRejected && (
                                    <button onClick={() => rejectEntity(activeReviewDoc, realIdx)}
                                      className="p-1.5 text-[#636366] hover:text-red-400 hover:bg-red-500/10 rounded-lg smooth press-sm" title="Reject"
                                      data-testid={`button-reject-${realIdx}`}>
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {currentPage === ('scorecard' as 'scorecard' | 'company-info' | 'upload' | 'classify' | 'extract' | 'processing' | 'review') && (
            <div className="max-w-4xl mx-auto py-8">
              <div className="bg-[#1c1c1e] rounded-2xl p-8 border border-[#2c2c2e] shadow-xl">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-purple-500/30">
                      <ScanLine className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-1">B-BBEE Scorecard</h2>
                      <p className="text-[#8e8e93] text-sm">{companyInfo.name} • {companyInfo.sector}</p>
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white rounded-xl text-sm font-medium smooth press-sm border border-[#48484a]" onClick={() => window.print()}>
                    Export PDF
                  </button>
                </div>

                {isSavingSession ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-4" />
                    <p className="text-[#8e8e93]">Generating scorecard...</p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-3xl font-bold text-green-400 mb-2">Operation Complete</p>
                    <p className="text-[#a1a1aa] max-w-lg mx-auto leading-relaxed">
                      Scorecard calculation has been processed by the engine. You can view the fully generated certificate and metrics in the main Toolkit Dashboard.
                    </p>
                    <Link href="/dashboard" className="inline-block mt-8 px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold smooth press">
                      Go to Dashboard
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
