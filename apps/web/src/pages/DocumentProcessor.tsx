import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import * as pdfjsLib from 'pdfjs-dist';
import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@toolkit/lib/auth';
import { parseExcelClientSide, type ClientSideImportResult } from '@toolkit/lib/excel-parser';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  X, Home, ArrowLeft, CloudUpload, Puzzle, Cpu, SearchCheck,
  Check, AlertTriangle, PlusCircle, Loader2, Trash2, ChevronRight, ChevronLeft,
  Circle, Zap, ListChecks, CheckCheck, FileText, FileSpreadsheet,
  FileImage, File, FileQuestion, Building2, ScanLine, Monitor, HelpCircle, LogOut,
  Pencil, Plus, Maximize2, Minimize2, Save, ArrowRightCircle, Send, ClipboardEdit
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

interface ManualEntryData {
  blackOwnership: string;
  blackFemaleOwnership: string;
  blackBoardMembers: string;
  blackExecutiveManagement: string;
  skillsSpendOnBlack: string;
  blackLearnerships: string;
  customTargets: { name: string; value: string }[];
}

const EMPTY_MANUAL_ENTRY: ManualEntryData = {
  blackOwnership: '',
  blackFemaleOwnership: '',
  blackBoardMembers: '',
  blackExecutiveManagement: '',
  skillsSpendOnBlack: '',
  blackLearnerships: '',
  customTargets: [],
};

const MANUAL_ENTRY_KEY = 'okiru-manual-entry-data';

