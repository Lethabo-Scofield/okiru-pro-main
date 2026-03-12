import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'wouter';
import * as pdfjsLib from 'pdfjs-dist';
import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  X, Home, ArrowLeft, CloudUpload, Puzzle, Cpu, SearchCheck,
  Check, AlertTriangle, PlusCircle, Loader2, Trash2, ChevronRight, ChevronLeft,
  Circle, Zap, ListChecks, Download, CheckCheck, Pencil, FileText, FileSpreadsheet,
  FileImage, File, FileQuestion
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

function HighlightedDocument({ text, entities, hoveredEntity, onHoverEntity, isDark = true }: {
  text: string; entities: any[]; isDark?: boolean;
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
    <pre className="text-sm text-[#d1d1d6] whitespace-pre-wrap font-mono leading-relaxed break-words">
      {highlighted.map((seg, i) => {
        if (!seg.highlight) return <span key={i}>{seg.text}</span>;
        const colors = getEntityColors(isDark);
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
              color: color.text,
              padding: '2px 4px',
              borderRadius: '4px',
              transition: 'background-color 0.15s',
              fontWeight: isHovered ? 600 : 400,
            }}>
              {seg.text}
            </mark>
          </span>
        );
      })}
    </pre>
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
  const entityColors = useMemo(() => getEntityColors(isDark), [isDark]);
  const [currentPage, setCurrentPage] = useState<'upload' | 'classify' | 'extract' | 'processing' | 'review'>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [fileClassifications, setFileClassifications] = useState<Record<string, number>>({});
  const [extractionResults, setExtractionResults] = useState<any[]>([]);
  const [currentEdit, setCurrentEdit] = useState<{ docIdx: number; entIdx: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editConfidence, setEditConfidence] = useState(0);
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

  const editInputRef = useRef<HTMLInputElement>(null);

  const openEdit = (docIdx: number, entIdx: number) => {
    const entity = extractionResults[docIdx]?.entities[entIdx];
    if (!entity) return;
    setCurrentEdit({ docIdx, entIdx });
    setEditValue(entity.value || '');
    setEditConfidence(entity.confidence || 0);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };
  const saveEdit = () => {
    if (!currentEdit) return;
    const { docIdx, entIdx } = currentEdit;
    const r = structuredClone(extractionResults);
    r[docIdx].entities[entIdx] = { ...r[docIdx].entities[entIdx], value: editValue, confidence: editConfidence, status: 'edited' };
    setExtractionResults(r);
    setCurrentEdit(null);
    toast({ title: "Entity updated", description: `Value saved for "${r[docIdx].entities[entIdx].name}"` });
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

  const stepIdx = currentPage === 'upload' ? 0 : currentPage === 'classify' ? 1 : (currentPage === 'extract' || currentPage === 'processing') ? 2 : 3;

  return (
    <div className="bg-black text-white font-sans h-screen overflow-hidden flex flex-col" style={{ letterSpacing: '-0.011em' }}>

      {currentEdit !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xl" onClick={(e) => { if (e.target === e.currentTarget) setCurrentEdit(null); }} style={{ animation: 'fadeIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
          <div className="bg-[#1c1c1e] rounded-2xl shadow-2xl w-full max-w-md p-6 scale-in" style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5)' }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setCurrentEdit(null); }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">Edit Entity</h3>
              <button onClick={() => setCurrentEdit(null)} className="p-1.5 text-[#98989f] hover:text-white rounded-[10px] hover:bg-[#2c2c2e] smooth press-sm">
                <X className="w-4 h-4" />
              </button>
            </div>
            {currentEdit && extractionResults[currentEdit.docIdx]?.entities[currentEdit.entIdx] && (
              <div className="text-xs text-[#8e8e93] mb-4 px-2 py-1.5 bg-[#2c2c2e] rounded-lg">
                <span className="font-medium text-[#d1d1d6]">{extractionResults[currentEdit.docIdx].entities[currentEdit.entIdx].name}</span>
                <span className="mx-1.5 text-[#636366]">|</span>
                {extractionResults[currentEdit.docIdx].fileName}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#d1d1d6] uppercase tracking-wider mb-2">Value</label>
                <input ref={editInputRef} type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                  className="w-full bg-[#2c2c2e] border border-transparent rounded-xl px-3 py-2.5 text-sm text-white focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all" data-testid="input-edit-value" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[#d1d1d6] uppercase tracking-wider">Confidence</label>
                  <span className={`text-sm font-bold ${editConfidence >= 80 ? 'text-green-400' : editConfidence >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{editConfidence}%</span>
                </div>
                <input type="range" min="0" max="100" value={editConfidence} onChange={(e) => setEditConfidence(Number(e.target.value))}
                  className="w-full accent-purple-500" data-testid="input-edit-confidence" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCurrentEdit(null)} className="flex-1 py-2.5 bg-[#2c2c2e] text-white rounded-xl hover:bg-[#3a3a3c] smooth press-sm text-[13px] font-medium">Cancel</button>
              <button onClick={saveEdit} className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-500 smooth press-sm text-[13px] font-semibold" data-testid="button-save-edit">
                Save <span className="text-white/60 text-[11px] ml-1">Enter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="h-14 flex items-center justify-between px-5 shrink-0 z-20 bg-black" style={{ borderBottom: '1px solid #2c2c2e' }}>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors duration-200 press-sm group" data-testid="btn-back">
            <ChevronLeft className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-lg" />
          </Link>
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
          {['Upload', 'Template', 'Extract', 'Review'].map((label, idx) => {
            const StepIcons = [CloudUpload, Puzzle, Cpu, SearchCheck];
            const pageMap = ['upload', 'classify', 'extract', 'review'] as const;
            const isComplete = idx < stepIdx;
            const isCurrent = idx === stepIdx;
            const canNavigate = isComplete;
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
                {idx < 3 && (
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
                  <button onClick={() => allReady && setCurrentPage('classify')} disabled={!allReady}
                    className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#1c1c1e] disabled:text-[#636366] text-white rounded-2xl font-semibold text-[13px] smooth press" data-testid="button-next-classify">
                    Continue <ChevronRight className="w-3 h-3 ml-1.5 inline-block" />
                  </button>
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
                <button onClick={() => allClassified && setCurrentPage('extract')} disabled={!allClassified}
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
                        {!anyProcessing && status !== 'done' && (
                          <button
                            onClick={() => extractSingleDocument(idx)}
                            className="px-3 py-1.5 bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[#d1d1d6] hover:text-white rounded-[10px] text-[11px] font-medium smooth press-sm"
                            data-testid={`button-extract-single-${idx}`}
                          >
                            <Zap className="w-2.5 h-2.5 mr-1 inline-block" />Extract
                          </button>
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


          {currentPage === 'review' && extractionResults.length > 0 && (
            <div className="flex flex-col h-full -m-6">
              <div className="px-6 py-4 flex items-center justify-between bg-black shrink-0" style={{ borderBottom: '1px solid #2c2c2e' }}>
                <div className="flex items-center gap-4">
                  <button onClick={() => setCurrentPage('extract')} className="p-2 -ml-2 text-[#8e8e93] hover:text-white hover:bg-[#1c1c1e] rounded-[10px] smooth press-sm" data-testid="button-back-extract">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <h2 className="text-lg font-semibold text-white">Review Results</h2>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-1 bg-[#1c1c1e] text-[#d1d1d6] rounded-lg">{totalEntities} entities</span>
                    <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-lg">{approvedCount} approved</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={exportResults} className="px-3 py-1.5 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[#d1d1d6] hover:text-white rounded-[10px] text-[13px] smooth press-sm" data-testid="button-export-results">
                    <Download className="w-3.5 h-3.5 mr-1.5 inline-block" />JSON
                  </button>
                  <button onClick={exportCSV} className="px-3 py-1.5 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[#d1d1d6] hover:text-white rounded-[10px] text-[13px] smooth press-sm" data-testid="button-export-csv">
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 inline-block" />CSV
                  </button>
                  <button onClick={() => { setIsSubmitted(true); toast({ title: "Results submitted", description: `${totalEntities} entities across ${extractionResults.length} documents` }); }} disabled={isSubmitted}
                    className={`px-4 py-1.5 rounded-[10px] font-semibold text-[13px] smooth press-sm ${isSubmitted ? 'bg-green-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`} data-testid="button-submit">
                    {isSubmitted ? <><Check className="w-3.5 h-3.5 mr-1.5 inline-block" />Submitted</> : 'Submit All'}
                  </button>
                </div>
              </div>

              {extractionResults.length > 1 && (
                <div className="px-6 py-3 bg-[#0a0a0a] flex gap-2 overflow-x-auto shrink-0" style={{ borderBottom: '1px solid #2c2c2e' }}>
                  {extractionResults.map((result: any, idx: number) => {
                    const ext = result.fileName.split('.').pop()?.toUpperCase() || '';
                    const iconColor = ext === 'PDF' ? 'text-red-400' : ext === 'CSV' ? 'text-green-400' : ext === 'DOC' || ext === 'DOCX' ? 'text-purple-400' : 'text-[#636366]';
                    return (
                      <button key={idx} onClick={() => setActiveReviewDoc(idx)}
                        className={`px-3 py-2 rounded-[10px] text-[13px] font-medium whitespace-nowrap smooth press-sm flex items-center gap-1.5 ${activeReviewDoc === idx ? 'bg-[#1c1c1e] text-white' : 'text-[#8e8e93] hover:text-white hover:bg-white/[0.06]'}`} data-testid={`tab-doc-${idx}`}>
                        <FileIcon type={ext} className={`w-3.5 h-3.5 ${iconColor}`} />{result.fileName}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="w-1/2 overflow-y-auto bg-[#0a0a0a]" style={{ borderRight: '1px solid #2c2c2e' }}>
                  <div className="px-5 py-4 sticky top-0 bg-[#0a0a0a] z-10" style={{ borderBottom: '1px solid #2c2c2e' }}>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#636366]" />
                      <span className="text-sm font-medium text-[#d1d1d6]">{isPdfFile ? 'Document Viewer' : 'Document Preview'}</span>
                      {!isPdfFile && <span className="text-xs text-[#636366] ml-auto">{activeDocText.length.toLocaleString()} chars</span>}
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
                  <div className={isPdfFile ? "px-2" : "p-5"}>
                    {isPdfFile && activeDocFile ? (
                      <PDFDocumentViewer
                        file={activeDocFile.file}
                        entities={extractionResults[activeReviewDoc]?.entities || []}
                        hoveredEntity={hoveredEntity}
                        onHoverEntity={setHoveredEntity}
                      />
                    ) : activeDocText ? (
                      <HighlightedDocument text={activeDocText} entities={extractionResults[activeReviewDoc]?.entities || []} hoveredEntity={hoveredEntity} onHoverEntity={setHoveredEntity} isDark={isDark} />
                    ) : (
                      <div className="text-center py-12">
                        <FileQuestion className="w-8 h-8 text-[#636366] mb-3" />
                        <p className="text-[#636366] text-sm">Document text not available</p>
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
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block px-2 py-1 rounded-md text-sm font-mono" style={{ backgroundColor: color.bg, color: color.text, borderBottom: `2px solid ${color.underline}` }}>
                                        {entity.value || <span className="text-[#636366] italic font-sans text-sm">No value found</span>}
                                      </span>
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
                                      <button onClick={() => openEdit(activeReviewDoc, realIdx)} className="p-1.5 text-purple-400 hover:bg-purple-500/10 rounded-lg smooth press-sm" title="Edit" data-testid={`button-edit-${realIdx}`}>
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
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
          )}
        </div>
      </main>
    </div>
  );
}
