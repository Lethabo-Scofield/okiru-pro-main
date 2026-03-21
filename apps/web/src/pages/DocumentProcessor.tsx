import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import * as pdfjsLib from 'pdfjs-dist';
import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  X, Home, ArrowLeft, CloudUpload, Puzzle, Cpu, SearchCheck,
  Check, AlertTriangle, PlusCircle, Loader2, Trash2, ChevronRight, ChevronLeft,
  Circle, Zap, ListChecks, CheckCheck, FileText, FileSpreadsheet,
  FileImage, File, FileQuestion, Building2
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
  currentStep: string;
  filesData: { id: number; name: string; size: string; type: string; textContent: string }[];
  fileClassifications: Record<string, number>;
  extractionResults: any[];
  docStatuses: Record<number, string>;
  isComplete: boolean;
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

function getEntityColors(_dark?: boolean) {
  return [
    { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.35)', text: '#c084fc', underline: '#a855f7' },
    { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.35)', text: '#4ade80', underline: '#22c55e' },
    { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.35)', text: '#a78bfa', underline: '#8b5cf6' },
    { bg: 'rgba(251,146,60,0.15)', border: 'rgba(251,146,60,0.35)', text: '#fb923c', underline: '#f97316' },
    { bg: 'rgba(236,72,153,0.15)', border: 'rgba(236,72,153,0.35)', text: '#f472b6', underline: '#ec4899' },
    { bg: 'rgba(45,212,191,0.15)', border: 'rgba(45,212,191,0.35)', text: '#2dd4bf', underline: '#14b8a6' },
    { bg: 'rgba(250,204,21,0.15)', border: 'rgba(250,204,21,0.35)', text: '#facc15', underline: '#eab308' },
    { bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.35)', text: '#f87171', underline: '#ef4444' },
  ];
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
  const [location] = useLocation();
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
  const [extractionResults, setExtractionResults] = useState<any[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [templates, setTemplates] = useState<StoredTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [activeReviewDoc, setActiveReviewDoc] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'low' | 'edited'>('all');
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
      setExtractionResults(sess.extractionResults || []);
      if (sess.filesData && sess.filesData.length > 0) {
        const NativeFile = window.File as typeof globalThis.File;
        const restored: UploadedFile[] = sess.filesData.map((fd: any) => ({
          id: fd.id,
          file: new NativeFile([], fd.name, { type: fd.type === 'PDF' ? 'application/pdf' : 'application/octet-stream' }),
          name: fd.name,
          size: fd.size,
          type: fd.type,
          uploadProgress: 100,
          status: 'ready' as const,
          textContent: fd.textContent || '',
        }));
        setUploadedFiles(restored);
      }
      const validSteps = ['company-info', 'upload', 'classify', 'extract', 'review'];
      const step = sess.currentStep && validSteps.includes(sess.currentStep)
        ? sess.currentStep
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
      currentStep: step,
      filesData: (opts?.files ?? uploadedFiles).map(f => ({
        id: f.id, name: f.name, size: f.size, type: f.type, textContent: f.textContent,
      })),
      fileClassifications: opts?.classifications ?? fileClassifications,
      extractionResults: opts?.results ?? extractionResults,
      docStatuses: opts?.statuses ?? docStatuses,
      isComplete: opts?.complete ?? false,
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

  const readFileText = async (file: File): Promise<string> => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPdfText(file);
    if (name.endsWith('.docx') || name.endsWith('.doc') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocxText(file);
    if (name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.eml') || name.endsWith('.json') || name.endsWith('.md') || name.endsWith('.html') || name.endsWith('.xml') || file.type.startsWith('text/')) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string || '');
        reader.onerror = () => resolve(`[Could not read file: ${file.name}]`);
        reader.readAsText(file);
      });
    }
    return `[Unsupported file format: ${file.name}. Supported formats: PDF, DOCX, TXT, CSV, EML, JSON]`;
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

    const initialStatuses: Record<number, 'waiting'> = {};
    uploadedFiles.forEach((_, i) => { initialStatuses[i] = 'waiting'; });
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
            templateName: data.templateName, entities: data.entities || [],
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
                entities: data.entities || [],
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

  const stepIdx = currentPage === 'company-info' ? 0 : currentPage === 'upload' ? 1 : currentPage === 'classify' ? 2 : (currentPage === 'extract' || currentPage === 'processing') ? 3 : 4;

  return (
    <div className="bg-black text-white font-sans h-screen overflow-hidden flex flex-col" style={{ letterSpacing: '-0.011em' }}>


      <header className="h-14 flex items-center justify-between px-5 shrink-0 z-20 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => window.history.back()} className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors duration-200 press-sm group" data-testid="btn-back">
            <ChevronLeft className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-lg" />
          </button>
          <span className="text-lg font-semibold tracking-tight">
            <span className="text-purple-400">Okiru</span><span className="text-white"> Processor</span>
          </span>
          <div className="h-5 w-px bg-[#3a3a3c]"></div>
          <span className="text-[#d1d1d6] text-[13px] font-medium">Document Processor</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-[13px] font-medium text-[#8e8e93] hover:text-white smooth px-3 py-1.5 rounded-lg hover:bg-[#1c1c1e] press-sm" data-testid="link-dashboard-nav">
            <Home className="w-3.5 h-3.5 mr-1 inline-block" /> Dashboard
          </Link>
          <Link href="/builder" className="text-[13px] font-medium text-[#8e8e93] hover:text-white smooth px-3 py-1.5 rounded-lg hover:bg-[#1c1c1e] press-sm" data-testid="link-builder-nav">
            <ArrowLeft className="w-3.5 h-3.5 mr-1 inline-block" /> Builder
          </Link>
        </div>
      </header>

      <div className="bg-black px-6 py-3" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {['Company', 'Upload', 'Template', 'Extract', 'Review'].map((label, idx) => {
            const StepIcons = [Building2, CloudUpload, Puzzle, Cpu, SearchCheck];
            const pageMap = ['company-info', 'upload', 'classify', 'extract', 'review'] as const;
            const isComplete = idx < stepIdx;
            const isCurrent = idx === stepIdx;
            const canNavigate = isComplete && currentPage !== 'company-info';
            const StepIcon = StepIcons[idx];
            return (
              <React.Fragment key={label}>
                <div className={`flex items-center gap-2.5 ${canNavigate ? 'cursor-pointer group' : ''}`}
                  onClick={() => { if (canNavigate) setCurrentPage(pageMap[idx]); }}>
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs smooth ${isComplete ? 'border-green-500 bg-green-500 text-white group-hover:bg-green-400' : isCurrent ? 'border-purple-600 bg-purple-600 text-white' : 'border-transparent text-[#636366]'}`}>
                    {isComplete ? <Check className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`text-[13px] font-medium hidden sm:inline smooth ${isComplete ? 'text-green-400 group-hover:text-green-300' : isCurrent ? 'text-purple-400' : 'text-[#636366]'}`}>{label}</span>
                </div>
                {idx < 4 && (
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
        <div className={`${currentPage === 'review' ? '' : 'max-w-3xl mx-auto'} p-6`}>

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
                <input type="file" id="fileInput" multiple className="hidden" accept=".pdf,.txt,.csv,.doc,.docx,.eml,.json"
                  onChange={(e) => { if (e.target.files?.length) handleFiles(Array.from(e.target.files)); }} />
                {uploadedFiles.length === 0 ? (
                  <>
                    <div className={`w-16 h-16 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center mx-auto mb-4 transition-transform ${isDragActive ? 'scale-110' : ''}`}>
                      <CloudUpload className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">Drop files here</h3>
                    <p className="text-[#8e8e93] text-sm mb-3">or click to browse</p>
                    <div className="flex items-center justify-center gap-2 text-xs text-[#636366]">
                      {['PDF', 'TXT', 'CSV', 'DOC'].map(ext => (
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
                        <div className="w-9 h-9 rounded-xl bg-[#2c2c2e] flex items-center justify-center shrink-0">
                          <FileIcon type={file.type} className={`w-4 h-4 ${file.type === 'PDF' ? 'text-red-400' : 'text-purple-400'}`} />
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
                    <button onClick={async () => { if (allReady) { await persistSession('classify'); setCurrentPage('classify'); } }} disabled={!allReady}
                      className="flex-1 py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#1c1c1e] disabled:text-[#636366] text-white rounded-2xl font-semibold text-[13px] smooth press" data-testid="button-next-classify">
                      Continue <ChevronRight className="w-3 h-3 ml-1.5 inline-block" />
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
                    <div key={file.id} className={`bg-[#1c1c1e] rounded-2xl p-4 transition-all ${selectedTemplate ? 'ring-1 ring-purple-500/20' : ''}`} data-testid={`classify-row-${file.id}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selectedTemplate ? 'bg-purple-500/15' : 'bg-[#2c2c2e]'}`}>
                          <FileIcon type={file.type} className={`w-4 h-4 ${selectedTemplate ? 'text-purple-400' : file.type === 'PDF' ? 'text-red-400' : 'text-purple-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{file.name}</div>
                          <div className="text-xs text-[#636366] mt-0.5">{file.size} KB</div>
                        </div>
                        <select value={selectedId || ''}
                          onChange={(e) => setFileClassifications(prev => ({ ...prev, [String(file.id)]: Number(e.target.value) }))}
                          className="bg-[#2c2c2e] text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/20 appearance-none min-w-[200px]" data-testid={`select-template-${file.id}`}>
                          <option value="">Select template...</option>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.entities.length})</option>)}
                        </select>
                      </div>
                      {selectedTemplate && (
                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedTemplate.entities.map((ent, i) => (
                              <span key={i} className="text-[10px] px-2 py-1 rounded-lg bg-[#2c2c2e] text-[#8e8e93]">
                                {ent.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCurrentPage('upload')} className="px-5 py-3.5 bg-[#1c1c1e] text-[#d1d1d6] hover:text-white rounded-2xl text-[13px] font-medium smooth press-sm" data-testid="button-back-upload">
                  <ChevronLeft className="w-3 h-3 mr-1.5 inline-block" /> Back
                </button>
                <button onClick={async () => { if (allClassified) { await persistSession('extract'); setCurrentPage('extract'); } }} disabled={!allClassified}
                  className="flex-1 py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#1c1c1e] disabled:text-[#636366] text-white rounded-2xl font-semibold text-[13px] smooth press" data-testid="button-next-extract">
                  Continue <ChevronRight className="w-3 h-3 ml-1.5 inline-block" />
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
              await persistSession('review', { results: extractionResults, complete: true });
              setIsSavingSession(false);
              setIsSubmitted(true);
              toast({ title: "Assessment complete", description: `${totalEntities} entities across ${extractionResults.length} document${extractionResults.length !== 1 ? 's' : ''} — view in Toolkit` });
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
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">{isPdfFile ? 'Document Viewer' : 'Document'}</span>
                      {!isPdfFile && <span className="text-xs text-gray-400 ml-auto">{activeDocText.length.toLocaleString()} chars</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {extractionResults[activeReviewDoc]?.entities
                        .filter((e: any) => e.value && e.status !== 'not_found' && e.status !== 'rejected')
                        .map((e: any, i: number) => {
                          const realIdx = extractionResults[activeReviewDoc].entities.indexOf(e);
                          const color = entityColors[realIdx % entityColors.length];
                          const isHovered = hoveredEntity === realIdx;
                          return (
                            <span key={i}
                              className="text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1.5 cursor-pointer transition-all"
                              style={{
                                backgroundColor: isHovered ? color.bg.replace('0.15', '0.4') : color.bg,
                                borderColor: color.border, color: color.text,
                                transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                              }}
                              onMouseEnter={() => setHoveredEntity(realIdx)}
                              onMouseLeave={() => setHoveredEntity(null)}
                            >
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color.underline }}></span>
                              {e.name}
                            </span>
                          );
                        })}
                    </div>
                  </div>
                  <div className={isPdfFile ? "px-2 py-2" : "p-5"}>
                    {isPdfFile && activeDocFile ? (
                      <PDFDocumentViewer
                        file={activeDocFile.file}
                        entities={extractionResults[activeReviewDoc]?.entities || []}
                        hoveredEntity={hoveredEntity}
                        onHoverEntity={setHoveredEntity}
                      />
                    ) : activeDocText ? (
                      <HighlightedDocument text={activeDocText} entities={extractionResults[activeReviewDoc]?.entities || []} hoveredEntity={hoveredEntity} onHoverEntity={setHoveredEntity} />
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
                      </div>
                      <div className="flex items-center gap-2">
                        {(['all', 'low', 'edited'] as const).map(f => (
                          <button key={f} onClick={() => setReviewFilter(f)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium smooth press-sm capitalize ${reviewFilter === f ? 'bg-[#1c1c1e] text-white' : 'text-[#8e8e93] hover:text-white'}`}>
                            {f === 'low' ? '< 70%' : f}
                          </button>
                        ))}
                        <button onClick={() => approveAllForDoc(activeReviewDoc)}
                          className="px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-[11px] font-medium hover:bg-green-500/20 smooth press-sm ml-1" data-testid="button-approve-all">
                          <CheckCheck className="w-3 h-3 mr-1 inline-block" />All
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 space-y-2">
                    {(() => {
                      const entities = extractionResults[activeReviewDoc]?.entities || [];
                      const filtered = entities.filter((e: any, _: number) => {
                        if (reviewFilter === 'low') return e.confidence < 70;
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
                              {reviewFilter === 'all' ? 'No entities found' : `No ${reviewFilter === 'low' ? 'low-confidence' : 'edited'} entities`}
                            </p>
                            <p className="text-[#636366] text-xs">
                              {reviewFilter === 'all'
                                ? 'The template entities were not detected in this document'
                                : 'Try switching to "all" to see all extracted entities'}
                            </p>
                          </div>
                        );
                      }

                      return filtered.map((entity: any) => {
                        const realIdx = entities.indexOf(entity);
                        const color = entityColors[realIdx % entityColors.length];
                        const isHovered = hoveredEntity === realIdx;
                        return (
                          <div key={realIdx}
                            className={`rounded-xl overflow-hidden transition-all cursor-default ${isHovered ? 'ring-1 scale-[1.01]' : ''} ${entity.status === 'rejected' ? 'opacity-40' : ''}`}
                            style={isHovered ? { '--tw-ring-color': color.underline } as React.CSSProperties : undefined}
                            onMouseEnter={() => setHoveredEntity(realIdx)}
                            onMouseLeave={() => setHoveredEntity(null)}
                            data-testid={`review-entity-${realIdx}`}
                          >
                            <div className="flex">
                              <div className="w-1.5 shrink-0 rounded-l-xl" style={{ backgroundColor: color.underline }}></div>
                              <div className={`flex-1 bg-[#1c1c1e] rounded-r-xl p-4 ${entity.status === 'approved' ? 'ring-1 ring-green-500/20' : ''}`}>
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ backgroundColor: color.bg, color: color.text, border: `1px solid ${color.border}` }}>{entity.name}</span>
                                      {entity.status === 'approved' && <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-md">Approved</span>}
                                      {entity.status === 'edited' && <span className="text-[10px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-md">Edited</span>}
                                      {entity.status === 'rejected' && <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-md">Rejected</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <input
                                        type="text"
                                        defaultValue={entity.value || ''}
                                        placeholder="No value found"
                                        onBlur={(e) => {
                                          const val = e.target.value;
                                          if (val !== entity.value) inlineEditEntity(activeReviewDoc, realIdx, val);
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                        className="min-w-0 flex-1 px-2 py-1 rounded-md text-sm font-mono bg-transparent border-0 border-b-2 focus:outline-none focus:border-purple-400 transition-colors placeholder:text-[#636366] placeholder:italic placeholder:font-sans"
                                        style={{ color: color.text, borderColor: color.underline, backgroundColor: color.bg }}
                                        data-testid={`input-entity-value-${realIdx}`}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-3">
                                    <span className={`text-sm font-bold ${entity.confidence >= 80 ? 'text-green-400' : entity.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{entity.confidence}%</span>
                                    <div className="flex items-center gap-0.5">
                                      {entity.status !== 'approved' && (
                                        <button onClick={() => approveEntity(activeReviewDoc, realIdx)} className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg smooth press-sm" title="Approve" data-testid={`button-approve-${realIdx}`}>
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      {entity.status !== 'rejected' && (
                                        <button onClick={() => rejectEntity(activeReviewDoc, realIdx)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg smooth press-sm" title="Reject" data-testid={`button-reject-${realIdx}`}>
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2.5 h-1 bg-[#2c2c2e] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${entity.confidence}%`, backgroundColor: color.underline }}></div>
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
        </div>
      </main>
    </div>
  );
}