function loadManualEntryData(): ManualEntryData {
  try {
    const raw = localStorage.getItem(MANUAL_ENTRY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ...EMPTY_MANUAL_ENTRY, customTargets: [] };
}

function saveManualEntryData(data: ManualEntryData) {
  localStorage.setItem(MANUAL_ENTRY_KEY, JSON.stringify(data));
}

function bbeeLevel(total: number): number {
  if (total >= 100) return 1;
  if (total >= 95) return 2;
  if (total >= 90) return 3;
  if (total >= 80) return 4;
  if (total >= 75) return 5;
  if (total >= 70) return 6;
  if (total >= 55) return 7;
  if (total >= 40) return 8;
  return 9;
}

function bbeeRecognition(level: number): string {
  const map: Record<number, string> = { 1: '135%', 2: '125%', 3: '110%', 4: '100%', 5: '80%', 6: '60%', 7: '50%', 8: '10%' };
  return map[level] || '0%';
}

function buildScorecardFromCsvImport(data: ClientSideImportResult): any {
  const BLACK_RACES = ['African', 'Coloured', 'Indian'];

  const totalShares = data.shareholders.reduce((s, sh) => s + (sh.shares || 0), 0);
  const blackShares = data.shareholders.reduce((s, sh) => s + (sh.shares || 0) * Math.min(1, sh.blackOwnership || 0), 0);
  const blackWomenShares = data.shareholders.reduce((s, sh) => s + (sh.shares || 0) * Math.min(1, sh.blackWomenOwnership || 0), 0);
  const blackOwnerPct = totalShares > 0 ? (blackShares / totalShares) * 100 : 0;
  const blackWomenPct = totalShares > 0 ? (blackWomenShares / totalShares) * 100 : 0;
  const ownershipScore = Math.min(25,
    Math.min(4, (blackOwnerPct / 25) * 4) +
    Math.min(4, (blackOwnerPct / 25) * 4) +
    Math.min(2, (blackWomenPct / 10) * 2) +
    Math.min(3, (blackOwnerPct / 25) * 3) +
    Math.min(2, (blackWomenPct / 10) * 2) +
    Math.min(3, (blackOwnerPct / 25) * 3) +
    Math.min(3, (blackOwnerPct / 25) * 3)
  );

  const board = data.employees.filter(e => e.designation === 'Board');
  const exec = data.employees.filter(e => e.designation === 'Executive');
  const senior = data.employees.filter(e => e.designation === 'Senior');
  const middle = data.employees.filter(e => e.designation === 'Middle');
  const junior = data.employees.filter(e => e.designation === 'Junior');
  const blackBoardPct = board.length > 0 ? (board.filter(e => BLACK_RACES.includes(e.race)).length / board.length) * 100 : 0;
  const blackExecPct = exec.length > 0 ? (exec.filter(e => BLACK_RACES.includes(e.race)).length / exec.length) * 100 : 0;
  const blackSeniorPct = senior.length > 0 ? (senior.filter(e => BLACK_RACES.includes(e.race)).length / senior.length) * 100 : 0;
  const blackMiddlePct = middle.length > 0 ? (middle.filter(e => BLACK_RACES.includes(e.race)).length / middle.length) * 100 : 0;
  const blackJuniorPct = junior.length > 0 ? (junior.filter(e => BLACK_RACES.includes(e.race)).length / junior.length) * 100 : 0;
  const mgmtScore = Math.min(19,
    Math.min(2, (blackBoardPct / 50) * 2) +
    Math.min(2, (blackBoardPct / 25) * 2) +
    Math.min(3, (blackExecPct / 60) * 3) +
    Math.min(2, (blackExecPct / 25) * 2) +
    Math.min(4, (blackSeniorPct / 60) * 4) +
    Math.min(4, (blackMiddlePct / 75) * 4) +
    Math.min(2, (blackJuniorPct / 88) * 2)
  );

  const leviable = data.financials.leviableAmount || 0;
  const blackTrainingSpend = data.trainingPrograms.filter(t => t.isBlack).reduce((s, t) => s + (t.cost || 0), 0);
  const skillsPct = leviable > 0 ? (blackTrainingSpend / leviable) * 100 : 0;
  const skillsScore = Math.min(25, (skillsPct / 6) * 20 + (data.trainingPrograms.filter(t => t.isBlack && t.isEmployed).length > 0 ? 5 : 0));

  const allSpend = data.suppliers.reduce((s, sup) => s + (sup.spend || 0), 0);
  const tmps = data.financials.tmps > 0 ? data.financials.tmps : allSpend;
  const LEVEL_WEIGHTS: Record<number, number> = { 1: 1, 2: 0.9, 3: 0.8, 4: 0.6, 5: 0.5, 6: 0.4, 7: 0.3, 8: 0.1 };
  const recognizedSpend = data.suppliers.reduce((s, sup) => s + (sup.spend || 0) * (LEVEL_WEIGHTS[sup.beeLevel] ?? 0), 0);
  const procPct = tmps > 0 ? (recognizedSpend / tmps) * 100 : 0;
  const procScore = Math.min(29, (procPct / 80) * 25 + (data.suppliers.filter(s => s.enterpriseType === 'eme').length > 0 ? 2 : 0) + (data.suppliers.filter(s => s.enterpriseType === 'qse').length > 0 ? 2 : 0));

  const npat = data.financials.npat || 0;
  const sdContribs = data.esdContributions.filter(c => c.category === 'supplier_development').reduce((s, c) => s + c.amount, 0);
  const edContribs = data.esdContributions.filter(c => c.category === 'enterprise_development').reduce((s, c) => s + c.amount, 0);
  const sedContribs = data.sedContributions.reduce((s, c) => s + c.amount, 0);
  const sdTarget = npat * 0.02;
  const edTarget = npat * 0.01;
  const sedTarget = npat * 0.01;
  const sdScore = npat > 0 ? Math.min(10, sdContribs > 0 ? Math.min(10, (sdContribs / sdTarget) * 10) : 0) : sdContribs > 0 ? 5 : 0;
  const edScore = npat > 0 ? Math.min(7, edContribs > 0 ? Math.min(7, (edContribs / edTarget) * 7) : 0) : edContribs > 0 ? 3 : 0;
  const sedScore = npat > 0 ? Math.min(5, sedContribs > 0 ? Math.min(5, (sedContribs / sedTarget) * 5) : 0) : sedContribs > 0 ? 3 : 0;

  const total = ownershipScore + mgmtScore + skillsScore + procScore + sdScore + edScore + sedScore;
  const level = bbeeLevel(total);
  const ownSubMin = blackOwnerPct >= 25 && blackWomenPct >= 10;
  const skSubMin = skillsPct >= 6;
  const prSubMin = procPct >= 40;
  const isDiscounted = !ownSubMin || !skSubMin || !prSubMin;
  const discountedLevel = isDiscounted ? Math.min(8, level + 1) : level;

  return {
    ownership: { score: Math.round(ownershipScore * 10) / 10, target: 25, weighting: 25, subMinimumMet: ownSubMin },
    managementControl: { score: Math.round(mgmtScore * 10) / 10, target: 19, weighting: 19 },
    skillsDevelopment: { score: Math.round(skillsScore * 10) / 10, target: 25, weighting: 25, subMinimumMet: skSubMin },
    procurement: { score: Math.round(procScore * 10) / 10, target: 29, weighting: 29, subMinimumMet: prSubMin },
    supplierDevelopment: { score: Math.round(sdScore * 10) / 10, target: 10, weighting: 10, subMinimumMet: sdContribs > 0 },
    enterpriseDevelopment: { score: Math.round(edScore * 10) / 10, target: 7, weighting: 7, subMinimumMet: edContribs > 0 },
    socioEconomicDevelopment: { score: Math.round(sedScore * 10) / 10, target: 5, weighting: 5 },
    yesInitiative: { score: 0, target: 5, weighting: 5 },
    total: { score: Math.round(total * 10) / 10, target: 120, weighting: 120 },
    achievedLevel: level,
    discountedLevel,
    isDiscounted,
    recognitionLevel: bbeeRecognition(discountedLevel),
    _source: 'csv_import',
    _entityCounts: {
      shareholders: data.shareholders.length,
      employees: data.employees.length,
      trainingPrograms: data.trainingPrograms.length,
      suppliers: data.suppliers.length,
      esdContributions: data.esdContributions.length,
      sedContributions: data.sedContributions.length,
    },
    _financials: {
      revenue: data.financials.revenue,
      npat: data.financials.npat,
      leviableAmount: data.financials.leviableAmount,
      tmps,
    },
  };
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
        scorecardResult: session.scorecardResult,
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
  const label = type?.toUpperCase()?.slice(0, 4) || 'FILE';
  const displayLabel = ({ PDF: 'PDF', DOCX: 'DOC', DOC: 'DOC', XLSX: 'XLS', XLS: 'XLS', CSV: 'CSV', TXT: 'TXT', JPG: 'JPG', JPEG: 'JPG', PNG: 'PNG', EML: 'EML', JSON: 'JSON' } as Record<string, string>)[type?.toUpperCase()] || label;

  const dims = size === 'sm' ? { w: 32, h: 38, r: 6, labelSize: 7 }
             : size === 'lg' ? { w: 44, h: 52, r: 8, labelSize: 10 }
             : { w: 38, h: 46, r: 7, labelSize: 8 };

  const { w, h, r, labelSize } = dims;

  return (
    <div
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: w, height: h,
        borderRadius: r,
        background: '#1c1c1e',
        border: '1px solid #2c2c2e',
      }}
    >
      <span
        style={{ fontSize: labelSize, fontWeight: 700, letterSpacing: '0.5px', color: '#8e8e93', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }}
      >
        {displayLabel}
      </span>
    </div>
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
        <Loader2 className="w-6 h-6 text-[#d1d1d6] animate-spin" />
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

// ─── Populating Screen ────────────────────────────────────────────────────────
interface PopulatingPillar {
  label: string;
  color: string;
  icon: string;
  entities: string[];
}

function PopulatingScreen({
  pillars, totalEntities, companyName, onDone,
}: {
  pillars: PopulatingPillar[];
  totalEntities: number;
  companyName: string;
  onDone: () => void;
}) {
  const [revealedPillar, setRevealedPillar] = useState(-1);
  const [revealedRows, setRevealedRows] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    (async () => {
      await delay(300);
      for (let p = 0; p < pillars.length; p++) {
        if (cancelled) return;
        setRevealedPillar(p);
        setRevealedRows([]);
        await delay(160);
        const rows = pillars[p].entities;
        for (let r = 0; r < rows.length; r++) {
          if (cancelled) return;
          await delay(90);
          setRevealedRows(prev => [...prev, r]);
        }
        await delay(220);
      }
      if (cancelled) return;
      setDone(true);
      await delay(900);
      if (!cancelled) onDoneRef.current();
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = pillars.length > 0
    ? Math.min(100, ((revealedPillar + 1) / pillars.length) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex flex-col items-center justify-start pt-10 pb-16 px-6">
      {/* Header */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-[#5e9bff] animate-pulse" />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-[#5e9bff]">
            {done ? 'Populating complete' : 'Populating Toolkit'}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">
          {done ? 'Opening scorecard…' : `Importing ${companyName}`}
        </h1>
        <p className="text-[13px] text-[#8e8e93]">
          {totalEntities} entities extracted · loading into B-BBEE engine
        </p>

        {/* Progress bar */}
        <div className="mt-5 h-1 bg-[#1c1c1e] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${done ? 100 : progress}%`, background: 'linear-gradient(90deg,#5e9bff,#a78bfa)' }}
          />
        </div>
      </div>

      {/* Pillar cards */}
      <div className="w-full max-w-2xl space-y-3">
        {pillars.map((pillar, pi) => {
          const active = pi === revealedPillar;
          const revealed = pi < revealedPillar || (pi === revealedPillar && !active) || done;
          const visible = pi <= revealedPillar || done;
          if (!visible) return null;

          return (
            <div
              key={pillar.label}
              className="rounded-xl border border-[#2a2a2e] bg-[#111113] overflow-hidden"
              style={{ borderLeftColor: pillar.color, borderLeftWidth: 3, opacity: visible ? 1 : 0, transition: 'opacity 0.3s' }}
            >
              {/* Pillar header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1e1e22]">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pillar.color }} />
                <span className="text-[12px] font-semibold text-white/80 tracking-wide">{pillar.label}</span>
                <span className="ml-auto text-[11px] text-[#5e5e6a]">
                  {pillar.entities.length} {pillar.entities.length === 1 ? 'record' : 'records'}
                </span>
                {(revealed || done) && (
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {active && !revealed && (
                  <svg className="w-3.5 h-3.5 animate-spin text-[#5e9bff]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
              </div>

              {/* Entity rows */}
              <div className="divide-y divide-[#1a1a1e]">
                {pillar.entities.map((row, ri) => {
                  const rowVisible = done || (pi < revealedPillar) || (pi === revealedPillar && revealedRows.includes(ri));
                  if (!rowVisible) return null;
                  return (
                    <div
                      key={ri}
                      className="flex items-center gap-2 px-4 py-2"
                      style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
                    >
                      <span className="text-[11px] text-[#5e9bff]/60">→</span>
                      <span className="text-[12px] text-[#c0c0cc] font-mono leading-relaxed">{row}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Done state */}
      {done && (
        <div className="mt-8 flex items-center gap-3 text-emerald-400 animate-pulse">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[13px] font-semibold">Entities populated · opening Toolkit scorecard</span>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

export default function DocumentProcessor() {
  const { isDark } = useTheme();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();
  const entityColors = useMemo(() => getEntityColors(isDark), [isDark]);
  const [currentPage, setCurrentPage] = useState<'company-info' | 'upload' | 'classify' | 'extract' | 'processing' | 'review' | 'manual-entry' | 'populating' | 'scorecard'>('company-info');
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
  const [editingEntity, setEditingEntity] = useState<{ docIdx: number; entityIdx: number; draft: string } | null>(null);
  const [savedDocs, setSavedDocs] = useState<Set<number>>(new Set());
  const [docFullView, setDocFullView] = useState(false);
  const [docStatuses, setDocStatuses] = useState<Record<number, 'waiting' | 'processing' | 'done' | 'error'>>({});
  const [completedCount, setCompletedCount] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const processingFinalized = useRef(false);
  const [manualEntry, setManualEntry] = useState<ManualEntryData>(loadManualEntryData);
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [scorecardResult, setScorecardResult] = useState<any>(null);
  const [populatingData, setPopulatingData] = useState<ClientSideImportResult | null>(null);
  const populatingClientIdRef = useRef<string | null>(null);
  const populatingErrorRef = useRef<boolean>(false);

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
      if (sess.scorecardResult) setScorecardResult(sess.scorecardResult);
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

  const isCsvOrExcel = (file: UploadedFile) => {
    const n = file.name.toLowerCase();
    return n.endsWith('.csv') || n.endsWith('.xlsx') || n.endsWith('.xls') ||
      file.file.type === 'text/csv' ||
      file.file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.file.type === 'application/vnd.ms-excel';
  };

  const extractAllBbeeEntities = (parsed: ClientSideImportResult): any[] => {
    const entities: any[] = [];
    const BLACK_RACES = ['African', 'Coloured', 'Indian'];
    const fmt = (n: number) => n.toLocaleString('en-ZA', { maximumFractionDigits: 2 });
    const pct = (n: number) => `${fmt(n)}%`;
    const rand = (n: number) => `R ${fmt(Math.round(n))}`;

    // — Ownership —
    const totalShares = parsed.shareholders.reduce((s, sh) => s + (sh.shares || 0), 0);
    const blackShares = parsed.shareholders.reduce((s, sh) => s + (sh.shares || 0) * Math.min(1, sh.blackOwnership || 0), 0);
    const blackWomenShares = parsed.shareholders.reduce((s, sh) => s + (sh.shares || 0) * Math.min(1, sh.blackWomenOwnership || 0), 0);
    const blackOwnerPct = totalShares > 0 ? (blackShares / totalShares) * 100 : 0;
    const blackWomenPct = totalShares > 0 ? (blackWomenShares / totalShares) * 100 : 0;
    if (parsed.shareholders.length > 0) {
      entities.push({ name: 'BlackVotingRights', value: pct(blackOwnerPct), confidence: 0.95, status: 'approved', pillar: 'Ownership' });
      entities.push({ name: 'BlackEconomicInterest', value: pct(blackOwnerPct), confidence: 0.95, status: 'approved', pillar: 'Ownership' });
      entities.push({ name: 'BlackWomenVotingRights', value: pct(blackWomenPct), confidence: 0.95, status: 'approved', pillar: 'Ownership' });
      entities.push({ name: 'BlackWomenEconomicInterest', value: pct(blackWomenPct), confidence: 0.95, status: 'approved', pillar: 'Ownership' });
      parsed.shareholders.forEach(sh => {
        entities.push({
          name: `Shareholder — ${sh.name}`,
          value: `${pct((sh.blackOwnership || 0) * 100)} black, ${sh.shares || 0} shares`,
          confidence: 0.95, status: 'approved', pillar: 'Ownership',
        });
      });
    }

    // — Management Control —
    const byDesig = (d: string) => parsed.employees.filter(e => e.designation === d);
    const blackPct = (arr: any[]) => arr.length > 0 ? (arr.filter(e => BLACK_RACES.includes(e.race)).length / arr.length) * 100 : 0;
    if (parsed.employees.length > 0) {
      entities.push({ name: 'BlackBoardMembers', value: pct(blackPct(byDesig('Board'))), confidence: 0.95, status: 'approved', pillar: 'Management Control' });
      entities.push({ name: 'BlackExecutiveManagement', value: pct(blackPct(byDesig('Executive'))), confidence: 0.95, status: 'approved', pillar: 'Management Control' });
      entities.push({ name: 'BlackSeniorManagement', value: pct(blackPct(byDesig('Senior'))), confidence: 0.95, status: 'approved', pillar: 'Management Control' });
      entities.push({ name: 'BlackMiddleManagement', value: pct(blackPct(byDesig('Middle'))), confidence: 0.95, status: 'approved', pillar: 'Management Control' });
      entities.push({ name: 'BlackJuniorManagement', value: pct(blackPct(byDesig('Junior'))), confidence: 0.95, status: 'approved', pillar: 'Management Control' });
      entities.push({ name: 'TotalEmployees', value: `${parsed.employees.length}`, confidence: 0.95, status: 'approved', pillar: 'Management Control' });
    }

    // — Skills Development —
    const leviable = parsed.financials.leviableAmount || 0;
    const blackTraining = parsed.trainingPrograms.filter(t => t.isBlack).reduce((s, t) => s + (t.cost || 0), 0);
    const skillsPct = leviable > 0 ? (blackTraining / leviable) * 100 : 0;
    if (parsed.trainingPrograms.length > 0 || leviable > 0) {
      entities.push({ name: 'LeviableAmount', value: rand(leviable), confidence: 0.95, status: 'approved', pillar: 'Skills Development' });
      entities.push({ name: 'BlackSkillsSpend', value: rand(blackTraining), confidence: 0.95, status: 'approved', pillar: 'Skills Development' });
      entities.push({ name: 'SkillsSpendPercent', value: pct(skillsPct), confidence: 0.95, status: 'approved', pillar: 'Skills Development' });
      entities.push({ name: 'BlackLearnerships', value: `${parsed.trainingPrograms.filter(t => t.isBlack && t.category === 'learnership').length}`, confidence: 0.95, status: 'approved', pillar: 'Skills Development' });
    }

    // — Preferential Procurement —
    const allSpend = parsed.suppliers.reduce((s, sup) => s + (sup.spend || 0), 0);
    const tmps = (parsed.financials.tmps || 0) > 0 ? parsed.financials.tmps : allSpend;
    const LEVEL_W: Record<number, number> = { 1: 1, 2: 0.9, 3: 0.8, 4: 0.6, 5: 0.5, 6: 0.4, 7: 0.3, 8: 0.1 };
    const recognised = parsed.suppliers.reduce((s, sup) => s + (sup.spend || 0) * (LEVEL_W[sup.beeLevel] ?? 0), 0);
    const procPct = tmps > 0 ? (recognised / tmps) * 100 : 0;
    if (parsed.suppliers.length > 0) {
      entities.push({ name: 'TMPS', value: rand(tmps), confidence: 0.95, status: 'approved', pillar: 'Preferential Procurement' });
      entities.push({ name: 'RecognisedBEESpend', value: rand(recognised), confidence: 0.95, status: 'approved', pillar: 'Preferential Procurement' });
      entities.push({ name: 'ProcurementRecognition', value: pct(procPct), confidence: 0.95, status: 'approved', pillar: 'Preferential Procurement' });
      entities.push({ name: 'TotalSuppliers', value: `${parsed.suppliers.length}`, confidence: 0.95, status: 'approved', pillar: 'Preferential Procurement' });
      parsed.suppliers.forEach(sup => {
        entities.push({
          name: `Supplier — ${sup.name}`,
          value: `Level ${sup.beeLevel}, ${rand(sup.spend || 0)}`,
          confidence: 0.95, status: 'approved', pillar: 'Preferential Procurement',
        });
      });
    }

    // — ESD & SED —
    const npat = parsed.financials.npat || 0;
    const esdTotal = parsed.esdContributions.reduce((s, c) => s + c.amount, 0);
    const sedTotal = parsed.sedContributions.reduce((s, c) => s + c.amount, 0);
    if (npat > 0 || esdTotal > 0 || sedTotal > 0) {
      entities.push({ name: 'NPAT', value: rand(npat), confidence: 0.95, status: 'approved', pillar: 'Enterprise & Supplier Development' });
      entities.push({ name: 'ESDContributions', value: rand(esdTotal), confidence: 0.95, status: 'approved', pillar: 'Enterprise & Supplier Development' });
      entities.push({ name: 'SEDContributions', value: rand(sedTotal), confidence: 0.95, status: 'approved', pillar: 'Socio-Economic Development' });
    }

    // Financials summary
    if (parsed.financials.revenue > 0) {
      entities.push({ name: 'AnnualRevenue', value: rand(parsed.financials.revenue), confidence: 0.95, status: 'approved', pillar: 'General' });
    }

    return entities;
  };

  const startProcessing = async () => {
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

    // ── Pre-process CSV/Excel files directly (no GROQ needed) ──────────────
    let preHandledCount = 0;
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      if (!isCsvOrExcel(file)) continue;
      try {
        const parsed = await parseExcelClientSide(file.file);
        const entities = extractAllBbeeEntities(parsed);
        const templateId = fileClassifications[String(file.id)];
        const template = templates.find(t => t.id === templateId);
        handleEvent('doc-done', {
          index: i,
          fileName: file.name,
          templateId,
          templateName: template?.name || 'CSV Import',
          entities: entities.length > 0 ? entities : [
            { name: 'NoBbeeDataFound', value: 'No structured B-BBEE sheets detected', confidence: 0, status: 'pending' },
          ],
        });
        preHandledCount++;
      } catch (err: any) {
        handleEvent('doc-error', {
          index: i, fileName: file.name,
          templateId: fileClassifications[String(file.id)],
          templateName: 'CSV Import',
          entities: [{ name: 'ParseError', value: err.message || 'Could not parse file', confidence: 0, status: 'error' }],
        });
        preHandledCount++;
      }
    }

    // If all files were CSV/Excel, we're done — no API call needed
    if (preHandledCount >= uploadedFiles.length) return;

    // ── Only send non-CSV files to the API stream ──────────────────────────
    const apiDocuments = documents.filter((_, i) => !isCsvOrExcel(uploadedFiles[i]));
    if (apiDocuments.length === 0) return;

    fetch("/api/process-documents-stream", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: apiDocuments }), signal: controller.signal,
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

  // Called by PopulatingScreen when its animation completes
  const handlePopulatingDone = async () => {
    // Wait up to 8 s for the background API calls to finish
    let retries = 0;
    while (!populatingClientIdRef.current && !populatingErrorRef.current && retries < 32) {
      await new Promise<void>(r => setTimeout(r, 250));
      retries++;
    }
    if (populatingClientIdRef.current) {
      await persistSession('scorecard', { results: extractionResults, complete: true, scorecardResult });
      navigate(`/toolkit/${populatingClientIdRef.current}/scorecard`);
    } else {
      // API failed — fall back to local scorecard display
      await persistSession('scorecard', { results: extractionResults, complete: true, scorecardResult });
      setCurrentPage('scorecard');
    }
  };

  // ── Populating screen: full-screen early return ────────────────────────────
  if (currentPage === 'populating' && populatingData) {
    const fmt = (n: number) => `R ${Math.round(n).toLocaleString('en-ZA')}`;
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    const populatingPillars: PopulatingPillar[] = [
      {
        label: 'Ownership',
        color: '#5e9bff',
        icon: '○',
        entities: populatingData.shareholders.map(sh =>
          `${sh.name}  ·  ${pct(sh.blackOwnership || 0)} Black  ·  ${pct(sh.blackWomenOwnership || 0)} Black Women  ·  ${Math.round(sh.shares || 0)} shares`
        ),
      },
      {
        label: 'Management Control',
        color: '#34d399',
        icon: '○',
        entities: populatingData.employees.slice(0, 10).map(e =>
          `${e.name}  ·  ${e.designation}  ·  ${e.race}  ·  ${e.gender}`
        ),
      },
      {
        label: 'Skills Development',
        color: '#f59e0b',
        icon: '○',
        entities: populatingData.trainingPrograms.slice(0, 8).map(tp =>
          `${tp.name}  ·  ${fmt(tp.cost || 0)}  ·  ${tp.category}  ·  ${tp.isBlack ? 'Black' : 'Non-Black'}`
        ),
      },
      {
        label: 'Preferential Procurement',
        color: '#a78bfa',
        icon: '○',
        entities: populatingData.suppliers.slice(0, 8).map(s =>
          `${s.name}  ·  Level ${s.beeLevel}  ·  ${fmt(s.spend || 0)}`
        ),
      },
      {
        label: 'Enterprise & Supplier Development',
        color: '#38bdf8',
        icon: '○',
        entities: populatingData.esdContributions.map(c =>
          `${c.beneficiary}  ·  ${fmt(c.amount || 0)}  ·  ${c.category || 'enterprise_development'}`
        ),
      },
      {
        label: 'Socio-Economic Development',
        color: '#f472b6',
        icon: '○',
        entities: populatingData.sedContributions.map(c =>
          `${c.beneficiary}  ·  ${fmt(c.amount || 0)}`
        ),
      },
      {
        label: 'Financials',
        color: '#fb923c',
        icon: '○',
        entities: [
          populatingData.financials.revenue > 0 ? `Revenue  ·  ${fmt(populatingData.financials.revenue)}` : null,
          populatingData.financials.npat ? `NPAT  ·  ${fmt(populatingData.financials.npat)}` : null,
          populatingData.financials.leviableAmount > 0 ? `Leviable Amount  ·  ${fmt(populatingData.financials.leviableAmount)}` : null,
          populatingData.financials.tmps > 0 ? `Total Measured Procurement Spend  ·  ${fmt(populatingData.financials.tmps)}` : null,
        ].filter(Boolean) as string[],
      },
    ].filter(p => p.entities.length > 0);

    return (
      <div className="bg-[#0a0a0b] h-screen overflow-y-auto">
        <PopulatingScreen
          pillars={populatingPillars}
          totalEntities={populatingData.entityCount}
          companyName={companyInfo.name || 'Company'}
          onDone={handlePopulatingDone}
        />
      </div>
    );
  }

  return (
    <div className="bg-black text-white font-sans h-screen overflow-hidden flex flex-col" style={{ letterSpacing: '-0.011em' }}>

      <header className="h-12 shrink-0 z-20 sticky top-0 bg-black/95 backdrop-blur-xl" style={{ borderBottom: '1px solid #1c1c1e' }}>
        <div className="max-w-[1400px] mx-auto w-full px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-1.5 text-[#636366] hover:text-white transition-colors group shrink-0">
              <ChevronLeft className="h-4 w-4" />
              <span className="text-[13px] font-medium hidden sm:inline">Dashboard</span>
            </Link>
            <div className="w-px h-4 bg-[#1c1c1e]"></div>
            <span className="text-[14px] font-medium text-white">Document Processor</span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/builder" className="text-[13px] font-medium text-[#48484a] hover:text-white transition-colors px-3 py-1.5 rounded-lg" data-testid="link-builder-nav">
              Builder
            </Link>
            <div className="w-px h-4 bg-[#1c1c1e] mx-0.5"></div>
            <div className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-[12px]" data-testid="user-menu">
              <span className="inline-flex h-5 w-5 rounded-full bg-[#2c2c2e] items-center justify-center text-[#8e8e93] font-semibold text-[9px]">
                {(user?.fullName || user?.username || 'U').charAt(0).toUpperCase()}
              </span>
              <span className="text-[#8e8e93] font-medium">{user?.fullName || user?.username || ''}</span>
            </div>
            <button
              onClick={async () => { await logout(); navigate('/auth'); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] text-[#48484a] hover:text-[#8e8e93] transition-colors"
              data-testid="button-sign-out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="bg-black px-6 py-3" style={{ borderBottom: '1px solid #1c1c1e' }}>
        <div className="max-w-[1400px] mx-auto w-full flex items-center justify-between">
          {['Company', 'Upload', 'Template', 'Extract', 'Manual Entry', 'Review', 'Scorecard'].map((label, idx) => {
            const pageMap = ['company-info', 'upload', 'classify', 'extract', 'manual-entry', 'review', 'scorecard'] as const;
            type PageMapType = typeof pageMap[number];
            const safeCurrentPage = currentPage as PageMapType;
            const stepIdx = pageMap.indexOf(safeCurrentPage);
            const isComplete = idx < stepIdx;
            const isCurrent = idx === stepIdx;
            const canNavigate = isComplete && safeCurrentPage !== 'company-info';
            return (
              <React.Fragment key={label}>
                <div className={`flex items-center gap-2 ${canNavigate ? 'cursor-pointer group' : ''}`}
                  onClick={() => { if (canNavigate) setCurrentPage(pageMap[idx] as PageMapType); }}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${
                    isComplete
                      ? 'bg-white text-black group-hover:bg-[#d1d1d6]'
                      : isCurrent
                        ? 'bg-white text-black'
                        : 'bg-[#1c1c1e] text-[#48484a]'
                  }`}>
                    {isComplete ? <Check className="w-3 h-3" /> : idx + 1}
                  </div>
                  <span className={`text-[13px] font-medium hidden sm:inline transition-colors ${
                    isComplete
                      ? 'text-[#d1d1d6] group-hover:text-white'
                      : isCurrent
                        ? 'text-white'
                        : 'text-[#48484a]'
                  }`}>{label}</span>
                </div>
                {idx < 6 && (
                  <div className="flex-1 h-px mx-4" style={{ background: '#2c2c2e' }}>
                    <div className="h-full transition-all duration-700" style={{ width: isComplete ? '100%' : '0%', background: '#636366' }}></div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <main className={`flex-1 flex flex-col min-h-0 ${currentPage === 'review' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <div className={`${currentPage === 'review' ? 'flex-1 min-h-0 flex flex-col' : 'max-w-[1400px] mx-auto w-full'} p-6`}>

          {currentPage === 'company-info' && (
            <div>
              {isLoadingSession ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Loader2 className="w-8 h-8 text-[#636366] animate-spin" />
                  <p className="text-[#8e8e93] text-sm">Loading session...</p>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto w-full">

                  <div className="mb-10">
                    <h2 className="text-[28px] font-semibold text-white tracking-tight leading-tight">New Client Assessment</h2>
                    <p className="text-[#8e8e93] text-[15px] mt-1.5">Enter the client company's details before uploading documents.</p>
                  </div>

                  {/* ── Card ── */}
                  <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}>

                    {/* Section: Company Logo */}
                    <div className="px-6 py-5" style={{ borderBottom: '1px solid #1e1e1e' }}>
                      <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest mb-4">Company Logo</p>
                      <div className="flex items-center gap-5">
                        <div
                          className="w-[72px] h-[72px] rounded-2xl bg-[#1a1a1a] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer transition-colors hover:ring-2 hover:ring-[#48484a]/50"
                          style={{ border: '2px dashed #2c2c2e' }}
                          onClick={() => (document.getElementById('logo-input') as HTMLInputElement)?.click()}
                          data-testid="logo-upload-zone"
                        >
                          {companyInfo.logo
                            ? <img src={companyInfo.logo} alt="Company logo" className="w-full h-full object-contain" />
                            : <Building2 className="w-6 h-6 text-[#3a3a3c]" />}
                        </div>
                        <div>
                          <input id="logo-input" type="file" accept="image/*" className="hidden" data-testid="input-logo"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) { toast({ title: 'File too large', description: 'Logo must be under 2 MB.', variant: 'destructive' }); e.target.value = ''; return; }
                              const reader = new FileReader();
                              reader.onload = (ev) => setCompanyInfo(p => ({ ...p, logo: ev.target?.result as string }));
                              reader.readAsDataURL(file);
                              e.target.value = '';
                            }} />
                          <div className="flex items-center gap-2">
                            <button type="button"
                              onClick={() => (document.getElementById('logo-input') as HTMLInputElement)?.click()}
                              className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.09] text-[#d1d1d6] text-[12px] font-medium smooth press-sm border border-white/[0.08]"
                              data-testid="button-upload-logo">
                              {companyInfo.logo ? 'Change Logo' : 'Upload Logo'}
                            </button>
                            {companyInfo.logo && (
                              <button type="button"
                                onClick={() => setCompanyInfo(p => ({ ...p, logo: '' }))}
                                className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/15 text-red-400 text-[12px] font-medium smooth press-sm border border-red-500/10"
                                data-testid="button-remove-logo">
                                Remove
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-[#3a3a3c] mt-2">PNG, JPG or SVG · max 2 MB</p>
                        </div>
                      </div>
                    </div>

                    {/* Section: Company Details */}
                    <div className="px-6 py-5" style={{ borderBottom: '1px solid #1e1e1e' }}>
                      <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest mb-4">Company Details</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Company Name <span className="text-red-400">*</span></label>
                          <input type="text" value={companyInfo.name} onChange={(e) => setCompanyInfo(p => ({ ...p, name: e.target.value }))}
                            placeholder="e.g. Acme Holdings (Pty) Ltd"
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder-[#3a3a3c] focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all"
                            data-testid="input-company-name" autoFocus />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Registration Number</label>
                          <input type="text" value={companyInfo.registrationNumber} onChange={(e) => setCompanyInfo(p => ({ ...p, registrationNumber: e.target.value }))}
                            placeholder="e.g. 2021/123456/07"
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder-[#3a3a3c] focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all"
                            data-testid="input-company-regno" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Industry Sector <span className="text-red-400">*</span></label>
                          <select value={companyInfo.sector} onChange={(e) => setCompanyInfo(p => ({ ...p, sector: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all appearance-none"
                            data-testid="select-company-sector">
                            <option value="">Select a sector…</option>
                            {BBEE_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Annual Turnover (ZAR)</label>
                          <input type="text" value={companyInfo.annualTurnover} onChange={(e) => setCompanyInfo(p => ({ ...p, annualTurnover: e.target.value }))}
                            placeholder="e.g. R 50,000,000"
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder-[#3a3a3c] focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all"
                            data-testid="input-annual-turnover" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Number of Employees</label>
                          <input type="text" value={companyInfo.employees} onChange={(e) => setCompanyInfo(p => ({ ...p, employees: e.target.value }))}
                            placeholder="e.g. 150"
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder-[#3a3a3c] focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all"
                            data-testid="input-employees" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Financial Year End</label>
                          <select value={companyInfo.financialYearEnd} onChange={(e) => setCompanyInfo(p => ({ ...p, financialYearEnd: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all appearance-none"
                            data-testid="select-fye">
                            <option value="">Select month…</option>
                            {FYE_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Current B-BBEE Level</label>
                          <select value={companyInfo.currentBBEELevel} onChange={(e) => setCompanyInfo(p => ({ ...p, currentBBEELevel: e.target.value }))}
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all appearance-none"
                            data-testid="select-bbee-level">
                            <option value="">Select level…</option>
                            {BBEE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Physical Address</label>
                          <input type="text" value={companyInfo.address} onChange={(e) => setCompanyInfo(p => ({ ...p, address: e.target.value }))}
                            placeholder="e.g. 10 Mandela Square, Sandton, 2196"
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder-[#3a3a3c] focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all"
                            data-testid="input-address" />
                        </div>
                      </div>
                    </div>

                    {/* Section: Contact Person */}
                    <div className="px-6 py-5" style={{ borderBottom: '1px solid #1e1e1e' }}>
                      <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest mb-4">Contact Person</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Full Name</label>
                          <input type="text" value={companyInfo.contactName} onChange={(e) => setCompanyInfo(p => ({ ...p, contactName: e.target.value }))}
                            placeholder="e.g. Jane Dlamini"
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder-[#3a3a3c] focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all"
                            data-testid="input-contact-name" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Email Address</label>
                          <input type="email" value={companyInfo.contactEmail} onChange={(e) => setCompanyInfo(p => ({ ...p, contactEmail: e.target.value }))}
                            placeholder="e.g. jane@company.co.za"
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder-[#3a3a3c] focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all"
                            data-testid="input-contact-email" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#8e8e93] mb-1.5">Phone Number</label>
                          <input type="tel" value={companyInfo.contactPhone} onChange={(e) => setCompanyInfo(p => ({ ...p, contactPhone: e.target.value }))}
                            placeholder="e.g. +27 82 123 4567"
                            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder-[#3a3a3c] focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all"
                            data-testid="input-contact-phone" />
                        </div>
                      </div>
                    </div>

                    {/* Section: Notes */}
                    <div className="px-6 py-5">
                      <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest mb-4">Additional Notes</p>
                      <textarea value={companyInfo.notes} onChange={(e) => setCompanyInfo(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Any additional context about this client or assessment…"
                        rows={3}
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder-[#3a3a3c] focus:border-[#48484a] focus:outline-none focus:ring-1 focus:ring-[#48484a]/30 transition-all resize-none"
                        data-testid="input-notes" />
                    </div>

                  </div>
                  {/* ── End Card ── */}

                  {/* Submit */}
                  <button
                    onClick={async () => {
                      if (!companyInfo.name.trim() || !companyInfo.sector) {
                        toast({ title: "Missing information", description: "Please provide a company name and sector.", variant: "destructive" });
                        return;
                      }
                      setIsSavingSession(true);
                      const sid = sessionId || generateSessionId();
                      if (!sessionId) { setSessionId(sid); sessionCreatedAt.current = new Date().toISOString(); }
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
                    className="w-full mt-4 py-3 bg-white hover:bg-[#e5e5ea] disabled:bg-[#1a1a1a] disabled:text-[#3a3a3c] text-black rounded-xl font-semibold text-[13px] transition-colors"
                    data-testid="button-next-upload"
                  >
                    {isSavingSession
                      ? <><Loader2 className="w-3.5 h-3.5 mr-2 inline-block animate-spin" />Saving...</>
                      : 'Continue'}
                  </button>
                </div>
              )}
            </div>
          )}

          {currentPage === 'upload' && (
            <div className="max-w-2xl mx-auto w-full">
              <div className="mb-10">
                <h2 className="text-[28px] font-semibold text-white tracking-tight leading-tight">Upload Documents</h2>
                <p className="text-[#8e8e93] text-[15px] mt-1.5">Drag and drop files or click to browse.</p>
              </div>

              {templates.length === 0 && !loadingTemplates && (
                <div className="rounded-xl p-4 mb-6 flex items-start gap-3" style={{ background: '#1a1a1a', border: '1px solid #2c2c2e' }}>
                  <AlertTriangle className="w-4 h-4 text-[#8e8e93] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[#d1d1d6]">No templates available</p>
                    <p className="text-xs text-[#636366] mt-1">Create a template in the Entity Builder first. <Link href="/builder" className="underline text-white">Go to Builder</Link></p>
                  </div>
                </div>
              )}

              <div
                className="rounded-2xl text-center transition-all cursor-pointer mb-8"
                style={{
                  background: '#111111',
                  border: `1px dashed ${isDragActive ? '#636366' : '#2c2c2e'}`,
                  padding: uploadedFiles.length > 0 ? '16px' : '48px 24px',
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragActive(false); }}
                onDrop={(e) => { e.preventDefault(); setIsDragActive(false); if (e.dataTransfer.files?.length) handleFiles(Array.from(e.dataTransfer.files)); }}
                onClick={() => document.getElementById('fileInput')?.click()} data-testid="drop-zone"
              >
                <input type="file" id="fileInput" multiple className="hidden" accept=".pdf,.txt,.csv,.doc,.docx,.xlsx,.xls,.eml,.json"
                  onChange={(e) => { if (e.target.files?.length) handleFiles(Array.from(e.target.files)); }} />
                {uploadedFiles.length === 0 ? (
                  <>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform ${isDragActive ? 'scale-105' : ''}`} style={{ background: '#1c1c1e', border: '1px solid #2c2c2e' }}>
                      <CloudUpload className="w-6 h-6 text-[#636366]" />
                    </div>
                    <h3 className="text-[15px] font-medium text-white mb-1">Drop files here</h3>
                    <p className="text-[13px] text-[#636366] mb-4">or click to browse</p>
                    <div className="flex items-center justify-center gap-1.5 text-[11px]">
                      {['PDF', 'XLSX', 'CSV', 'DOCX', 'TXT'].map(ext => (
                        <span key={ext} className="px-2 py-0.5 rounded text-[#48484a]" style={{ background: '#1c1c1e' }}>{ext}</span>
                      ))}
                    </div>
                  </>
                ) : /* files uploaded – compact "add more" prompt */ (
                  <div className="flex items-center justify-center gap-2 text-[#636366] hover:text-[#8e8e93] transition-colors">
                    <Plus className="w-4 h-4" />
                    <span className="text-[13px] font-medium">Add more files</span>
                  </div>
                )}
              </div>

              {uploadedFiles.length === 0 && (
                <div className="mt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-[#2c2c2e]" />
                    <span className="text-[11px] text-[#48484a] font-medium uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-[#2c2c2e]" />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCurrentPage('manual-entry'); }}
                    className="w-full py-3.5 rounded-xl text-[14px] font-semibold transition-all flex items-center justify-center gap-2.5 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[#d1d1d6] hover:text-white"
                    style={{ border: '1px solid #2c2c2e' }}
                    data-testid="button-skip-to-manual-empty"
                  >
                    <ClipboardEdit className="w-4 h-4" />
                    Skip Upload — Enter Data Manually
                  </button>
                  <p className="text-[11px] text-[#48484a] text-center mt-2">No documents? You can enter all scorecard data by hand.</p>
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => setCurrentPage('company-info')}
                      className="flex-1 px-5 py-3 bg-[#1c1c1e] text-[#8e8e93] hover:text-white rounded-xl text-[13px] font-medium transition-colors" data-testid="button-back-company-info-empty">
                      Back
                    </button>
                  </div>
                </div>
              )}

              {uploadedFiles.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[13px] font-medium text-[#8e8e93]">
                      {uploadedFiles.length} document{uploadedFiles.length !== 1 ? 's' : ''}
                      {!allReady && <span className="text-[#636366] ml-2 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Processing...</span>}
                    </p>
                    <button onClick={() => { setUploadedFiles([]); setFileClassifications({}); }} className="text-[12px] text-[#48484a] hover:text-[#8e8e93] transition-colors" data-testid="button-clear-all">
                      Clear all
                    </button>
                  </div>
                  <div className="space-y-1.5 mb-8">
                    {uploadedFiles.map((file) => (
                      <div key={file.id} className={`rounded-xl px-4 py-3 flex items-center gap-3 transition-all ${file.status === 'uploading' ? 'opacity-70' : ''}`} style={{ background: '#111111', border: '1px solid #1c1c1e' }} data-testid={`file-row-${file.id}`}>
                        <div className="shrink-0">
                          <FileFormatBadge type={file.type} size="sm" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-white truncate">{file.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-[#48484a]">{file.size}</span>
                            {file.status === 'uploading' && (
                              <div className="flex-1 h-0.5 bg-[#2c2c2e] rounded-full overflow-hidden max-w-[100px]">
                                <div className="h-full bg-white transition-all rounded-full" style={{ width: `${file.uploadProgress}%` }}></div>
                              </div>
                            )}
                            {file.status === 'ready' && <Check className="w-3 h-3 text-[#636366]" />}
                          </div>
                        </div>
                        <button onClick={() => removeFile(file.id)} className="p-1.5 text-[#3a3a3c] hover:text-[#8e8e93] rounded-lg transition-colors" data-testid={`button-remove-${file.id}`}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setCurrentPage('company-info')}
                      className="px-5 py-3 bg-[#1c1c1e] text-[#8e8e93] hover:text-white rounded-xl text-[13px] font-medium transition-colors" data-testid="button-back-company-info">
                      Back
                    </button>
                    <button onClick={async () => { if (allReady && !isSavingSession) { setIsSavingSession(true); await persistSession('classify'); setIsSavingSession(false); setCurrentPage('classify'); } }} disabled={!allReady || isSavingSession}
                      className="flex-1 py-3 bg-white hover:bg-[#e5e5ea] disabled:bg-[#1c1c1e] disabled:text-[#48484a] text-black rounded-xl font-semibold text-[13px] transition-colors" data-testid="button-next-classify">
                      {isSavingSession ? <><Loader2 className="w-3.5 h-3.5 mr-2 inline-block animate-spin" />Saving...</> : 'Continue'}
                    </button>
                  </div>
                  <button
                    onClick={() => setCurrentPage('manual-entry')}
                    className="w-full mt-3 py-2.5 text-[13px] font-medium text-[#636366] hover:text-[#8e8e93] transition-colors flex items-center justify-center gap-2"
                    data-testid="button-skip-to-manual"
                  >
                    <ClipboardEdit className="w-3.5 h-3.5" />
                    Skip to Manual Entry
                  </button>
                </>
              )}
            </div>
          )}

          {currentPage === 'classify' && (
            <div className="max-w-2xl mx-auto w-full">
              <div className="mb-10">
                <h2 className="text-[28px] font-semibold text-white tracking-tight leading-tight">Assign Templates</h2>
                <p className="text-[#8e8e93] text-[15px] mt-1.5">Select a template for each document to define the fields to extract.</p>
              </div>

              <div className="space-y-2 mb-10">
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
                          className="rounded-2xl transition-all"
                          style={{
                            background: '#111111',
                            border: `1px solid ${selectedTemplate ? '#3a3a3c' : '#222224'}`,
                            position: 'relative',
                            zIndex: isDropdownOpen ? 50 : 1,
                          }}
                          data-testid={`classify-row-${file.id}`}
                        >
                          <div className="flex items-center gap-4 p-4">
                            <div className="shrink-0">
                              <FileFormatBadge type={file.type} size="md" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="text-[14px] font-medium text-white truncate leading-tight">{file.name}</div>
                              <div className="text-[12px] text-[#636366] mt-0.5">{file.size}</div>
                            </div>

                            <button
                              onClick={() => removeFile(file.id)}
                              className="shrink-0 p-1.5 rounded-lg text-[#3a3a3c] hover:text-[#8e8e93] transition-colors"
                              data-testid={`button-remove-${file.id}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="px-4 pb-4 space-y-3">
                            <div className="relative" data-testid={`select-template-${file.id}`}>
                              <button
                                type="button"
                                onClick={() => setOpenTemplateDropdown(prev => prev === String(file.id) ? null : String(file.id))}
                                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all"
                                style={{
                                  background: selectedTemplate ? '#1a1a1a' : '#0c0c0c',
                                  border: `1px solid ${selectedTemplate ? '#3a3a3c' : '#222224'}`,
                                  color: selectedTemplate ? '#ffffff' : '#636366',
                                }}
                              >
                                <span className="flex-1 truncate">
                                  {selectedTemplate ? selectedTemplate.name : 'Select template...'}
                                </span>
                                {selectedTemplate && (
                                  <span className="text-[11px] text-[#636366] shrink-0">{selectedTemplate.entities.length} fields</span>
                                )}
                                <svg className={`w-4 h-4 shrink-0 text-[#48484a] transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 16 16" fill="none">
                                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>

                              {isDropdownOpen && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setOpenTemplateDropdown(null)} />
                                  <div
                                    className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
                                    style={{ background: '#1c1c1e', border: '1px solid #2c2c2e', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
                                  >
                                    <div className="max-h-56 overflow-y-auto py-1">
                                      {loadingTemplates ? (
                                        <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-[#636366]">
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                                        </div>
                                      ) : templates.length === 0 ? (
                                        <div className="px-4 py-3 text-[13px] text-[#48484a]">No templates yet. Create one in Builder.</div>
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
                                              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[#2c2c2e]"
                                            >
                                              <div className="flex-1 min-w-0">
                                                <div className={`text-[13px] font-medium truncate ${isSel ? 'text-white' : 'text-[#d1d1d6]'}`}>{t.name}</div>
                                                <div className="text-[11px] text-[#48484a]">{t.entities.length} field{t.entities.length !== 1 ? 's' : ''} · v{t.version}</div>
                                              </div>
                                              {isSel && <Check className="w-4 h-4 text-white shrink-0" />}
                                            </button>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="flex rounded-lg overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid #222224' }} data-testid={`select-doctype-${file.id}`}>
                              <button
                                type="button"
                                onClick={() => setFileDocTypes(prev => ({ ...prev, [String(file.id)]: 'digital' }))}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-all ${
                                  !isScanned ? 'bg-[#1c1c1e] text-white' : 'text-[#48484a] hover:text-[#636366]'
                                }`}
                              >
                                <Monitor className="w-3 h-3" />
                                Digital
                              </button>
                              <div className="w-px" style={{ background: '#222224' }} />
                              <button
                                type="button"
                                onClick={() => setFileDocTypes(prev => ({ ...prev, [String(file.id)]: 'scanned' }))}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-all ${
                                  isScanned ? 'bg-[#1c1c1e] text-white' : 'text-[#48484a] hover:text-[#636366]'
                                }`}
                              >
                                <ScanLine className="w-3 h-3" />
                                Scanned
                              </button>
                            </div>

                            {selectedTemplate && selectedTemplate.entities.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {selectedTemplate.entities.slice(0, 5).map((ent, i) => (
                                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-md font-medium text-[#636366]" style={{ background: '#1a1a1a' }}>{ent.label}</span>
                                ))}
                                {selectedTemplate.entities.length > 5 && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium text-[#48484a]" style={{ background: '#1a1a1a' }}>+{selectedTemplate.entities.length - 5}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setCurrentPage('upload')} className="px-5 py-3 bg-[#1c1c1e] text-[#8e8e93] hover:text-white rounded-xl text-[13px] font-medium transition-colors" data-testid="button-back-upload">
                  Back
                </button>
                <button onClick={async () => { if (allClassified && !isSavingSession) { setIsSavingSession(true); await persistSession('extract'); setIsSavingSession(false); setCurrentPage('extract'); } }} disabled={!allClassified || isSavingSession}
                  className="flex-1 py-3 bg-white hover:bg-[#e5e5ea] disabled:bg-[#1c1c1e] disabled:text-[#48484a] text-black rounded-xl font-semibold text-[13px] transition-colors" data-testid="button-next-extract">
                  {isSavingSession ? <><Loader2 className="w-3.5 h-3.5 mr-2 inline-block animate-spin" />Saving...</> : 'Continue'}
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
              <div className="max-w-2xl mx-auto w-full">
                <div className="mb-10">
                  <h2 className="text-[28px] font-semibold text-white tracking-tight leading-tight">
                    {anyProcessing ? 'Extracting...' : allDone ? 'Extraction Complete' : 'Ready to Extract'}
                  </h2>
                  <p className="text-[#8e8e93] text-[15px] mt-1.5">
                    {anyProcessing ? `Processing ${Object.values(docStatuses).filter(s => s === 'processing').length} of ${uploadedFiles.length} documents` :
                     allDone ? 'All entities have been extracted from your documents.' :
                     `${allEntities.length} entities will be extracted from ${uploadedFiles.length} document${uploadedFiles.length !== 1 ? 's' : ''}.`}
                  </p>
                </div>

                {!anyProcessing && !allDone && (
                  <div className="rounded-2xl p-5 mb-6" style={{ background: '#111111', border: '1px solid #1c1c1e' }}>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[13px] font-medium text-[#8e8e93]">Entities to Extract</span>
                      <span className="text-[12px] text-[#48484a] ml-auto">{allEntities.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {allEntities.map((ent) => (
                        <div key={ent.label} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#1a1a1a' }}>
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-[#d1d1d6]">{ent.label}</span>
                            {ent.definition && <p className="text-[11px] text-[#48484a] mt-0.5 line-clamp-1">{ent.definition}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 mb-8">
                  {uploadedFiles.map((file, idx) => {
                    const status = docStatuses[idx] || 'waiting';
                    const tid = fileClassifications[String(file.id)];
                    const tmpl = templates.find(t => t.id === tid);
                    return (
                      <div key={file.id} className="rounded-xl px-4 py-3 flex items-center gap-3 transition-all" style={{ background: '#111111', border: `1px solid ${status === 'done' ? '#2c2c2e' : '#1c1c1e'}` }} data-testid={`extract-row-${idx}`}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#1c1c1e' }}>
                          {status === 'waiting' && <Circle className="w-2 h-2 text-[#48484a]" />}
                          {status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-[#8e8e93] animate-spin" />}
                          {status === 'done' && <Check className="w-3.5 h-3.5 text-white" />}
                          {status === 'error' && <X className="w-3.5 h-3.5 text-[#8e8e93]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-white truncate">{file.name}</div>
                          <div className="text-[11px] text-[#48484a] mt-0.5">
                            {status === 'processing' ? 'Extracting...' : status === 'done' ? 'Complete' : status === 'error' ? 'Failed' : tmpl ? tmpl.name : ''}
                          </div>
                        </div>
                        {status === 'done' && <Check className="w-3.5 h-3.5 text-[#636366] shrink-0" />}
                      </div>
                    );
                  })}
                </div>

                {anyProcessing && (
                  <div className="max-w-md mx-auto mb-8">
                    <div className="h-1 bg-[#1c1c1e] rounded-full overflow-hidden">
                      <div className="h-full bg-white transition-all duration-500 rounded-full" style={{ width: `${uploadedFiles.length > 0 ? (Object.values(docStatuses).filter(s => s === 'done').length / uploadedFiles.length) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => { if (!anyProcessing) setCurrentPage('classify'); }} disabled={anyProcessing}
                    className="px-5 py-3 bg-[#1c1c1e] text-[#8e8e93] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-[13px] font-medium transition-colors" data-testid="button-back-classify">
                    Back
                  </button>
                  {!allDone && (
                    <button onClick={startProcessing} disabled={anyProcessing}
                      className="flex-1 py-3 bg-white hover:bg-[#e5e5ea] disabled:bg-[#1c1c1e] disabled:text-[#48484a] text-black rounded-xl font-semibold text-[13px] transition-colors" data-testid="button-start-extract">
                      {anyProcessing ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 inline-block animate-spin" />Extracting...</>
                      ) : 'Extract All'}
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
                    className="flex-1 py-3 bg-white hover:bg-[#e5e5ea] text-black rounded-xl font-semibold text-[13px] transition-colors" data-testid="button-go-review">
                      Review Results
                    </button>
                  )}
                </div>
              </div>
            );
          })()}


          {currentPage === 'review' && extractionResults.length > 0 && (() => {
            const isLastDoc = activeReviewDoc === extractionResults.length - 1;
            const allSaved = savedDocs.size >= extractionResults.length;

            const handleSave = async () => {
              setIsSavingSession(true);
              await persistSession('review', { results: extractionResults, complete: false });
              setSavedDocs(prev => new Set([...prev, activeReviewDoc]));
              setIsSavingSession(false);
              toast({ title: "Saved", description: `Document ${activeReviewDoc + 1} review saved.` });
            };

            const handleNext = async () => {
              setIsSavingSession(true);
              await persistSession('review', { results: extractionResults, complete: false });
              setSavedDocs(prev => new Set([...prev, activeReviewDoc]));
              setIsSavingSession(false);
              setActiveReviewDoc(prev => prev + 1);
              setHoveredEntity(null);
              setReviewFilter('all');
              setEditingEntity(null);
              setDocFullView(false);
            };
            const handleSubmit = async () => {
              setIsSavingSession(true);

              try {
                // 1. Check if any uploaded file is CSV or Excel — use direct client-side parsing
                const csvExcelFiles = uploadedFiles.filter(f => {
                  const name = f.name.toLowerCase();
                  return name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls') ||
                    f.file.type === 'text/csv' ||
                    f.file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                    f.file.type === 'application/vnd.ms-excel';
                });

                if (csvExcelFiles.length > 0) {
                  // Parse CSV/Excel files directly — no AI needed
                  let combinedResult: ClientSideImportResult | null = null;
                  for (const file of csvExcelFiles) {
                    try {
                      const parsed = await parseExcelClientSide(file.file);
                      if (parsed.entityCount > 0) {
                        combinedResult = parsed;
                        break;
                      }
                    } catch { /* try next file */ }
                  }

                  if (combinedResult && combinedResult.entityCount > 0) {
                    const result = buildScorecardFromCsvImport(combinedResult);
                    setScorecardResult(result);

                    // Fire off API calls in the background while the populating screen animates
                    populatingClientIdRef.current = null;
                    populatingErrorRef.current = false;

                    const turnoverRaw = companyInfo.annualTurnover.replace(/[^\d.]/g, '');
                    const revenue = combinedResult.financials.revenue > 0
                      ? combinedResult.financials.revenue
                      : (parseFloat(turnoverRaw) || 0);

                    (async () => {
                      try {
                        const clientRes = await fetch('/api/clients', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: companyInfo.name || 'Imported Company',
                            financialYear: companyInfo.financialYearEnd || new Date().getFullYear().toString(),
                            industrySector: companyInfo.sector || null,
                            revenue,
                            npat: combinedResult.financials.npat || 0,
                            leviableAmount: combinedResult.financials.leviableAmount || 0,
                          }),
                        });
                        if (!clientRes.ok) throw new Error('Failed to create client');
                        const newClient = await clientRes.json();
                        const toolkitClientId = newClient.clientId;

                        const importRes = await fetch(`/api/clients/${toolkitClientId}/bulk-import`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            shareholders: combinedResult.shareholders,
                            employees: combinedResult.employees,
                            trainingPrograms: combinedResult.trainingPrograms,
                            suppliers: combinedResult.suppliers,
                            esdContributions: combinedResult.esdContributions,
                            sedContributions: combinedResult.sedContributions,
                            financials: combinedResult.financials,
                          }),
                        });
                        if (!importRes.ok) throw new Error('Bulk import failed');

                        populatingClientIdRef.current = toolkitClientId;
                      } catch (err) {
                        console.error('Background import failed:', err);
                        populatingErrorRef.current = true;
                      }
                    })();

                    // Show the populating animation screen
                    setPopulatingData(combinedResult);
                    setCurrentPage('populating');
                    setIsSubmitted(true);
                    setIsSavingSession(false);
                    return;
                  }
                }

                // 2. Fall back to API-based extraction (requires GROQ_API_KEY)
                const documentTexts = uploadedFiles
                  .filter(file => file.textContent)
                  .map(file => file.textContent);

                const sectorCode = 'RCOGP';
                const scorecardType = parseFloat(companyInfo.annualTurnover.replace(/[^\d]/g, '')) <= 50000000 ? 'QSE' : 'Generic';

                const res = await fetch('/api/extract-and-score', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ documentTexts, sectorCode, scorecardType, clientName: companyInfo.name }),
                });

                if (!res.ok) throw new Error('API scoring failed');

                const scoreData = await res.json();

                // Normalise the API response into the pillar-keyed format
                const pillarsById: Record<string, any> = {};
                if (scoreData.scorecard?.pillars) {
                  for (const p of scoreData.scorecard.pillars) {
                    const key = p.pillar.toLowerCase().replace(/[^a-z]/g, '');
                    pillarsById[key] = p;
                  }
                }
                const totalScore = scoreData.scorecard?.totalScore || 0;
                const normalised = {
                  ownership: { score: pillarsById['ownership']?.weightedScore || 0, target: 25, weighting: 25, subMinimumMet: false },
                  managementControl: { score: pillarsById['managementcontrol']?.weightedScore || 0, target: 19, weighting: 19 },
                  skillsDevelopment: { score: pillarsById['skillsdevelopment']?.weightedScore || 0, target: 25, weighting: 25, subMinimumMet: false },
                  procurement: { score: pillarsById['enterprisesupplierdevelopment']?.subItems?.[0]?.score || 0, target: 29, weighting: 29, subMinimumMet: false },
                  supplierDevelopment: { score: pillarsById['enterprisesupplierdevelopment']?.subItems?.[1]?.score || 0, target: 10, weighting: 10, subMinimumMet: false },
                  enterpriseDevelopment: { score: 0, target: 7, weighting: 7, subMinimumMet: false },
                  socioEconomicDevelopment: { score: pillarsById['socioeconomicdevelopment']?.weightedScore || 0, target: 5, weighting: 5 },
                  yesInitiative: { score: 0, target: 5, weighting: 5 },
                  total: { score: totalScore, target: 120, weighting: 120 },
                  achievedLevel: bbeeLevel(totalScore),
                  discountedLevel: bbeeLevel(totalScore),
                  isDiscounted: false,
                  recognitionLevel: bbeeRecognition(bbeeLevel(totalScore)),
                  _source: 'api_extraction',
                };

                setScorecardResult(normalised);
                await persistSession('scorecard', { results: extractionResults, complete: true, scorecardResult: normalised });
                setIsSubmitted(true);
                setCurrentPage('scorecard');
                toast({ title: "Assessment complete", description: "Scorecard generated successfully!" });

              } catch (err: any) {
                console.error("Scorecard generation error", err);
                // Build a basic scorecard from whatever extraction results we have
                const extractedData: Record<string, any> = {};
                for (const doc of extractionResults) {
                  for (const entity of (doc.entities || [])) {
                    if (entity.status !== 'rejected' && entity.value) {
                      extractedData[entity.name] = entity.value;
                    }
                  }
                }
                const fallback = {
                  ownership: { score: 0, target: 25, weighting: 25, subMinimumMet: false },
                  managementControl: { score: 0, target: 19, weighting: 19 },
                  skillsDevelopment: { score: 0, target: 25, weighting: 25, subMinimumMet: false },
                  procurement: { score: 0, target: 29, weighting: 29, subMinimumMet: false },
                  supplierDevelopment: { score: 0, target: 10, weighting: 10, subMinimumMet: false },
                  enterpriseDevelopment: { score: 0, target: 7, weighting: 7, subMinimumMet: false },
                  socioEconomicDevelopment: { score: 0, target: 5, weighting: 5 },
                  yesInitiative: { score: 0, target: 5, weighting: 5 },
                  total: { score: 0, target: 120, weighting: 120 },
                  achievedLevel: 9,
                  discountedLevel: 9,
                  isDiscounted: false,
                  recognitionLevel: '0%',
                  _source: 'fallback',
                  _error: err.message,
                };
                setScorecardResult(fallback);
                await persistSession('scorecard', { results: extractionResults, complete: true, scorecardResult: fallback });
                setIsSubmitted(true);
                setCurrentPage('scorecard');
                toast({ title: "Partial Scorecard", description: "Scorecard generated from reviewed entities.", variant: "default" });
              } finally {
                setIsSavingSession(false);
              }
            };
            return (
            <div className="flex flex-col flex-1 min-h-0 -m-6">
              <div className="px-6 py-4 flex items-center justify-between bg-black shrink-0" style={{ borderBottom: '1px solid #2c2c2e' }}>
                <div className="flex items-center gap-4">
                  <button onClick={() => {
                    if (activeReviewDoc > 0) { setActiveReviewDoc(prev => prev - 1); setHoveredEntity(null); setReviewFilter('all'); setEditingEntity(null); }
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
                  {/* Save button */}
                  <button onClick={handleSave} disabled={isSavingSession || isSubmitted}
                    className={`px-3.5 py-2 rounded-[10px] font-semibold text-[13px] smooth press-sm flex items-center gap-1.5 border transition-colors
                      ${savedDocs.has(activeReviewDoc)
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/15'
                        : 'bg-[#1c1c1e] border-[#2c2c2e] text-[#d1d1d6] hover:text-white hover:border-[#48484a]'}
                      disabled:opacity-40 disabled:cursor-not-allowed`}
                    data-testid="button-save-doc">
                    {isSavingSession
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                      : savedDocs.has(activeReviewDoc)
                        ? <><Check className="w-3.5 h-3.5" />Saved</>
                        : <><Save className="w-3.5 h-3.5" />Save</>}
                  </button>

                  {/* Next button */}
                  <button onClick={handleNext} disabled={isLastDoc || isSavingSession || isSubmitted}
                    className="px-3.5 py-2 bg-[#1c1c1e] border border-[#2c2c2e] hover:border-[#48484a] text-[#d1d1d6] hover:text-white rounded-[10px] font-semibold text-[13px] smooth press-sm flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                    data-testid="button-next-doc">
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {/* Submit button — only enabled once all docs are saved */}
                  <button onClick={handleSubmit} disabled={!allSaved || isSubmitted || isSavingSession}
                    title={!allSaved ? `Save all ${extractionResults.length} document${extractionResults.length > 1 ? 's' : ''} before submitting` : undefined}
                    className={`px-4 py-2 rounded-[10px] font-semibold text-[13px] smooth press-sm flex items-center gap-1.5 transition-colors
                      ${isSubmitted
                        ? 'bg-green-600 text-white'
                        : allSaved
                          ? 'bg-white/[0.12] hover:bg-white/[0.18] text-white'
                          : 'bg-[#1c1c1e] border border-[#2c2c2e] text-[#48484a] cursor-not-allowed'}
                      disabled:opacity-60`}
                    data-testid="button-submit">
                    {isSavingSession
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                      : isSubmitted
                        ? <><Check className="w-3.5 h-3.5" />Complete</>
                        : <><Send className="w-3.5 h-3.5" />Submit</>}
                  </button>
                </div>
              </div>

              <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className={`${docFullView ? 'w-full' : 'w-1/2'} overflow-y-auto bg-[#f5f5f5] flex flex-col transition-all duration-200`} style={docFullView ? {} : { borderRight: '1px solid #2c2c2e' }}>
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
                      {activeFileType === 'text' && <span className="text-xs text-gray-400">{activeDocText.length.toLocaleString()} chars</span>}
                      <button
                        onClick={() => setDocFullView(v => !v)}
                        title={docFullView ? 'Split view' : 'Full document view'}
                        className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 smooth press-sm transition-colors">
                        {docFullView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
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

                <div className={`${docFullView ? 'hidden' : 'w-1/2'} overflow-y-auto bg-black`}>
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
                        const isEditingThis = editingEntity?.docIdx === activeReviewDoc && editingEntity?.entityIdx === realIdx;

                        const startEdit = () => setEditingEntity({ docIdx: activeReviewDoc, entityIdx: realIdx, draft: entity.value || '' });
                        const cancelEdit = () => setEditingEntity(null);
                        const saveEdit = () => {
                          if (editingEntity && editingEntity.draft !== entity.value) {
                            inlineEditEntity(activeReviewDoc, realIdx, editingEntity.draft);
                          }
                          setEditingEntity(null);
                        };

                        return (
                          <div key={realIdx}
                            className={`rounded-2xl border transition-all duration-150 group ${
                              isEditingThis ? 'border-white/[0.16] shadow-[0_0_0_3px_rgba(168,85,247,0.08)]' :
                              isApproved ? 'border-green-500/25' :
                              isRejected ? 'border-[#2c2c2e] opacity-35' :
                              isHovered ? 'border-[#3a3a3c]' : 'border-[#2c2c2e]'
                            }`}
                            onMouseEnter={() => setHoveredEntity(realIdx)}
                            onMouseLeave={() => setHoveredEntity(null)}
                            data-testid={`review-entity-${realIdx}`}
                          >
                            <div className="bg-[#1c1c1e] rounded-2xl px-4 py-3.5">

                              {/* Header row */}
                              <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest truncate">
                                    {fmtLabel(entity.name)}
                                  </span>
                                  {isApproved && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-green-400 font-medium shrink-0">
                                      <Check className="w-2.5 h-2.5" />Approved
                                    </span>
                                  )}
                                  {isEdited && !isEditingThis && (
                                    <span className="text-[10px] text-[#d1d1d6] font-medium shrink-0">Edited</span>
                                  )}
                                  {isRejected && (
                                    <span className="text-[10px] text-red-400 font-medium shrink-0">Rejected</span>
                                  )}
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {/* Pen — always dimly visible, brightens on hover */}
                                  {!isEditingThis && (
                                    <button
                                      onClick={startEdit}
                                      className="p-1.5 rounded-lg smooth press-sm text-[#3a3a3c] hover:text-[#8e8e93] hover:bg-[#2c2c2e]"
                                      title="Edit value"
                                      data-testid={`button-edit-${realIdx}`}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Definition */}
                              {def && !isEditingThis && (
                                <p className="text-[10px] text-[#48484a] leading-relaxed mb-2 line-clamp-2">{def}</p>
                              )}

                              {/* Value — read mode */}
                              {!isEditingThis && (
                                <div
                                  onClick={startEdit}
                                  className="cursor-text rounded-xl px-3 py-2 mb-3 transition-colors hover:bg-[#2c2c2e]/60"
                                  title="Click to edit"
                                >
                                  {entity.value ? (
                                    <p className="text-[14px] text-white leading-snug break-words">{entity.value}</p>
                                  ) : (
                                    <p className="text-[13px] text-[#3a3a3c] italic flex items-center gap-1.5">
                                      <Plus className="w-3 h-3" />Add value
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Value — edit mode */}
                              {isEditingThis && (
                                <div className="space-y-2 mb-3">
                                  {def && (
                                    <p className="text-[10px] text-[#48484a] leading-relaxed line-clamp-2">{def}</p>
                                  )}
                                  <textarea
                                    autoFocus
                                    value={editingEntity.draft}
                                    onChange={(e) => setEditingEntity(prev => prev ? { ...prev, draft: e.target.value } : null)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                    rows={Math.min(Math.max((editingEntity.draft.match(/\n/g) || []).length + 1, 1), 4)}
                                    placeholder="Enter value…"
                                    className="w-full text-[14px] text-white bg-[#2c2c2e] rounded-xl px-3 py-2.5 border border-white/[0.16] focus:border-white/[0.25] focus:outline-none resize-none transition-colors placeholder:text-[#48484a]"
                                    data-testid={`input-entity-value-${realIdx}`}
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={cancelEdit}
                                      className="px-3 py-1.5 text-[12px] font-medium text-[#8e8e93] hover:text-white rounded-lg hover:bg-[#2c2c2e] smooth press-sm">
                                      Cancel
                                    </button>
                                    <button onClick={saveEdit}
                                      className="px-3 py-1.5 text-[12px] font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] rounded-lg smooth press-sm flex items-center gap-1"
                                      data-testid={`button-save-entity-${realIdx}`}>
                                      <Check className="w-3 h-3" />Save
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Approve / Reject — always visible bottom action bar */}
                              {!isEditingThis && (
                                <div className="flex items-center gap-2 pt-2.5" style={{ borderTop: '1px solid #2c2c2e' }}>
                                  {isApproved ? (
                                    <button
                                      onClick={() => approveEntity(activeReviewDoc, realIdx)}
                                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[12px] font-semibold text-green-400 bg-green-500/10 smooth press-sm"
                                      data-testid={`button-approve-${realIdx}`}
                                    >
                                      <Check className="w-3.5 h-3.5" />Approved
                                    </button>
                                  ) : isRejected ? null : (
                                    <button
                                      onClick={() => approveEntity(activeReviewDoc, realIdx)}
                                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[12px] font-medium text-[#636366] hover:text-green-400 hover:bg-green-500/10 border border-[#2c2c2e] hover:border-green-500/20 smooth press-sm"
                                      data-testid={`button-approve-${realIdx}`}
                                    >
                                      <Check className="w-3.5 h-3.5" />Approve
                                    </button>
                                  )}
                                  {isRejected ? (
                                    <button
                                      onClick={() => rejectEntity(activeReviewDoc, realIdx)}
                                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[12px] font-semibold text-red-400 bg-red-500/10 smooth press-sm"
                                      data-testid={`button-reject-${realIdx}`}
                                    >
                                      <X className="w-3.5 h-3.5" />Rejected
                                    </button>
                                  ) : isApproved ? null : (
                                    <button
                                      onClick={() => rejectEntity(activeReviewDoc, realIdx)}
                                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[12px] font-medium text-[#636366] hover:text-red-400 hover:bg-red-500/10 border border-[#2c2c2e] hover:border-red-500/20 smooth press-sm"
                                      data-testid={`button-reject-${realIdx}`}
                                    >
                                      <X className="w-3.5 h-3.5" />Reject
                                    </button>
                                  )}
                                </div>
                              )}

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

          {currentPage === 'manual-entry' && (
            <div className="max-w-2xl mx-auto w-full">
              <div className="mb-10">
                <h2 className="text-[28px] font-semibold text-white tracking-tight leading-tight">Manual Data Entry</h2>
                <p className="text-[#8e8e93] text-[15px] mt-1.5">Enter B-BBEE metrics directly to generate a scorecard without document extraction.</p>
              </div>

              <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0d0d', border: '1px solid #1e1e1e' }}>

                <div className="px-6 py-5" style={{ borderBottom: '1px solid #1e1e1e' }}>
                  <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest mb-5">Ownership Metrics</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[13px] font-medium text-[#d1d1d6] mb-1.5">Black Ownership (%)</label>
                      <input
                        type="number" min="0" max="100" step="0.1"
                        value={manualEntry.blackOwnership}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualEntry(p => { const d = { ...p, blackOwnership: v }; saveManualEntryData(d); return d; });
                          setManualErrors(p => { const n = { ...p }; delete n.blackOwnership; return n; });
                        }}
                        placeholder="0.0"
                        className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3c] outline-none transition-colors ${manualErrors.blackOwnership ? 'ring-1 ring-red-500/50' : 'focus:ring-1 focus:ring-[#48484a]'}`}
                        style={{ background: '#111111', border: '1px solid #2c2c2e' }}
                        data-testid="input-black-ownership"
                      />
                      {manualErrors.blackOwnership && <p className="text-[11px] text-red-400 mt-1">{manualErrors.blackOwnership}</p>}
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-[#d1d1d6] mb-1.5">Black Female Ownership (%)</label>
                      <input
                        type="number" min="0" max="100" step="0.1"
                        value={manualEntry.blackFemaleOwnership}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualEntry(p => { const d = { ...p, blackFemaleOwnership: v }; saveManualEntryData(d); return d; });
                          setManualErrors(p => { const n = { ...p }; delete n.blackFemaleOwnership; return n; });
                        }}
                        placeholder="0.0"
                        className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3c] outline-none transition-colors ${manualErrors.blackFemaleOwnership ? 'ring-1 ring-red-500/50' : 'focus:ring-1 focus:ring-[#48484a]'}`}
                        style={{ background: '#111111', border: '1px solid #2c2c2e' }}
                        data-testid="input-black-female-ownership"
                      />
                      {manualErrors.blackFemaleOwnership && <p className="text-[11px] text-red-400 mt-1">{manualErrors.blackFemaleOwnership}</p>}
                    </div>
                  </div>
                </div>

                <div className="px-6 py-5" style={{ borderBottom: '1px solid #1e1e1e' }}>
                  <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest mb-5">Management Control</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[13px] font-medium text-[#d1d1d6] mb-1.5">Black Board Members (%)</label>
                      <input
                        type="number" min="0" max="100" step="0.1"
                        value={manualEntry.blackBoardMembers}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualEntry(p => { const d = { ...p, blackBoardMembers: v }; saveManualEntryData(d); return d; });
                          setManualErrors(p => { const n = { ...p }; delete n.blackBoardMembers; return n; });
                        }}
                        placeholder="0.0"
                        className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3c] outline-none transition-colors ${manualErrors.blackBoardMembers ? 'ring-1 ring-red-500/50' : 'focus:ring-1 focus:ring-[#48484a]'}`}
                        style={{ background: '#111111', border: '1px solid #2c2c2e' }}
                        data-testid="input-black-board-members"
                      />
                      {manualErrors.blackBoardMembers && <p className="text-[11px] text-red-400 mt-1">{manualErrors.blackBoardMembers}</p>}
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-[#d1d1d6] mb-1.5">Black Executive Management (%)</label>
                      <input
                        type="number" min="0" max="100" step="0.1"
                        value={manualEntry.blackExecutiveManagement}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualEntry(p => { const d = { ...p, blackExecutiveManagement: v }; saveManualEntryData(d); return d; });
                          setManualErrors(p => { const n = { ...p }; delete n.blackExecutiveManagement; return n; });
                        }}
                        placeholder="0.0"
                        className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3c] outline-none transition-colors ${manualErrors.blackExecutiveManagement ? 'ring-1 ring-red-500/50' : 'focus:ring-1 focus:ring-[#48484a]'}`}
                        style={{ background: '#111111', border: '1px solid #2c2c2e' }}
                        data-testid="input-black-executive-mgmt"
                      />
                      {manualErrors.blackExecutiveManagement && <p className="text-[11px] text-red-400 mt-1">{manualErrors.blackExecutiveManagement}</p>}
                    </div>
                  </div>
                </div>

                <div className="px-6 py-5" style={{ borderBottom: '1px solid #1e1e1e' }}>
                  <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest mb-5">Skills Development</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[13px] font-medium text-[#d1d1d6] mb-1.5">Skills Development Spend on Black People (R)</label>
                      <input
                        type="number" min="0" step="1"
                        value={manualEntry.skillsSpendOnBlack}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualEntry(p => { const d = { ...p, skillsSpendOnBlack: v }; saveManualEntryData(d); return d; });
                          setManualErrors(p => { const n = { ...p }; delete n.skillsSpendOnBlack; return n; });
                        }}
                        placeholder="0"
                        className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3c] outline-none transition-colors ${manualErrors.skillsSpendOnBlack ? 'ring-1 ring-red-500/50' : 'focus:ring-1 focus:ring-[#48484a]'}`}
                        style={{ background: '#111111', border: '1px solid #2c2c2e' }}
                        data-testid="input-skills-spend"
                      />
                      {manualErrors.skillsSpendOnBlack && <p className="text-[11px] text-red-400 mt-1">{manualErrors.skillsSpendOnBlack}</p>}
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-[#d1d1d6] mb-1.5">Number of Black Learnerships</label>
                      <input
                        type="number" min="0" step="1"
                        value={manualEntry.blackLearnerships}
                        onChange={(e) => {
                          const v = e.target.value;
                          setManualEntry(p => { const d = { ...p, blackLearnerships: v }; saveManualEntryData(d); return d; });
                          setManualErrors(p => { const n = { ...p }; delete n.blackLearnerships; return n; });
                        }}
                        placeholder="0"
                        className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3c] outline-none transition-colors ${manualErrors.blackLearnerships ? 'ring-1 ring-red-500/50' : 'focus:ring-1 focus:ring-[#48484a]'}`}
                        style={{ background: '#111111', border: '1px solid #2c2c2e' }}
                        data-testid="input-black-learnerships"
                      />
                      {manualErrors.blackLearnerships && <p className="text-[11px] text-red-400 mt-1">{manualErrors.blackLearnerships}</p>}
                    </div>
                  </div>
                </div>

                <div className="px-6 py-5" style={{ borderBottom: '1px solid #1e1e1e' }}>
                  <p className="text-[10px] font-semibold text-[#636366] uppercase tracking-widest mb-5">Custom Entity Targets</p>
                  <div className="space-y-3">
                    {manualEntry.customTargets.map((ct, i) => (
                      <div key={i} className="flex items-start gap-2" data-testid={`custom-target-row-${i}`}>
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={ct.name}
                            onChange={(e) => {
                              const v = e.target.value;
                              setManualEntry(p => {
                                const d = { ...p, customTargets: p.customTargets.map((c, j) => j === i ? { ...c, name: v } : c) };
                                saveManualEntryData(d);
                                return d;
                              });
                            }}
                            placeholder="Entity Name"
                            className="w-full px-3.5 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3c] outline-none focus:ring-1 focus:ring-[#48484a] transition-colors"
                            style={{ background: '#111111', border: '1px solid #2c2c2e' }}
                            data-testid={`input-custom-name-${i}`}
                          />
                        </div>
                        <div className="w-[140px] shrink-0">
                          <input
                            type="number"
                            value={ct.value}
                            onChange={(e) => {
                              const v = e.target.value;
                              setManualEntry(p => {
                                const d = { ...p, customTargets: p.customTargets.map((c, j) => j === i ? { ...c, value: v } : c) };
                                saveManualEntryData(d);
                                return d;
                              });
                            }}
                            placeholder="Target Value"
                            className="w-full px-3.5 py-2.5 rounded-xl text-[13px] text-white placeholder-[#3a3a3c] outline-none focus:ring-1 focus:ring-[#48484a] transition-colors"
                            style={{ background: '#111111', border: '1px solid #2c2c2e' }}
                            data-testid={`input-custom-value-${i}`}
                          />
                        </div>
                        <button
                          onClick={() => {
                            setManualEntry(p => {
                              const d = { ...p, customTargets: p.customTargets.filter((_, j) => j !== i) };
                              saveManualEntryData(d);
                              return d;
                            });
                          }}
                          className="p-2.5 rounded-xl text-[#3a3a3c] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                          data-testid={`button-remove-custom-${i}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        setManualEntry(p => {
                          const d = { ...p, customTargets: [...p.customTargets, { name: '', value: '' }] };
                          saveManualEntryData(d);
                          return d;
                        });
                      }}
                      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-[#8e8e93] hover:text-white hover:bg-white/[0.06] transition-colors"
                      style={{ border: '1px dashed #2c2c2e' }}
                      data-testid="button-add-custom-target"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Add Custom Entity Target
                    </button>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCurrentPage(uploadedFiles.length > 0 ? 'extract' : 'upload')}
                      className="px-5 py-3 bg-[#1c1c1e] text-[#8e8e93] hover:text-white rounded-xl text-[13px] font-medium transition-colors"
                      data-testid="button-manual-back"
                    >
                      Back
                    </button>
                    <button
                      onClick={async () => {
                        const errors: Record<string, string> = {};
                        const pctFields: { key: keyof ManualEntryData; label: string }[] = [
                          { key: 'blackOwnership', label: 'Black Ownership' },
                          { key: 'blackFemaleOwnership', label: 'Black Female Ownership' },
                          { key: 'blackBoardMembers', label: 'Black Board Members' },
                          { key: 'blackExecutiveManagement', label: 'Black Executive Management' },
                        ];
                        for (const f of pctFields) {
                          const raw = manualEntry[f.key] as string;
                          if (!raw || raw.trim() === '') { errors[f.key] = `${f.label} is required`; continue; }
                          const v = parseFloat(raw);
                          if (isNaN(v) || v < 0 || v > 100) errors[f.key] = 'Must be between 0 and 100';
                        }
                        const spendRaw = manualEntry.skillsSpendOnBlack;
                        if (!spendRaw || spendRaw.trim() === '') { errors.skillsSpendOnBlack = 'Spend amount is required'; }
                        else { const sv = parseFloat(spendRaw); if (isNaN(sv) || sv < 0) errors.skillsSpendOnBlack = 'Must be a positive number'; }

                        const learnRaw = manualEntry.blackLearnerships;
                        if (!learnRaw || learnRaw.trim() === '') { errors.blackLearnerships = 'Number of learnerships is required'; }
                        else { const lv = parseFloat(learnRaw); if (isNaN(lv) || lv < 0 || !Number.isInteger(lv)) errors.blackLearnerships = 'Must be a non-negative integer'; }

                        if (Object.keys(errors).length > 0) { setManualErrors(errors); return; }
                        setManualErrors({});

                        setIsSavingSession(true);
                        try {
                          const manualScorecardResult = {
                            ownership: { score: Math.round(parseFloat(manualEntry.blackOwnership) / 100 * 25 * 10) / 10, target: 25, weighting: 25, subMinimumMet: parseFloat(manualEntry.blackOwnership) >= 40 },
                            managementControl: { score: Math.round(((parseFloat(manualEntry.blackBoardMembers) + parseFloat(manualEntry.blackExecutiveManagement)) / 200) * 19 * 10) / 10, target: 19, weighting: 19 },
                            skillsDevelopment: { score: Math.min(25, Math.round((parseFloat(manualEntry.skillsSpendOnBlack) / Math.max(1, parseFloat(companyInfo.annualTurnover.replace(/[^\d]/g, '')) || 1000000) * 100) * 25 * 10) / 10), target: 25, weighting: 25, subMinimumMet: true },
                            procurement: { score: 0, target: 29, weighting: 29, subMinimumMet: false },
                            supplierDevelopment: { score: 0, target: 10, weighting: 10, subMinimumMet: false },
                            enterpriseDevelopment: { score: 0, target: 7, weighting: 7, subMinimumMet: false },
                            socioEconomicDevelopment: { score: 0, target: 5, weighting: 5 },
                            yesInitiative: { score: 0, target: 5, weighting: 5 },
                            total: { score: 0, target: 120, weighting: 120 },
                            achievedLevel: 9,
                            discountedLevel: 9,
                            isDiscounted: false,
                            recognitionLevel: '0%',
                            manualEntryData: manualEntry,
                          };
                          const totalScore =
                            manualScorecardResult.ownership.score +
                            manualScorecardResult.managementControl.score +
                            manualScorecardResult.skillsDevelopment.score +
                            manualScorecardResult.procurement.score +
                            manualScorecardResult.supplierDevelopment.score +
                            manualScorecardResult.enterpriseDevelopment.score +
                            manualScorecardResult.socioEconomicDevelopment.score;
                          manualScorecardResult.total.score = Math.round(totalScore * 10) / 10;

                          const pct = totalScore / 120 * 100;
                          let level = 9;
                          if (pct >= 100) level = 1;
                          else if (pct >= 95) level = 2;
                          else if (pct >= 90) level = 3;
                          else if (pct >= 80) level = 4;
                          else if (pct >= 51) level = 5;
                          else if (pct >= 40) level = 6;
                          else if (pct >= 30) level = 7;
                          else if (pct >= 15) level = 8;
                          manualScorecardResult.achievedLevel = level;
                          manualScorecardResult.discountedLevel = level;
                          const recMap: Record<number, string> = { 1: '135%', 2: '125%', 3: '110%', 4: '100%', 5: '80%', 6: '60%', 7: '50%', 8: '10%', 9: '0%' };
                          manualScorecardResult.recognitionLevel = recMap[level] || '0%';

                          await persistSession('scorecard', {
                            results: [],
                            complete: true,
                            scorecardResult: manualScorecardResult,
                          });

                          setScorecardResult(manualScorecardResult);
                          localStorage.removeItem(MANUAL_ENTRY_KEY);
                          setIsSubmitted(true);
                          setCurrentPage('scorecard');
                          toast({ title: "Scorecard generated", description: "Manual entry data has been processed successfully." });
                        } catch (err: any) {
                          console.error("Manual scorecard generation error:", err);
                          toast({ title: "Generation Failed", description: "Could not generate scorecard from manual data.", variant: "destructive" });
                        } finally {
                          setIsSavingSession(false);
                        }
                      }}
                      disabled={isSavingSession}
                      className="flex-1 py-3 bg-white hover:bg-[#e5e5ea] disabled:bg-[#1c1c1e] disabled:text-[#48484a] text-black rounded-xl font-semibold text-[13px] transition-colors flex items-center justify-center gap-2"
                      data-testid="button-generate-scorecard"
                    >
                      {isSavingSession ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating...</>
                      ) : (
                        <><Zap className="w-3.5 h-3.5" />Generate Scorecard</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentPage === 'scorecard' && (() => {
            const sc = scorecardResult;
            const PILLARS = [
              { key: 'ownership', label: 'Ownership', target: 25, color: '#5e9bff' },
              { key: 'managementControl', label: 'Management Control', target: 19, color: '#34d399' },
              { key: 'skillsDevelopment', label: 'Skills Development', target: 25, color: '#f59e0b' },
              { key: 'procurement', label: 'Preferential Procurement', target: 29, color: '#a78bfa' },
              { key: 'supplierDevelopment', label: 'Supplier Development', target: 10, color: '#38bdf8' },
              { key: 'enterpriseDevelopment', label: 'Enterprise Development', target: 7, color: '#fb923c' },
              { key: 'socioEconomicDevelopment', label: 'Socio-Economic Dev.', target: 5, color: '#f472b6' },
            ];
            const totalScore = sc?.total?.score ?? 0;
            const totalTarget = sc?.total?.target ?? 120;
            const level = sc?.discountedLevel ?? sc?.achievedLevel ?? 9;
            const recognition = sc?.recognitionLevel ?? '0%';
            const levelColors: Record<number, string> = {
              1: '#22c55e', 2: '#4ade80', 3: '#86efac', 4: '#fbbf24',
              5: '#f59e0b', 6: '#fb923c', 7: '#f87171', 8: '#ef4444', 9: '#6b7280'
            };
            const levelColor = levelColors[level] || '#6b7280';
            const source = sc?._source;

            return (
              <div className="max-w-4xl mx-auto py-8 space-y-5" data-testid="scorecard-result">
                {/* Header */}
                <div className="bg-[#1c1c1e] rounded-2xl p-6 border border-[#2c2c2e] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/[0.06] to-blue-500/20 flex items-center justify-center border border-white/[0.12]">
                      <ScanLine className="w-7 h-7 text-[#d1d1d6]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">B-BBEE Scorecard</h2>
                      <p className="text-[#8e8e93] text-sm" data-testid="scorecard-company">{companyInfo.name || 'Client'} • {companyInfo.sector || 'General'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {source === 'csv_import' && (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">CSV Import</span>
                    )}
                    <button className="px-4 py-2 bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white rounded-xl text-sm font-medium transition-colors border border-[#48484a]" onClick={() => window.print()}>
                      Export PDF
                    </button>
                  </div>
                </div>

                {isSavingSession ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e]">
                    <Loader2 className="w-8 h-8 animate-spin text-[#d1d1d6] mb-4" />
                    <p className="text-[#8e8e93]">Generating scorecard...</p>
                  </div>
                ) : sc ? (
                  <>
                    {/* Level banner */}
                    <div className="bg-[#1c1c1e] rounded-2xl p-6 border border-[#2c2c2e] flex flex-col sm:flex-row items-center gap-6" data-testid="scorecard-level-banner">
                      <div className="flex-shrink-0 flex flex-col items-center justify-center w-28 h-28 rounded-2xl border-2" style={{ borderColor: levelColor, background: `${levelColor}18` }}>
                        <span className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: levelColor }}>Level</span>
                        <span className="text-5xl font-black" style={{ color: levelColor }} data-testid="scorecard-level-number">{level}</span>
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <div className="flex items-end gap-3">
                          <span className="text-4xl font-black text-white" data-testid="scorecard-total-score">{totalScore}</span>
                          <span className="text-[#8e8e93] text-lg mb-1">/ {totalTarget} points</span>
                        </div>
                        <div className="w-full h-3 bg-[#2c2c2e] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (totalScore / totalTarget) * 100)}%`, background: levelColor }} />
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-[#8e8e93] text-sm">Recognition: <strong className="text-white" data-testid="scorecard-recognition">{recognition}</strong></span>
                          {sc.isDiscounted && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Level discounted (sub-minimum not met)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Pillar breakdown */}
                    <div className="bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e] overflow-hidden" data-testid="scorecard-pillars">
                      <div className="px-6 py-4 border-b border-[#2c2c2e]">
                        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Pillar Breakdown</h3>
                      </div>
                      <div className="divide-y divide-[#2c2c2e]">
                        {PILLARS.map(pillar => {
                          const p = sc[pillar.key] || { score: 0, target: pillar.target, weighting: pillar.target };
                          const pct = pillar.target > 0 ? Math.min(100, (p.score / pillar.target) * 100) : 0;
                          return (
                            <div key={pillar.key} className="px-6 py-4" data-testid={`scorecard-pillar-${pillar.key}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-[#d1d1d6]">{pillar.label}</span>
                                <div className="flex items-center gap-3">
                                  {p.subMinimumMet === false && (
                                    <span className="text-[10px] font-semibold uppercase text-amber-500" title="Sub-minimum not met">⚠ Sub-min</span>
                                  )}
                                  {p.subMinimumMet === true && (
                                    <span className="text-[10px] font-semibold uppercase text-green-500">✓ Sub-min</span>
                                  )}
                                  <span className="text-sm font-bold text-white">
                                    {p.score} <span className="font-normal text-[#8e8e93]">/ {pillar.target}</span>
                                  </span>
                                </div>
                              </div>
                              <div className="w-full h-2 bg-[#2c2c2e] rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%`, background: pillar.color }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="px-6 py-4 bg-[#141414] border-t border-[#2c2c2e] flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#d1d1d6]">TOTAL</span>
                        <span className="text-sm font-bold text-white" data-testid="scorecard-total-row">{totalScore} / {totalTarget}</span>
                      </div>
                    </div>

                    {/* Source info */}
                    {sc._entityCounts && (
                      <div className="bg-[#1c1c1e] rounded-2xl p-5 border border-[#2c2c2e]" data-testid="scorecard-entity-summary">
                        <h3 className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wider mb-3">Entities Extracted</h3>
                        <div className="flex flex-wrap gap-3">
                          {Object.entries(sc._entityCounts as Record<string, number>).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2c2c2e] rounded-xl">
                              <span className="text-[#8e8e93] text-xs capitalize">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>
                              <span className="text-white text-xs font-semibold">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                      <Link href="/dashboard" className="flex-1 text-center px-6 py-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white rounded-xl font-semibold transition-colors border border-[#2c2c2e]">
                        Go to Dashboard
                      </Link>
                      <button
                        onClick={() => {
                          setScorecardResult(null);
                          setCurrentPage('company-info');
                          setUploadedFiles([]);
                          setExtractionResults([]);
                          setIsSubmitted(false);
                        }}
                        className="px-6 py-3 bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[#8e8e93] hover:text-white rounded-xl font-semibold transition-colors border border-[#2c2c2e]"
                      >
                        New Assessment
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-16 bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e]">
                    <p className="text-[#8e8e93] mb-4">No scorecard data yet. Complete the previous steps to generate a scorecard.</p>
                    <button onClick={() => setCurrentPage('review')} className="px-6 py-2.5 bg-white/[0.08] hover:bg-white/[0.12] text-white rounded-xl text-sm transition-colors">
                      Back to Review
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </main>
    </div>
  );
}
