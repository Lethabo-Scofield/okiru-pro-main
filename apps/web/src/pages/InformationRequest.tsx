import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useLocation, useParams } from "wouter";
import {
  ChevronRight,
  Download,
  Loader2,
  Save,
  Building2,
  Search,
  CheckCircle2,
  Upload,
  FlaskConical,
} from "lucide-react";
import { useAuth } from "@toolkit/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { LAKE_TRADING_DEMO_NAME } from "@/lib/lakeTradingWorkbookFixture";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@toolkit/lib/config";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { DeleteCompanyButton } from "@/components/DeleteCompanyButton";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import {
  getSection,
  getCompanyInfoMetaFields,
  getSectionGroupsForSector,
  getOrderedSectionKeysForSector,
  resolveScorecardTypeForSector,
  validateFinancialMetaCrossFields,
  filterVisibleFinancialMetaFields,
  type ColumnDef,
  type SectionGroup,
} from "@/components/workbook/sections";
import { lookupIndustryNormPercent } from "@/lib/industryNormLookup";
import { SectionWorkbookEditor } from "@/components/workbook/SectionWorkbookEditor";
import { WorkbookValidationPanel } from "@/components/workbook/WorkbookValidationPanel";
import { ExtractionReviewModal, type CellUpdate } from "@/components/workbook/ExtractionReviewModal";
import { CellValidationPopup, FIELD_LEARN_MORE } from "@/components/workbook/CellValidationPopup";
import { NumericDateInput } from "@/components/ui/NumericDateInput";
import { normalizeCellForColumn } from "@/lib/tabularNormalize";
import { META_CONFLICTS_KEY } from "@/lib/parserToWorkbook";
import { usePillarPermission } from "@/hooks/usePillarPermission";
import {
  formatWorkbookValidationSummary,
} from "@/components/workbook/workbookValidation";
import {
  extractAfsMetaForSubSector,
  pruneCompanyMetaWhenLeavingFsc,
  pruneFinancialMetaWhenLeavingFsc,
  pruneSedMetaWhenLeavingFsc,
  stripAfsMetaFromFinancial,
} from "@/components/workbook/fscWorkbookMeta";
import { fscSubSectorHasAfs } from "@/components/workbook/sections";
import {
  normalizeExcelFileWithAi,
  type WorkbookSectionsInput,
} from "@/lib/workbookExcelNormalizer";
import { importBeeGatheringExcel, type ExcelExtractionResult } from "@/lib/excelImport";
import { ExcelImportPreviewModal } from "@/components/scorecard/ExcelImportPreviewModal";
import { DocumentUploadStart } from "@/components/scorecard/DocumentUploadStart";
import { useBbeeStore } from "@toolkit/lib/store";
import { invalidateClientData } from "@toolkit/lib/api";
import { WorkbookScoreSummary } from "@/pages/WorkbookScoreSummary";
import { mergeWorkbookSectionSaveBody } from "@/lib/workbookSectionSave";

type Row = Record<string, unknown> & { _id: string };

const PREVIEW_SECTION_LABELS: Record<string, string> = {
  "company-information": "Company Information",
  "financial-information": "Financial Information",
  ownership: "Ownership",
  "management-control": "Management Control",
  employees: "Employees",
  "skills-development": "Skills Development",
  procurement: "Procurement / Suppliers",
  esd: "Enterprise & Supplier Development",
  sed: "Socio-Economic Development",
  "afs-additions": "Access to Financial Services",
};

/** Per-section row/field counts for the import preview so users see everything
 *  that came in, not just company + financials. */
function buildSectionSummary(sections: WorkbookSectionsInput) {
  return Object.entries(sections)
    .map(([key, sec]) => ({
      key,
      label: PREVIEW_SECTION_LABELS[key] ?? key,
      rowCount: Array.isArray((sec as { rows?: unknown[] })?.rows) ? (sec as { rows: unknown[] }).rows.length : 0,
      fieldCount: (sec as { meta?: Record<string, unknown> })?.meta
        ? Object.values((sec as { meta: Record<string, unknown> }).meta).filter((v) => v !== "" && v != null).length
        : 0,
    }))
    .filter((s) => s.rowCount > 0 || s.fieldCount > 0);
}
type SectionData = { rows: Row[]; meta?: Record<string, unknown> };
type Workbook = {
  companyId: string;
  sections: Record<string, SectionData>;
  submittedAt?: string | null;
  updatedAt: string;
};

interface Company {
  id?: string;
  clientId?: string;
  name: string;
  createdByUserId?: string | null;
}

function LakeTradingDemoEntry({
  onPick,
  compact = false,
}: {
  onPick: (c: Company) => void;
  compact?: boolean;
}) {
  const [seeding, setSeeding] = useState(false);
  const { toast } = useToast();

  const openDemo = async () => {
    setSeeding(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/demo/lake-trading`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Could not open demo",
          description: data.error || data.message || `Server returned ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      if (data.validationIssueCount > 0) {
        toast({
          title: "Demo loaded with validation warnings",
          description: `${data.validationIssueCount} issue(s) — review before submit.`,
          variant: "destructive",
        });
      }
      onPick({
        id: data.clientId,
        clientId: data.clientId,
        name: data.name || LAKE_TRADING_DEMO_NAME,
      });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <FlaskConical className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#d1d1d6]">Lake Trading Demo</p>
            <p className="text-[12px] text-[#636366] mt-0.5">
              Pre-filled RCOGP workbook — same validation and submit flow as a live client.
            </p>
          </div>
        </div>
        <button
          onClick={openDemo}
          disabled={seeding}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-200 text-[12px] font-semibold press-sm hover:bg-amber-500/25 disabled:opacity-60 smooth"
          data-testid="button-open-lake-trading-demo"
        >
          {seeding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" />
          )}
          Open Lake Trading Demo
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="h-4 w-4 text-amber-400" />
            <h2 className="text-[15px] font-semibold text-amber-100">Lake Trading Demo Workbook</h2>
          </div>
          <p className="text-[13px] text-[#98989f] max-w-xl">
            RCOGP Generic ground truth (~63.56 pts, Level 7 → 8). Pre-filled workbook — same UI,
            validation, and submit flow as a live client.
          </p>
        </div>
        <button
          onClick={openDemo}
          disabled={seeding}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 text-black text-[13px] font-semibold press-sm hover:bg-amber-400 disabled:opacity-60 smooth"
          data-testid="button-open-lake-trading-demo"
        >
          {seeding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FlaskConical className="h-4 w-4" />
          )}
          Open Lake Trading Demo
        </button>
      </div>
    </div>
  );
}

function ExcelImportButton({
  onImport,
  disabled,
  label = "Import Excel (free)",
  className,
}: {
  onImport: (file: File) => Promise<void>;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      await onImport(file);
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm,.xls"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
        data-testid="input-excel-import"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || importing}
        className={
          className ??
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[12px] text-[#d1d1d6] smooth press-sm disabled:opacity-60"
        }
        data-testid="button-import-excel"
      >
        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {label}
      </button>
    </>
  );
}

function ExcelLogoMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect x="14" y="6" width="28" height="36" rx="4" fill="#185C37" />
      <path d="M22 10h16v7H22zM22 19h16v7H22zM22 28h16v10H22z" fill="#21A366" />
      <path d="M30 10h8v28h-8z" fill="#107C41" opacity="0.72" />
      <rect x="6" y="12" width="22" height="24" rx="3.5" fill="#107C41" />
      <path
        d="M12.4 18h4.1l2.2 4.4L21.1 18h3.8l-4 7 4.3 7h-4.1l-2.5-4.7-2.7 4.7h-3.9l4.5-7.1L12.4 18Z"
        fill="white"
      />
    </svg>
  );
}

/**
 * Shell around the create-scorecard setup steps.
 *
 * MUST live at module scope: defined inside CompanyPicker it gets a new
 * function identity on every render, so React remounts the entire subtree on
 * each keystroke — the manual company-name input lost focus after every
 * character (and the upload flow's state was one re-render away from a reset).
 */
function SetupShell({
  step,
  title,
  description,
  children,
  showBack,
  onBack,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
  showBack: boolean;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto max-w-[980px] px-4 py-8 sm:py-12">
      <style>{`
        @keyframes setupReveal {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .setup-reveal { animation: setupReveal 220ms ease-out both; }
      `}</style>
      <div className="rounded-[28px] border border-white/[0.08] bg-[#141416] px-5 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.30)] sm:px-8 sm:py-8">
          <div className="mb-8 flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#8e8e93]">{step}</span>
            {showBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[#d1d1d6] transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Back
              </button>
            )}
          </div>
          {title && (
            <div className="mb-8 text-center">
              <h2
                className="text-[34px] font-semibold leading-[1.05] tracking-tight text-white sm:text-[44px]"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
              >
                {title}
              </h2>
              {description && <p className="mx-auto mt-3 max-w-md text-[15px] leading-6 text-[#a1a1a6]">{description}</p>}
            </div>
          )}
          {children}
      </div>
    </div>
  );
}

function CompanyPicker({
  onPick,
  onLandEstimate,
  mode = "picker",
}: {
  onPick: (c: Company) => void;
  /** Document flow: land on the provisional live-score page instead of the workbook. */
  onLandEstimate?: (c: Company) => void;
  mode?: "picker" | "create";
}) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<ExcelExtractionResult | null>(null);
  const [pendingSections, setPendingSections] = useState<WorkbookSectionsInput | null>(null);
  const [setupMethod, setSetupMethod] = useState<"choose" | "upload" | "manual" | "excel">("choose");
  const { toast } = useToast();
  const loadClientData = useBbeeStore((s) => s.loadClientData);
  const showLakeDemo = isSuperAdmin(user);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "create") return;
    load();
  }, [load, mode]);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const c = await res.json();
        toast({ title: "Company created", description: c.name });
        setNewName("");
        await load();
        onPick(c);
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Could not create",
          description: err.error || "Server error.",
          variant: "destructive",
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleExcelImport = async (file: File) => {
    const result = await importBeeGatheringExcel(file, API_BASE);
    if (!result.extraction.isBeeGatheringFormat) {
      const fallback = await normalizeExcelFileWithAi(file, API_BASE);
      if (fallback.criticalBlocked) {
        toast({
          title: "Import blocked - fix critical fields",
          description: formatWorkbookValidationSummary(fallback.validationIssues, 5),
          variant: "destructive",
        });
        return;
      }
      const companyName = String(
        fallback.sections["company-information"]?.meta?.companyName ?? "",
      ).trim();
      if (!companyName) {
        toast({
          title: "Unrecognized Excel layout",
          description:
            "Upload a BEE Information Gathering file or a workbook with Company / Legal Name.",
          variant: "destructive",
        });
        return;
      }
      setPendingFile(file);
      setPreviewResult({
        data: {
          companyName,
          sector: String(fallback.sections["company-information"]?.meta?.industrySector ?? ""),
          scorecardType: String(fallback.sections["company-information"]?.meta?.scorecardType ?? ""),
          revenue: Number(fallback.sections["financial-information"]?.meta?.revenue ?? 0) || undefined,
          npat: Number(fallback.sections["financial-information"]?.meta?.npat ?? 0) || undefined,
        },
        warnings: fallback.warnings,
        fieldStatuses: { companyName: "mapped" },
        fieldConfidences: {},
        fieldSources: {},
        isBeeGatheringFormat: true,
        unmappedFields: [],
        ownershipChainTiers: [],
        mappedSheets: Object.keys(fallback.mappedSheets),
        extractedFieldCount: fallback.extractedFieldCount,
        sectionSummary: buildSectionSummary(fallback.sections),
      });
      setPendingSections(fallback.sections);
      setPreviewOpen(true);
      return;
    }
    setPendingFile(file);
    setPreviewResult(result.extraction);
    setPendingSections(result.sections);
    setPreviewOpen(true);
  };

  /**
   * Shared create-from-sections sequence used by BOTH Excel import and the
   * document-upload start: create the client, import the workbook sections,
   * submit (scores through the canonical workbook path), open the workbook.
   * Returns true on success.
   */
  const createFromSections = async (
    companyName: string,
    sections: WorkbookSectionsInput,
    opts?: {
      importMarker?: unknown;
      warnCount?: number;
      landOn?: "workbook" | "estimate";
      /** Per-document verdicts from the document flow, shown on the estimate page. */
      verdicts?: unknown;
      /** Reconciliation result (issues + entity summary) for the review page. */
      reconcile?: unknown;
    },
  ): Promise<boolean> => {
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Could not create company",
          description: err.error || "Server error.",
          variant: "destructive",
        });
        return false;
      }
      const c = await res.json();
      const clientId = c.clientId || c.id;
      if (opts?.importMarker !== undefined) {
        sessionStorage.setItem(
          `okiru-excel-import-${clientId}`,
          JSON.stringify({ extracted: opts.importMarker, importedAt: new Date().toISOString() }),
        );
      }
      if (opts?.verdicts !== undefined) {
        // Hand the document-flow verdicts to the provisional score page (same
        // sessionStorage convention the Excel import marker uses).
        sessionStorage.setItem(`okiru-doc-verdicts-${clientId}`, JSON.stringify(opts.verdicts));
      }
      if (opts?.reconcile !== undefined) {
        // The reconciliation issues + entity summary — the review page renders
        // these triaged by severity (what we fixed / what needs you / what's missing).
        sessionStorage.setItem(`okiru-reconcile-${clientId}`, JSON.stringify(opts.reconcile));
      }
      const importRes = await fetch(
        `${API_BASE}/api/workbook/${encodeURIComponent(clientId)}/import`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sections }),
        },
      );
      if (!importRes.ok) {
        toast({ title: "Import failed", variant: "destructive" });
        return false;
      }
      let submitted = false;
      const submitRes = await fetch(
        `${API_BASE}/api/workbook/${encodeURIComponent(clientId)}/submit`,
        { method: "POST", credentials: "include" },
      );
      if (submitRes.ok) {
        submitted = true;
        try {
          await loadClientData(clientId);
        } catch {
          // Summary page will retry loadClientData.
        }
      }
      const warnCount = opts?.warnCount ?? 0;
      toast({
        title: submitted
          ? "Imported and synced to scorecard"
          : warnCount > 0
            ? "Imported with gaps"
            : "Workbook imported",
        description: submitted
          ? companyName
          : warnCount > 0
            ? `${warnCount} warning(s) — open workbook and submit when ready.`
            : `${companyName} — submit workbook to calculate score.`,
      });
      if (opts?.landOn === "estimate" && onLandEstimate) {
        onLandEstimate(c);
      } else {
        onPick(c);
      }
      return true;
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(
    () =>
      companies.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase())),
    [companies, search],
  );

  if (mode === "create") {
    if (setupMethod === "choose" || setupMethod === "manual" || setupMethod === "excel") {
      const options = [
        {
          key: "upload" as const,
          title: "Upload documents",
          description: "Send them a pillar at a time. Token cost shown before anything is read.",
          icon: Upload,
          badge: "Uses tokens",
          badgeClass: "border-white/[0.10] bg-white/[0.04] text-[#a1a1a6]",
        },
        {
          key: "manual" as const,
          title: "Enter details manually",
          description: "Create and complete the scorecard for free.",
          icon: Building2,
          badge: "Free",
          badgeClass: "border-white/[0.10] bg-white/[0.04] text-[#a1a1a6]",
        },
        {
          key: "excel" as const,
          title: "Import Excel workbook",
          // Not "an RCOGP workbook": the normalizer detects ICT, Construction, FSC
          // (incl. sub-sector), Transport and AgriBEE from the workbook's own
          // "Sector / Codes" header and only falls back to RCOGP. Naming one sector
          // told every Transport/FSC/AgriBEE client this path was not for them and
          // pushed them onto the token-charged "Upload documents" route instead.
          description: "Continue from an existing B-BBEE information-gathering workbook, any sector. Unmapped sheets are matched with AI.",
          icon: ExcelLogoMark,
          // The badge sits in the same column as "Uses tokens" and "Free", so it is
          // read as the cost signal. "Uses AI" there implied a charge and then the
          // panel below said "free" — say both, and lead with the cost.
          badge: "Free · uses AI",
          badgeClass: "border-white/[0.10] bg-white/[0.04] text-[#a1a1a6]",
        },
      ];
      return (
        <SetupShell
          step={setupMethod === "choose" ? "Step 1 of 3" : "Step 2 of 3"}
          title="Create a scorecard"
          description="Choose how you would like to begin."
          showBack={setupMethod !== "choose"}
          onBack={() => setSetupMethod("choose")}
        >
          <div className="space-y-2.5">
            {options.map(({ key, title, description, icon: Icon, badge, badgeClass }) => {
              const selected = setupMethod === key;
              // Recede, but stay CLICKABLE. `pointer-events-none` here meant that
              // picking any path killed the other two: choose Excel import and
              // "Enter details manually" and "Upload documents" stopped responding,
              // with the Back button the only way out. Dimming is a hint about
              // where you are, not a decision you are locked into — switching
              // between the three costs nothing and commits nothing.
              const dimmed = setupMethod !== "choose" && !selected;
              return (
                <div
                  key={key}
                  className={`transition-opacity duration-200 ${dimmed ? "opacity-45 hover:opacity-100" : "opacity-100"}`}
                >
                  <button
                    type="button"
                    onClick={() => setSetupMethod(key)}
                    className={`group flex w-full items-center gap-4 rounded-[20px] border px-4 py-4 text-left transition-colors ${
                      selected
                        ? "border-white/[0.10] bg-[#1c1c1e]"
                        : "border-white/[0.08] bg-[#1c1c1e] hover:border-white/[0.16] hover:bg-[#222225]"
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-[#d1d1d6]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold text-white">{title}</span>
                      <span className="mt-0.5 block text-[13px] leading-5 text-[#a1a1a6]">{description}</span>
                    </span>
                    <span className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${badgeClass}`}>
                      {badge}
                    </span>
                    <ChevronRight className={`h-5 w-5 transition-transform group-hover:translate-x-0.5 ${selected ? "text-[#8e8e93]" : "text-[#636366] group-hover:text-white"}`} />
                  </button>

                  {selected && key === "manual" && (
                    <div className="setup-reveal mt-3 rounded-[18px] border border-white/[0.06] bg-[#111113] p-4">
                      <p className="mb-3 text-[13px] font-medium text-[#a1a1a6]">Enter the company name to start a free workbook.</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          id="new-company-name"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && create()}
                          placeholder="Company name"
                          className="h-12 min-w-0 flex-1 rounded-2xl border border-white/[0.10] bg-[#141416] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-[#636366] focus:border-white/30 focus:ring-4 focus:ring-white/[0.06]"
                          data-testid="input-new-company"
                        />
                        <button
                          onClick={create}
                          disabled={!newName.trim() || creating}
                          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-[14px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7] disabled:cursor-not-allowed disabled:bg-[#2c2c2e] disabled:text-[#636366]"
                          data-testid="button-start-scorecard"
                        >
                          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create free scorecard"}
                        </button>
                      </div>
                    </div>
                  )}

                  {selected && key === "excel" && (
                    <div className="setup-reveal mt-3 rounded-[18px] border border-white/[0.06] bg-[#111113] p-5 text-center">
                      <ExcelLogoMark className="mx-auto h-10 w-10" />
                      <p className="mt-3 text-[13px] text-[#a1a1a6]">
                        Upload an existing B-BBEE information-gathering workbook — RCOGP, ICT, FSC, Transport,
                        AgriBEE or Construction. The sector is read from the workbook.
                      </p>
                      <p className="mt-1.5 text-[13px] text-[#8e8e93]">
                        No tokens are charged. Sheet names and sample rows from unrecognised tabs are sent to
                        the AI mapper.
                      </p>
                      <div className="mt-4">
                        <ExcelImportButton
                          label="Choose workbook"
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#107C41] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#185C37] disabled:opacity-60"
                          onImport={handleExcelImport}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[13px]">
            {showLakeDemo && <LakeTradingDemoEntry onPick={onPick} compact />}
            <a href="/dashboard" className="font-medium text-[#d1d1d6] hover:text-white hover:underline">
              View saved scorecards
            </a>
          </div>
          <ExcelImportPreviewModal
            open={previewOpen}
            fileName={pendingFile?.name ?? ""}
            result={previewResult}
            importing={creating}
            onClose={() => {
              if (creating) return;
              setPreviewOpen(false);
              setPendingFile(null);
              setPreviewResult(null);
              setPendingSections(null);
            }}
            onConfirm={async () => {
              const companyName = String(previewResult?.data?.companyName ?? "").trim();
              const sections = pendingSections;
              if (!companyName || !sections) return;
              const ok = await createFromSections(companyName, sections, {
                importMarker: previewResult?.data,
                warnCount: previewResult?.warnings?.length ?? 0,
              });
              if (ok) {
                setPreviewOpen(false);
                setPendingFile(null);
                setPreviewResult(null);
                setPendingSections(null);
              }
            }}
          />
        </SetupShell>
      );
    }

    if (setupMethod === "upload") {
      return (
        <SetupShell step="Step 2 of 3" title="" description="" showBack onBack={() => setSetupMethod("choose")}>
          <DocumentUploadStart
            onCreate={async (companyName, sections, extras) => {
              await createFromSections(companyName, sections as WorkbookSectionsInput, {
                landOn: "estimate",
                verdicts: extras?.verdicts,
                reconcile: extras?.reconcile,
              });
            }}
            creating={creating}
          />
        </SetupShell>
      );
    }

    return (
      <div className="max-w-5xl mx-auto py-5">
        <div className="rounded-[28px] bg-[#111113] border border-white/[0.10] overflow-hidden shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
          <div className="px-5 sm:px-7 pt-6 pb-5 border-b border-white/[0.07]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  className="text-[26px] sm:text-[32px] font-semibold tracking-tight text-white leading-tight"
                  style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
                >
                  Create scorecard
                </h2>
                <p className="text-[13px] text-[#98989f] mt-2 max-w-xl leading-5">
                  Upload documents for a quote, or use a free setup path.
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-[#d1d1d6]">
                <Upload className="h-3.5 w-3.5 text-[#a78bfa]" />
                Quote before processing
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-5 py-5 space-y-4">
            {/* HERO — document-upload start: preset expected-documents flow
                (parser-classified evidence → workbook sections → same submit path). */}
            <div className="rounded-[24px] border border-violet-300/20 bg-[#17151d] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <DocumentUploadStart
                onCreate={async (companyName, sections, extras) => {
                  // Document flow lands on the provisional live-score page, not the workbook.
                  await createFromSections(companyName, sections as WorkbookSectionsInput, {
                    landOn: "estimate",
                    verdicts: extras?.verdicts,
                  });
                }}
                creating={creating}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#636366]">Free setup</p>
              <div className="h-px flex-1 bg-white/[0.07] ml-3" />
            </div>

            {/* Secondary paths: blank workbook + Excel import */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              <div className="rounded-[18px] border border-white/[0.08] bg-[#18181a] p-3.5">
                <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-[#f2f2f7]">
                  <Building2 className="h-4 w-4 text-[#8e8e93]" />
                  Manual entry
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="new-company-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && create()}
                    placeholder="Company name"
                    className="min-w-0 flex-1 bg-[#0c0c0e] border border-white/[0.10] rounded-xl px-3.5 py-2.5 text-[13px] text-white placeholder-[#636366] outline-none focus:border-violet-300/40 focus:ring-2 focus:ring-violet-300/10"
                    data-testid="input-new-company"
                  />
                  <button
                    onClick={create}
                    disabled={!newName.trim() || creating}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#2c2c2e] text-[#f2f2f7] text-[13px] font-semibold hover:bg-[#3a3a3c] disabled:opacity-50 transition-colors whitespace-nowrap"
                    data-testid="button-start-scorecard"
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Start free
                        <ChevronRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="rounded-[18px] border border-white/[0.08] bg-[#18181a] p-3.5">
                <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-[#f2f2f7]">
                  <Download className="h-4 w-4 text-[#8e8e93]" />
                  Excel import
                </div>
                <ExcelImportButton
                  label="Import workbook"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-[#0c0c0e] px-3.5 py-2.5 text-[13px] font-semibold text-[#e5e5ea] transition-colors hover:border-white/[0.16] hover:bg-[#222225] disabled:opacity-60"
                  onImport={async (file) => {
                const result = await importBeeGatheringExcel(file, API_BASE);
                if (!result.extraction.isBeeGatheringFormat) {
                  const fallback = await normalizeExcelFileWithAi(file, API_BASE);
                  if (fallback.criticalBlocked) {
                    toast({
                      title: "Import blocked — fix critical fields",
                      description: formatWorkbookValidationSummary(fallback.validationIssues, 5),
                      variant: "destructive",
                    });
                    return;
                  }
                  const companyName = String(
                    fallback.sections["company-information"]?.meta?.companyName ?? "",
                  ).trim();
                  if (!companyName) {
                    toast({
                      title: "Unrecognized Excel layout",
                      description:
                        "Upload a BEE Information Gathering file or a workbook with Company / Legal Name.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setPendingFile(file);
                  setPreviewResult({
                    data: {
                      companyName,
                      sector: String(fallback.sections["company-information"]?.meta?.industrySector ?? ""),
                      scorecardType: String(fallback.sections["company-information"]?.meta?.scorecardType ?? ""),
                      revenue: Number(fallback.sections["financial-information"]?.meta?.revenue ?? 0) || undefined,
                      npat: Number(fallback.sections["financial-information"]?.meta?.npat ?? 0) || undefined,
                    },
                    warnings: fallback.warnings,
                    fieldStatuses: { companyName: "mapped" },
                    fieldConfidences: {},
                    fieldSources: {},
                    isBeeGatheringFormat: true,
                    mappedSheets: Object.keys(fallback.mappedSheets),
                    unmappedFields: [],
                    ownershipChainTiers: [],
                    extractedFieldCount: fallback.extractedFieldCount,
                    sectionSummary: buildSectionSummary(fallback.sections),
                  });
                  setPendingSections(fallback.sections);
                  setPreviewOpen(true);
                  return;
                }
                setPendingFile(file);
                setPreviewResult(result.extraction);
                setPendingSections(result.sections);
                setPreviewOpen(true);
              }}
            />
            </div>
          </div>
          </div>

          {showLakeDemo && (
            <div className="px-6 sm:px-8 py-4 border-t border-[#2c2c2e] bg-amber-500/[0.03]">
              <LakeTradingDemoEntry onPick={onPick} compact />
            </div>
          )}
        </div>

        <ExcelImportPreviewModal
          open={previewOpen}
          fileName={pendingFile?.name ?? ""}
          result={previewResult}
          importing={creating}
          onClose={() => {
            if (creating) return;
            setPreviewOpen(false);
            setPendingFile(null);
            setPreviewResult(null);
            setPendingSections(null);
          }}
          onConfirm={async () => {
            const companyName = String(previewResult?.data?.companyName ?? "").trim();
            const sections = pendingSections;
            if (!companyName || !sections) return;
            const ok = await createFromSections(companyName, sections, {
              importMarker: previewResult?.data,
              warnCount: previewResult?.warnings?.length ?? 0,
            });
            if (ok) {
              setPreviewOpen(false);
              setPendingFile(null);
              setPreviewResult(null);
              setPendingSections(null);
            }
          }}
        />

        <p className="text-center text-[13px] text-[#636366] mt-5">
          Already have a scorecard?{" "}
          <a href="/dashboard" className="text-[#d1d1d6] hover:text-white underline underline-offset-2">
            View saved companies
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showLakeDemo && <LakeTradingDemoEntry onPick={onPick} />}

      {/* Start a new company — primary action */}
      <div
        className="relative overflow-hidden rounded-2xl border border-violet-400/20 p-6"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0.04) 45%, rgba(255,255,255,0.015) 100%)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-12 w-48 h-48 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.30) 0%, rgba(168,85,247,0) 70%)' }}
        />
        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 md:gap-6 md:items-end">
          <div>
            <h2
              className="text-[22px] font-semibold text-white tracking-tight leading-tight"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
            >
              Create scorecard
            </h2>
            <p className="text-[13px] text-[#a1a1a6] mt-1.5 max-w-md">
              Start manually for free, or import an existing BEE Information Gathering Excel file for free.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Company name…"
                aria-label="New company name"
                className="flex-1 bg-black/40 border border-white/[0.10] focus:border-violet-400/50 rounded-lg px-3.5 py-2.5 text-[14px] text-white placeholder-[#636366] outline-none transition-colors"
                data-testid="input-new-company"
              />
              <button
                onClick={create}
                disabled={!newName.trim() || creating}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-violet-500 text-white text-[13px] font-semibold press-sm hover:bg-violet-400 disabled:opacity-40 disabled:hover:bg-violet-500 smooth shadow-[0_8px_24px_-8px_rgba(139,92,246,0.6)]"
                data-testid="button-create-company"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Start free<ChevronRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
          <div className="md:pl-4 md:border-l md:border-white/[0.08]">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#8e8e93] mb-2">Or</div>
            <ExcelImportButton
              label="Import Excel (free)"
              onImport={async (file) => {
              const result = await importBeeGatheringExcel(file, API_BASE);
              if (!result.extraction.isBeeGatheringFormat) {
                const fallback = await normalizeExcelFileWithAi(file, API_BASE);
                if (fallback.criticalBlocked) {
                  toast({
                    title: "Import blocked — fix critical fields",
                    description: formatWorkbookValidationSummary(fallback.validationIssues, 5),
                    variant: "destructive",
                  });
                  return;
                }
                const companyName = String(
                  fallback.sections["company-information"]?.meta?.companyName ?? "",
                ).trim();
                if (!companyName) {
                  toast({
                    title: "Unrecognized Excel layout",
                    description:
                      "Upload a BEE Information Gathering file or a workbook with Company / Legal Name.",
                    variant: "destructive",
                  });
                  return;
                }
                setPendingFile(file);
                setPreviewResult({
                  data: {
                    companyName,
                    sector: String(fallback.sections["company-information"]?.meta?.industrySector ?? ""),
                    scorecardType: String(fallback.sections["company-information"]?.meta?.scorecardType ?? ""),
                    revenue: Number(fallback.sections["financial-information"]?.meta?.revenue ?? 0) || undefined,
                    npat: Number(fallback.sections["financial-information"]?.meta?.npat ?? 0) || undefined,
                  },
                  warnings: fallback.warnings,
                  fieldStatuses: { companyName: "mapped" },
                  fieldConfidences: {},
                  fieldSources: {},
                  isBeeGatheringFormat: true,
                  mappedSheets: Object.keys(fallback.mappedSheets),
                  unmappedFields: [],
                  ownershipChainTiers: [],
                  extractedFieldCount: fallback.extractedFieldCount,
                  sectionSummary: buildSectionSummary(fallback.sections),
                });
                setPendingSections(fallback.sections);
                setPreviewOpen(true);
                return;
              }
              setPendingFile(file);
              setPreviewResult(result.extraction);
              setPendingSections(result.sections);
              setPreviewOpen(true);
            }}
          />
            </div>
          </div>
        </div>

      {/* Existing companies */}
      <div className="rounded-2xl bg-[#141416] border border-white/[0.05] p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-semibold text-white">Your companies</h2>
            <span className="text-[11px] text-[#636366] tabular-nums">
              {loading ? "" : `${filtered.length}${search && filtered.length !== companies.length ? ` of ${companies.length}` : ""}`}
            </span>
          </div>
          <div className="relative w-full max-w-[260px]">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              aria-label="Search companies"
              className="w-full bg-black/40 border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-white placeholder-[#636366] outline-none focus:border-white/[0.18] transition-colors"
              data-testid="input-company-search"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[#8e8e93] text-[13px] py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading companies…
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] grid place-items-center mb-3">
              <Building2 className="h-5 w-5 text-[#636366]" />
            </div>
            <div className="text-[14px] text-[#d1d1d6] font-medium">No companies yet</div>
            <div className="text-[12px] text-[#636366] mt-1">Create your first one above to get started.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-[13px] text-[#636366] py-10 text-center">
            No matches for "{search}".
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[48vh] overflow-y-auto -mx-1 px-1">
            {filtered.map((c) => {
              const companyId = c.clientId || c.id || "";
              return (
                <div
                  key={companyId || c.name}
                  className="group flex items-center gap-1 rounded-xl border border-transparent bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.08] smooth"
                >
                  <button
                    type="button"
                    onClick={() => onPick(c)}
                    className="flex-1 min-w-0 text-left flex items-center justify-between px-3.5 py-3 press-sm"
                    data-testid={`company-${companyId}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-white/[0.10] to-white/[0.03] border border-white/[0.06] grid place-items-center shrink-0 group-hover:border-violet-400/30 transition-colors">
                        <Building2 className="h-4 w-4 text-[#d1d1d6] group-hover:text-violet-300 transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium text-white truncate">{c.name}</div>
                        <div className="text-[11px] text-[#636366] truncate font-mono">{companyId}</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#636366] shrink-0 ml-2 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                  </button>
                  <DeleteCompanyButton
                    companyId={companyId}
                    companyName={c.name}
                    createdByUserId={c.createdByUserId}
                    onDeleted={load}
                    className="mr-1.5"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ExcelImportPreviewModal
        open={previewOpen}
        fileName={pendingFile?.name ?? ""}
        result={previewResult}
        importing={creating}
        onClose={() => {
          if (creating) return;
          setPreviewOpen(false);
          setPendingFile(null);
          setPreviewResult(null);
          setPendingSections(null);
        }}
        onConfirm={async () => {
          const companyName = String(previewResult?.data.companyName ?? "").trim();
          const sections = pendingSections;
          if (!companyName || !sections) return;
          console.log(`[SCORING-TRACE] Excel import confirmed for ${companyName}`);
          console.log('[SCORING-TRACE] Extracted data:', JSON.stringify({
            sector: previewResult?.data.sector,
            scorecardType: previewResult?.data.scorecardType,
            revenue: previewResult?.data.revenue,
            blackOwnership: previewResult?.data.blackOwnership,
            employees: previewResult?.data.yesEmployees,
          }));
          console.log('[SCORING-TRACE] Mapped to workbook sections:', Object.fromEntries(
            Object.entries(sections).map(([k, v]) => [k, (v as any)?.rows?.length ?? 0]),
          ));
          setCreating(true);
          try {
            const res = await fetch(`${API_BASE}/api/clients`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: companyName }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              toast({
                title: "Could not create company",
                description: err.error || "Server error.",
                variant: "destructive",
              });
              return;
            }
            const c = await res.json();
            const clientId = c.clientId || c.id;
            sessionStorage.setItem(
              `okiru-excel-import-${clientId}`,
              JSON.stringify({ extracted: previewResult?.data, importedAt: new Date().toISOString() }),
            );
            const importRes = await fetch(
              `${API_BASE}/api/workbook/${encodeURIComponent(clientId)}/import`,
              {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sections }),
              },
            );
            if (!importRes.ok) {
              toast({ title: "Import failed", variant: "destructive" });
              return;
            }
            console.log('[SCORING-TRACE] POST /api/workbook/import response:', importRes.status, await importRes.clone().json().catch(() => ({})));
            let submitted = false;
            const submitRes = await fetch(
              `${API_BASE}/api/workbook/${encodeURIComponent(clientId)}/submit`,
              { method: "POST", credentials: "include" },
            );
            console.log('[SCORING-TRACE] POST /api/workbook/submit response:', submitRes.status, submitRes.ok ? await submitRes.clone().json().catch(() => ({})) : await submitRes.text().catch(() => ''));
            if (submitRes.ok) {
              submitted = true;
              try {
                await loadClientData(clientId);
              } catch {
                // Summary page will retry loadClientData.
              }
            }
            const warnCount = previewResult?.warnings?.length ?? 0;
            toast({
              title: submitted
                ? "Imported and synced to scorecard"
                : warnCount > 0
                  ? "Imported with gaps"
                  : "Workbook imported",
              description: submitted
                ? companyName
                : warnCount > 0
                  ? `${warnCount} warning(s) — open workbook and submit when ready.`
                  : `${companyName} — submit workbook to calculate score.`,
            });
            setPreviewOpen(false);
            setPendingFile(null);
            setPreviewResult(null);
            setPendingSections(null);
            onPick(c);
          } finally {
            setCreating(false);
          }
        }}
      />
    </div>
  );
}

// Single-record key/value editor for sections like Company Information or Financials.
function MetaForm({
  fields,
  value,
  onChange,
  readOnly = false,
  crossFieldErrors = {},
}: {
  fields: ColumnDef[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  crossFieldErrors?: Record<string, string>;
}) {
  const [popup, setPopup] = useState<{
    anchorRect: DOMRect;
    rawValue: string;
    suggestion: string | null;
    col: ColumnDef;
    isAiSuggestion?: boolean;
    loading?: boolean;
  } | null>(null);
  const popupAbortRef = useRef<AbortController | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  const setField = (k: string, v: unknown) => {
    if (readOnly) return;
    onChange({ ...value, [k]: v });
  };

  // AI value-suggestion popup removed per user feedback: dropdowns, format hints
  // and inline validation now guide input. The popup surfaced off-base AI
  // suggestions and reformatted already-valid entries, so it no longer runs.
  const handleBlur = (_f: ColumnDef, _rawTyped: string) => {};

  const renderField = (f: ColumnDef) => {
    const v = value[f.key];
    const blank =
      v === "" || v === undefined || v === null ||
      (typeof v === "string" && v.trim() === "");
    const err =
      crossFieldErrors[f.key] ||
      (f.required && blank ? "Required" : f.validate ? f.validate(v) : null);
    const emphasized = Boolean(f.emphasis);
    return (
      <label key={f.key} className="block" data-testid={`meta-field-${f.key}`}>
        <div className={`text-[12px] mb-1.5 flex items-center gap-1 ${emphasized ? "text-sky-200 font-medium" : "text-[#8e8e93]"}`}>
          {f.label}
          {f.required && <span className="text-status-error">*</span>}
        </div>
        {f.type === "select" ? (
          <select
            ref={(el) => { inputRefs.current[f.key] = el; }}
            value={String(v ?? "")}
            disabled={readOnly || f.readOnly}
            onChange={(e) => setField(f.key, e.target.value)}
            className={`w-full bg-[#0e0e10] border rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-[#48484a] disabled:opacity-60 ${emphasized ? "border-sky-500/50" : "border-[#2c2c2e]"}`}
          >
            <option value="" className="bg-[#1c1c1e]">—</option>
            {f.options?.map((o) => (
              <option key={o} value={o} className="bg-[#1c1c1e]">
                {o}
              </option>
            ))}
          </select>
        ) : f.type === "boolean" ? (
          <div className="flex items-center h-9">
            <input
              type="checkbox"
              checked={Boolean(v)}
              disabled={readOnly || f.readOnly}
              onChange={(e) => setField(f.key, e.target.checked)}
              className="h-4 w-4 accent-blue-500 disabled:opacity-60"
            />
          </div>
        ) : f.type === "date" ? (
          <NumericDateInput
            ref={(el) => { inputRefs.current[f.key] = el; }}
            value={String(v ?? "")}
            disabled={readOnly || f.readOnly}
            onChange={(iso) => setField(f.key, iso)}
            onBlur={(e) => handleBlur(f, e.target.value)}
            className={`w-full bg-[#0e0e10] border rounded-lg px-3 py-2 text-[13px] text-white placeholder-[#48484a] outline-none focus:border-[#48484a] disabled:opacity-60 ${err ? "border-status-error" : emphasized ? "border-sky-500/50" : "border-[#2c2c2e]"}`}
            placeholder="dd/mm/yyyy"
          />
        ) : (
          <input
            ref={(el) => { inputRefs.current[f.key] = el; }}
            type={f.type === "number" ? "number" : "text"}
            value={String(v ?? "")}
            disabled={readOnly || f.readOnly}
            readOnly={f.readOnly}
            onChange={(e) =>
              setField(
                f.key,
                f.type === "number" && e.target.value !== ""
                  ? Number(e.target.value)
                  : e.target.value,
              )
            }
            onBlur={(e) => handleBlur(f, e.target.value)}
            className={`w-full bg-[#0e0e10] border rounded-lg px-3 py-2 text-[13px] text-white placeholder-[#48484a] outline-none focus:border-[#48484a] disabled:opacity-60 ${f.readOnly ? "bg-[#141416] cursor-default" : ""} ${err ? "border-status-error" : emphasized ? "border-sky-500/50" : "border-[#2c2c2e]"}`}
            placeholder={f.required ? "Required" : ""}
          />
        )}
        {err && <div className="text-[11px] text-status-error mt-1">{err}</div>}
        {f.guidance && (emphasized || f.readOnly) && (
          <p className="text-[11px] text-[#8e8e93] mt-1.5 leading-snug">{f.guidance}</p>
        )}
      </label>
    );
  };

  type MetaUnit = { kind: "field"; field: ColumnDef } | { kind: "emphasis"; fields: ColumnDef[] };
  const units: MetaUnit[] = [];
  let emphasisBatch: ColumnDef[] = [];
  const flushEmphasis = () => {
    if (emphasisBatch.length > 0) {
      units.push({ kind: "emphasis", fields: emphasisBatch });
      emphasisBatch = [];
    }
  };
  for (const f of fields) {
    if (f.emphasis) {
      emphasisBatch.push(f);
    } else {
      flushEmphasis();
      units.push({ kind: "field", field: f });
    }
  }
  flushEmphasis();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {units.map((unit) => {
        if (unit.kind === "field") return renderField(unit.field);
        return (
          <div
            key={`emphasis-${unit.fields.map((f) => f.key).join("-")}`}
            className="md:col-span-2 rounded-xl border border-sky-500/35 bg-sky-500/[0.07] p-4"
            data-testid="meta-field-emphasis-group"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-300/90 mb-3">
              Sector-specific configuration
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {unit.fields.map((f) => renderField(f))}
            </div>
          </div>
        );
      })}
      {popup && (
        <CellValidationPopup
          rawValue={popup.rawValue}
          suggestion={popup.suggestion}
          validationMessage={popup.col.validationMessage}
          suggestionHint={popup.col.suggestionHint}
          learnMore={FIELD_LEARN_MORE[popup.col.key]}
          isAiSuggestion={popup.isAiSuggestion}
          loading={popup.loading}
          anchorRect={popup.anchorRect}
          onAccept={(val) => {
            setField(popup.col.key, val);
            setPopup(null);
          }}
          onDismiss={() => setPopup(null)}
        />
      )}
    </div>
  );
}

function ActiveSectionEditor({
  section,
  rows,
  onChange,
  workspaceId,
  clientCreatedByUserId,
  measurementPeriodEnd,
}: {
  section: NonNullable<ReturnType<typeof getSection>>;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  workspaceId?: string | null;
  clientCreatedByUserId?: string | null;
  measurementPeriodEnd?: string | null;
}) {
  const permissions = usePillarPermission(section.key, workspaceId, clientCreatedByUserId);

  if (!section.columns) return null;

  return (
    <SectionWorkbookEditor
      section={section}
      rows={rows}
      onChange={onChange}
      permissions={permissions}
      measurementPeriodEnd={measurementPeriodEnd}
    />
  );
}

function WorkbookView({ company, onBack }: { company: Company; onBack: () => void }) {
  const companyId = company.clientId || company.id || "";
  const [, navigate] = useLocation();
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [activeSectionKey, setActiveSectionKey] = useState("company-information");
  const mainPanelRef = useRef<HTMLElement>(null);
  const loadClientData = useBbeeStore((s) => s.loadClientData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const scheduleSyncRef = useRef<(() => void) | null>(null);
  // Per-section debounce timers + pending payloads so editing section B never
  // discards a pending save for section A.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}); 
  const pendingPayloads = useRef<
    Record<string, { rows?: Row[]; meta?: Record<string, unknown> }>
  >({});
  const workbookRef = useRef<Workbook | null>(null);
  const inFlight = useRef(0);
  const { toast } = useToast();

  useEffect(() => {
    workbookRef.current = workbook;
  }, [workbook]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/workbook/${encodeURIComponent(companyId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          workbookRef.current = data;
          setWorkbook(data);
          setSavedAt(data.updatedAt);
          setSubmittedAt(data.submittedAt ?? null);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    fetch(`${API_BASE}/api/workspaces`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ id?: string; workspaceId?: string }>) => {
        const first = Array.isArray(list) ? list[0] : null;
        if (first) setWorkspaceId(first.id || first.workspaceId || null);
      })
      .catch(() => {});
  }, []);

  const activeSectionPermissions = usePillarPermission(
    activeSectionKey,
    workspaceId,
    company.createdByUserId,
  );

  const saveSection = useCallback(
    async (
      sectionKey: string,
      body: { rows?: Row[]; meta?: Record<string, unknown> },
    ): Promise<boolean> => {
      setSaving(true);
      setSaveError(null);
      inFlight.current += 1;
      try {
        const res = await fetch(
          `${API_BASE}/api/workbook/${encodeURIComponent(companyId)}/section/${sectionKey}`,
          {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: body.rows ?? [], meta: body.meta }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          setSavedAt(data.updatedAt);
          scheduleSyncRef.current?.();
          return true;
        }
        const msg = `Save failed (${res.status})`;
        setSaveError(msg);
        toast({ title: msg, variant: "destructive" });
        return false;
      } catch {
        setSaveError("Network error");
        toast({
          title: "Save failed",
          description: "Network error — will retry on next change.",
          variant: "destructive",
        });
        return false;
      } finally {
        inFlight.current -= 1;
        if (inFlight.current <= 0) setSaving(false);
      }
    },
    [companyId, toast],
  );

  const scheduleSave = useCallback(
    (sectionKey: string, body: { rows?: Row[]; meta?: Record<string, unknown> }) => {
      pendingPayloads.current[sectionKey] = mergeWorkbookSectionSaveBody(
        pendingPayloads.current[sectionKey],
        body,
        workbookRef.current?.sections[sectionKey],
      );
      const existing = saveTimers.current[sectionKey];
      if (existing) clearTimeout(existing);
      saveTimers.current[sectionKey] = setTimeout(() => {
        const payload = pendingPayloads.current[sectionKey];
        delete saveTimers.current[sectionKey];
        delete pendingPayloads.current[sectionKey];
        if (payload) saveSection(sectionKey, payload);
      }, 800);
    },
    [saveSection],
  );

  const flushAllPending = useCallback(async (): Promise<boolean> => {
    const keys = Object.keys(saveTimers.current);
    let allOk = true;
    for (const key of keys) {
      const t = saveTimers.current[key];
      if (t) clearTimeout(t);
      const payload = pendingPayloads.current[key];
      delete saveTimers.current[key];
      delete pendingPayloads.current[key];
      if (payload) {
        const ok = await saveSection(key, payload);
        if (!ok) allOk = false;
      }
    }
    return allOk;
  }, [saveSection]);

  const handleRowsChange = useCallback(
    (sectionKey: string, rows: Row[]) => {
      setWorkbook((prev) => {
        if (!prev) return prev;
        const current = prev.sections[sectionKey] || { rows: [] };
        const next: Workbook = {
          ...prev,
          sections: { ...prev.sections, [sectionKey]: { ...current, rows } },
        };
        workbookRef.current = next;
        return next;
      });
      const sec = workbookRef.current?.sections[sectionKey];
      scheduleSave(sectionKey, {
        rows,
        ...(sec?.meta !== undefined ? { meta: sec.meta } : {}),
      });
    },
    [scheduleSave],
  );

  const handleMetaChange = useCallback(
    (sectionKey: string, meta: Record<string, unknown>) => {
      let next = meta;
      const sectionPatches: Record<string, { meta: Record<string, unknown> }> = {};
      // Read sibling sections from the live ref, NOT the `workbook` closure value:
      // handleMetaChange only depends on [scheduleSave], so `workbook` is stale and
      // reading financial meta from it wiped real financials when the sector changed
      // (the cross-section patch rebuilt financial-information from an empty copy).
      const wb = workbookRef.current;

      if (sectionKey === "company-information") {
        const prevMeta = (wb?.sections[sectionKey]?.meta ?? {}) as Record<string, unknown>;
        const prevSector = String(prevMeta.industrySector ?? "").trim().toUpperCase();
        const newSector = String(meta.industrySector ?? "").trim().toUpperCase();
        if (newSector !== prevSector) {
          next = {
            ...meta,
            scorecardType: resolveScorecardTypeForSector(newSector, meta.scorecardType),
          };
          const finMeta = (wb?.sections["financial-information"]?.meta ?? {}) as Record<
            string,
            unknown
          >;
          const norm = lookupIndustryNormPercent(undefined, newSector);
          if (norm != null) {
            sectionPatches["financial-information"] = {
              meta: { ...finMeta, industryNormPercent: norm },
            };
          }
          if (prevSector === "FSC" && newSector !== "FSC") {
            next = pruneCompanyMetaWhenLeavingFsc(next);
            let finNext = pruneFinancialMetaWhenLeavingFsc(
              (sectionPatches["financial-information"]?.meta ?? finMeta) as Record<string, unknown>,
            );
            if (norm != null) finNext = { ...finNext, industryNormPercent: norm };
            sectionPatches["financial-information"] = { meta: finNext };
            sectionPatches["afs-additions"] = { meta: {} };
            const sedMeta = (wb?.sections["sed"]?.meta ?? {}) as Record<string, unknown>;
            sectionPatches["sed"] = { meta: pruneSedMetaWhenLeavingFsc(sedMeta) };
          }
        }

        const prevFsc = String(prevMeta.fscSubSector ?? "");
        const newFsc = String(next.fscSubSector ?? "");
        if (newSector === "FSC" && newFsc && prevFsc !== newFsc) {
          const finMeta = (wb?.sections["financial-information"]?.meta ?? {}) as Record<
            string,
            unknown
          >;
          const existingAfs = (wb?.sections["afs-additions"]?.meta ?? {}) as Record<
            string,
            unknown
          >;
          sectionPatches["financial-information"] = {
            meta: stripAfsMetaFromFinancial(finMeta),
          };
          sectionPatches["afs-additions"] = {
            meta: fscSubSectorHasAfs(newFsc)
              ? extractAfsMetaForSubSector(finMeta, newFsc, existingAfs)
              : {},
          };
        }
      }

      if (sectionKey === "financial-information") {
        const companyMeta = (wb?.sections["company-information"]?.meta ?? {}) as Record<
          string,
          unknown
        >;
        const sector = String(companyMeta.industrySector ?? "").trim().toUpperCase();
        const norm = lookupIndustryNormPercent(undefined, sector);
        const stored = next.industryNormPercent;
        const hasStored =
          stored !== "" && stored !== undefined && stored !== null && Number(stored) > 0;
        if (norm != null && !hasStored) {
          next = { ...next, industryNormPercent: norm };
        }
      }

      setWorkbook((prev) => {
        if (!prev) return prev;
        const current = prev.sections[sectionKey] || { rows: [] };
        const sections = {
          ...prev.sections,
          [sectionKey]: { ...current, meta: next },
        };
        for (const [key, patch] of Object.entries(sectionPatches)) {
          const sec = prev.sections[key] || { rows: [] };
          sections[key] = { ...sec, meta: patch.meta };
        }
        const updated: Workbook = { ...prev, sections };
        workbookRef.current = updated;
        return updated;
      });

      const primaryRows = workbookRef.current?.sections[sectionKey]?.rows ?? [];
      scheduleSave(sectionKey, { rows: primaryRows, meta: next });
      for (const [key, patch] of Object.entries(sectionPatches)) {
        const patchRows = workbookRef.current?.sections[key]?.rows ?? [];
        scheduleSave(key, { rows: patchRows, meta: patch.meta });
      }
    },
    [scheduleSave],
  );

  const waitForInFlight = useCallback(async () => {
    const start = Date.now();
    while (inFlight.current > 0 && Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }, []);

  const handleManualSave = useCallback(async () => {
    if (!workbook) return;
    await flushAllPending();
    await waitForInFlight();
    toast({ title: "All sections saved" });
  }, [workbook, flushAllPending, waitForInFlight, toast]);

  const handleExport = useCallback(() => {
    window.open(
      `${API_BASE}/api/workbook/${encodeURIComponent(companyId)}/export.xlsx`,
      "_blank",
    );
  }, [companyId]);

  // Warn on close/refresh when there's an unflushed scheduled save.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasPending = Object.keys(saveTimers.current).length > 0;
      if (hasPending || inFlight.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const syncWorkbookToScorecard = useCallback(
    async (opts?: { quiet?: boolean; skipFlush?: boolean }): Promise<boolean> => {
      if (!workbook || syncInFlightRef.current) return false;
      syncInFlightRef.current = true;
      setSyncing(true);
      setSyncStatus("syncing");
      try {
        if (!opts?.skipFlush) {
          await waitForInFlight();
          const ok = await flushAllPending();
          await waitForInFlight();
          if (!ok || saveError) {
            if (!opts?.quiet) {
              toast({
                title: "Sync aborted",
                description:
                  "Unsaved changes failed to save — fix the save error and try again.",
                variant: "destructive",
              });
            }
            return false;
          }
        } else {
          await waitForInFlight();
        }
        const res = await fetch(
          `${API_BASE}/api/workbook/${encodeURIComponent(companyId)}/sync`,
          { method: "POST", credentials: "include" },
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setSubmittedAt(data.submittedAt || new Date().toISOString());
          setSyncStatus("synced");
          localStorage.setItem("okiru-pro-active-client", companyId);
          invalidateClientData(companyId);
          try {
            await loadClientData(companyId);
          } catch {
            // Summary / toolkit will retry loadClientData.
          }
          const warnCount = Array.isArray(data.warnings) ? data.warnings.length : 0;
          if (!opts?.quiet && warnCount > 0) {
            toast({
              title: "Scorecard synced with gaps",
              description: `${warnCount} pillar gap(s) — affected areas may score 0 until fixed.`,
            });
          }
          return true;
        }
        setSyncStatus("error");
        if (!opts?.quiet) {
          toast({
            title: "Scorecard sync failed",
            description: data.error || data.summary || `Server returned ${res.status}.`,
            variant: "destructive",
          });
        }
        return false;
      } catch {
        setSyncStatus("error");
        if (!opts?.quiet) {
          toast({
            title: "Scorecard sync failed",
            description: "Network error.",
            variant: "destructive",
          });
        }
        return false;
      } finally {
        syncInFlightRef.current = false;
        setSyncing(false);
      }
    },
    [companyId, workbook, flushAllPending, waitForInFlight, saveError, toast, loadClientData],
  );

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void syncWorkbookToScorecard({ quiet: true });
    }, 1200);
  }, [syncWorkbookToScorecard]);

  scheduleSyncRef.current = scheduleSync;

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const handleContinueToSummary = useCallback(async () => {
    await waitForInFlight();
    const ok = await flushAllPending();
    await waitForInFlight();
    if (!ok || saveError) {
      toast({
        title: "Could not save latest edits",
        description: "Fix the save error before leaving, or use Save and try again.",
        variant: "destructive",
      });
      return;
    }
    localStorage.setItem("okiru-pro-active-client", companyId);
    navigate(`/create-scorecard/${encodeURIComponent(companyId)}/summary`);
    void syncWorkbookToScorecard({ quiet: true, skipFlush: true });
  }, [companyId, flushAllPending, waitForInFlight, saveError, navigate, syncWorkbookToScorecard, toast]);

  const handleExcelImport = useCallback(
    async (file: File) => {
      try {
        const bee = await importBeeGatheringExcel(file, API_BASE);
        const result = bee.extraction.isBeeGatheringFormat
          ? { sections: bee.sections, validationIssues: bee.validationIssues, criticalBlocked: bee.criticalBlocked, warnings: bee.extraction.warnings }
          : await normalizeExcelFileWithAi(file, API_BASE);

        if (result.criticalBlocked) {
          toast({
            title: "Import blocked — fix critical fields",
            description: formatWorkbookValidationSummary(result.validationIssues, 5),
            variant: "destructive",
          });
          return;
        }

        // Only send sections that actually parsed data. The server replaces each
        // section it receives by key (persistSection), so posting empty sections
        // would wipe rows that didn't parse instead of leaving them untouched.
        const populatedSections = Object.fromEntries(
          Object.entries(result.sections ?? {}).filter(([, sec]) => {
            const rows = (sec as { rows?: unknown[] } | undefined)?.rows;
            const meta = (sec as { meta?: Record<string, unknown> } | undefined)?.meta;
            const hasRows = Array.isArray(rows) && rows.length > 0;
            const hasMeta = !!meta && Object.keys(meta).length > 0;
            return hasRows || hasMeta;
          }),
        ) as typeof result.sections;

        if (Object.keys(populatedSections).length === 0) {
          toast({
            title: "Nothing to import",
            description:
              "No recognisable data was found in that file. Check the sheet names and column headers match the expected template.",
            variant: "destructive",
          });
          return;
        }

        const res = await fetch(
          `${API_BASE}/api/workbook/${encodeURIComponent(companyId)}/import`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sections: populatedSections }),
          },
        );
        if (!res.ok) {
          toast({ title: "Import failed", variant: "destructive" });
          return;
        }
        setWorkbook((prev) =>
          prev ? { ...prev, sections: { ...prev.sections, ...populatedSections } } : prev,
        );
        if (result.validationIssues.length > 0) {
          toast({
            title: "Imported with gaps",
            description:
              "Non-critical fields missing — review sections before submit. Scores may reflect discounted levels.",
          });
        } else {
          toast({ title: "Workbook updated from Excel" });
        }
      } catch (err) {
        // Previously any thrown error (bad file, network/AI failure) fell through
        // with no UI feedback — the button just appeared to do nothing.
        toast({
          title: "Couldn't import file",
          description:
            err instanceof Error
              ? err.message
              : "The file could not be read. Make sure it's a valid .xlsx workbook and try again.",
          variant: "destructive",
        });
      }
    },
    [companyId, toast],
  );

  const sectorCode = String(
    (workbook?.sections["company-information"]?.meta as Record<string, unknown> | undefined)
      ?.industrySector ?? "",
  );

  const scorecardType = String(
    (workbook?.sections["company-information"]?.meta as Record<string, unknown> | undefined)
      ?.scorecardType ?? "",
  );

  const fscSubSector = String(
    (workbook?.sections["company-information"]?.meta as Record<string, unknown> | undefined)
      ?.fscSubSector ?? "",
  );

  const fscReinsurer = Boolean(
    (workbook?.sections["company-information"]?.meta as Record<string, unknown> | undefined)
      ?.fscReinsurer,
  );

  /**
   * The date certificate validity is judged against. The explicit period end
   * first, the financial year-end as the fallback — they are the same date on
   * most engagements, and one of the two is nearly always filled.
   */
  const measurementPeriodEnd = (() => {
    const meta = workbook?.sections["company-information"]?.meta as
      | Record<string, unknown>
      | undefined;
    const end = meta?.measurementPeriodEnd ?? meta?.financialYearEnd;
    return end ? String(end) : null;
  })();

  const sectionGroups: SectionGroup[] = useMemo(
    () => getSectionGroupsForSector(sectorCode, fscSubSector),
    [sectorCode, fscSubSector],
  );

  const orderedKeys = useMemo(
    () => getOrderedSectionKeysForSector(sectorCode, fscSubSector),
    [sectorCode, fscSubSector],
  );

  const enabledSections = useMemo(() => {
    return orderedKeys
      .map((k) => getSection(k, sectorCode, scorecardType, fscSubSector, fscReinsurer))
      .filter((s): s is NonNullable<ReturnType<typeof getSection>> => Boolean(s?.enabled));
  }, [orderedKeys, sectorCode, scorecardType, fscSubSector, fscReinsurer]);

  const selectSection = useCallback((key: string) => {
    setActiveSectionKey(key);
    requestAnimationFrame(() => {
      mainPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const activeSection =
    enabledSections.find((s) => s.key === activeSectionKey) ?? enabledSections[0];

  const sectionStatus = (key: string): "empty" | "filled" => {
    const sec = workbook?.sections[key];
    if (!sec) return "empty";
    const def = getSection(key, sectorCode, scorecardType, fscSubSector, fscReinsurer);
    if (def?.meta) {
      const m = (sec.meta || {}) as Record<string, unknown>;
      const hasMeta = Object.values(m).some((v) => v !== "" && v != null);
      if (hasMeta) return "filled";
      // For hybrid sections (meta + columns), also check rows.
      if (def.columns && (sec.rows?.length || 0) > 0) return "filled";
      return "empty";
    }
    return (sec.rows?.length || 0) > 0 ? "filled" : "empty";
  };

  const saveStatusText = saving
    ? "Saving…"
    : syncing
      ? "Updating scorecard…"
      : saveError
        ? saveError
        : syncStatus === "synced" && submittedAt
          ? `Scorecard updated ${new Date(submittedAt).toLocaleTimeString()}`
          : savedAt
            ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
            : "";

  const renderSectionTab = (key: string, variant: "sidebar" | "tabs", indent: boolean) => {
    const sec = enabledSections.find((s) => s.key === key);
    if (!sec) return null;
    const status = sectionStatus(sec.key);
    const count = workbook?.sections[sec.key]?.rows?.length || 0;
    const isActive = activeSectionKey === sec.key;
    const indicator = sec.meta
      ? status === "filled"
        ? "✓"
        : "—"
      : count > 0
        ? String(count)
        : "—";
    const baseClass =
      variant === "sidebar"
        ? `w-full text-left px-3 py-2 rounded-lg text-[13px] flex items-center justify-between smooth press-sm ${indent ? "pl-6" : ""}`
        : "shrink-0 px-3 py-2 rounded-lg text-[12px] flex items-center gap-2 smooth press-sm whitespace-nowrap";
    return (
      <button
        key={sec.key}
        onClick={() => selectSection(sec.key)}
        className={`${baseClass} ${
          isActive
            ? "bg-white/[0.08] text-white"
            : "text-[#8e8e93] hover:bg-white/[0.04] hover:text-[#d1d1d6]"
        }`}
        data-testid={`tab-${sec.key}`}
      >
        <span className={variant === "sidebar" ? "truncate" : ""}>{sec.label}</span>
        <span
          className={`text-[10px] tabular-nums ${status === "filled" ? "text-status-success" : "text-[#636366]"}`}
        >
          {indicator}
        </span>
      </button>
    );
  };

  const renderSectionNav = (variant: "sidebar" | "tabs") => {
    const out: ReactNode[] = [];
    for (const group of sectionGroups) {
      if (group.isGroup && variant === "sidebar") {
        out.push(
          <div
            key={`group-${group.key}`}
            className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.14em] text-[#636366]"
            data-testid={`group-header-${group.key}`}
          >
            {group.label}
          </div>,
        );
        for (const k of group.sectionKeys) {
          const node = renderSectionTab(k, variant, true);
          if (node) out.push(node);
        }
      } else if (group.isGroup && variant === "tabs") {
        // Mobile horizontal nav: render a chip-style group label, then the
        // child tabs wrapped in a bracketed container so the grouping is
        // visible even though we can't indent on a horizontal axis.
        out.push(
          <div
            key={`group-chip-${group.key}`}
            data-testid={`group-chip-${group.key}`}
            className="shrink-0 inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]"
          >
            <span className="text-[10px] uppercase tracking-[0.12em] text-[#8e8e93] whitespace-nowrap">
              {group.label}
            </span>
            <div className="flex items-center gap-1">
              {group.sectionKeys.map((k) => renderSectionTab(k, variant, false))}
            </div>
          </div>,
        );
      } else {
        for (const k of group.sectionKeys) {
          const node = renderSectionTab(k, variant, false);
          if (node) out.push(node);
        }
      }
    }
    return out;
  };

  const activeSectionData = workbook?.sections[activeSection?.key ?? ""] || {
    rows: [],
    meta: {},
  };
  const activeRows = activeSectionData.rows || [];
  const activeMeta = (activeSectionData.meta || {}) as Record<string, unknown>;
  const companyMetaForFin = (workbook?.sections["company-information"]?.meta ?? {}) as Record<
    string,
    unknown
  >;
  const activeMetaFields = activeSection?.meta
    ? activeSection.key === "company-information"
      ? getCompanyInfoMetaFields(String(activeMeta.industrySector ?? ""))
      : activeSection.meta
    : undefined;

  const financialMetaWithNorm = useMemo(() => {
    if (activeSection?.key !== "financial-information") return activeMeta;
    const sector = String(companyMetaForFin.industrySector ?? "");
    const norm = lookupIndustryNormPercent(undefined, sector);
    const stored = activeMeta.industryNormPercent;
    const hasStored =
      stored !== "" && stored !== undefined && stored !== null && Number(stored) > 0;
    if (!hasStored && norm != null) {
      return { ...activeMeta, industryNormPercent: norm };
    }
    return activeMeta;
  }, [activeSection?.key, activeMeta, companyMetaForFin.industrySector]);

  const activeMetaFieldsResolved = useMemo(() => {
    if (!activeMetaFields) return undefined;
    if (activeSection?.key !== "financial-information") return activeMetaFields;
    return filterVisibleFinancialMetaFields(activeMetaFields, financialMetaWithNorm);
  }, [activeMetaFields, activeSection?.key, financialMetaWithNorm]);

  const activeMetaCrossFieldErrors =
    activeSection?.key === "financial-information"
      ? validateFinancialMetaCrossFields(financialMetaWithNorm)
      : {};

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("okiru-workbook-active-section", activeSectionKey);
  }, [activeSectionKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-[12px] text-[#8e8e93] hover:text-white smooth press-sm"
            data-testid="button-change-company"
          >
            ← Change company
          </button>
          <span className="text-[#3a3a3c]">|</span>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#8e8e93]" />
            <span className="text-[14px] font-semibold text-white">{company.name}</span>
            <span className="text-[11px] text-[#636366]">{companyId}</span>
          </div>
          {syncStatus === "synced" && submittedAt && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success-bg text-status-success text-[10px] font-semibold uppercase tracking-wide">
              <CheckCircle2 className="h-3 w-3" /> Synced
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] ${saveError ? "text-status-error" : "text-[#636366]"}`}
            data-testid="save-status"
          >
            {saveStatusText}
          </span>
          <button
            onClick={handleManualSave}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[12px] text-[#d1d1d6] smooth press-sm"
            data-testid="button-save"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[12px] text-[#d1d1d6] smooth press-sm"
            data-testid="button-export"
          >
            <Download className="h-3.5 w-3.5" /> Download Excel
          </button>
          <ExcelImportButton onImport={handleExcelImport} disabled={loading || !workbook} />
          <button
            onClick={() => void handleContinueToSummary()}
            disabled={loading || !workbook}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold smooth press-sm disabled:opacity-60"
            data-testid="button-continue-summary"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            Continue to Summary
          </button>
          {syncStatus === "syncing" && (
            <span className="text-[10px] text-[#636366]">Syncing scorecard…</span>
          )}
        </div>
      </div>

      {/* The AI reasoning surface: what was read, grounded fills to confirm,
          conflicts to decide, missing fields grouped into single decisions.
          Renders only on document-built workbooks (rows carrying provenance). */}
      {workbook && (
        <ExtractionReviewModal
          sections={workbook.sections}
          onNavigateToSection={selectSection}
          onApplyMetaValue={(sectionKey: string, column: string, value: string) => {
            // Settle an entity-level figure the documents disagreed on.
            //
            // The resolved conflict is REMOVED as the value is written, in the
            // same update. Leaving it behind would re-ask a question the user
            // has just answered every time the review recomputes, and the
            // review reads the cell to decide whether a choice is still live —
            // so the two must move together or the modal contradicts itself.
            const wb = workbookRef.current;
            const prev = (wb?.sections[sectionKey]?.meta ?? {}) as Record<string, unknown>;
            const remaining = Array.isArray(prev[META_CONFLICTS_KEY])
              ? (prev[META_CONFLICTS_KEY] as Array<Record<string, unknown>>).filter(
                  (c) => String(c.column) !== column,
                )
              : [];
            handleMetaChange(sectionKey, {
              ...prev,
              [column]: value,
              [META_CONFLICTS_KEY]: remaining,
            });
          }}
          onApplyCellUpdates={(sectionKey: string, updates: CellUpdate[]) => {
            const current = (workbookRef.current?.sections[sectionKey]?.rows ?? []) as Row[];
            const byRow = new Map<string, CellUpdate[]>();
            for (const u of updates) {
              const list = byRow.get(u.rowId) ?? [];
              list.push(u);
              byRow.set(u.rowId, list);
            }
            const nextRows = current.map((row) => {
              const rowUpdates = byRow.get(String((row as Record<string, unknown>)._id ?? ""));
              if (!rowUpdates) return row;
              const next = { ...row } as Row;
              for (const u of rowUpdates) {
                // FILL BLANKS ONLY, checked against the cell as it is RIGHT NOW.
                //
                // Suggestions are minted for empty cells, but the workbook can
                // move between minting and applying — the user edits a cell, or
                // an earlier item in the same "Apply all" already filled it.
                // This wrote regardless, so a batch could overwrite a value the
                // user had just typed with one derived before they typed it.
                const cell = (next as Record<string, unknown>)[u.column];
                const empty = cell === undefined || cell === null || String(cell).trim() === "";
                if (empty) (next as Record<string, unknown>)[u.column] = u.value;
              }
              return next;
            });
            handleRowsChange(sectionKey, nextRows);
          }}
        />
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="lg:hidden w-full space-y-3">
          {workbook && (
            <WorkbookValidationPanel
              sections={workbook.sections}
              activeSectionKey={activeSectionKey}
              onSelectSection={selectSection}
            />
          )}
          <div className="-mx-1 px-1 overflow-x-auto">
            <div className="flex gap-1.5 min-w-max pb-1" data-testid="workbook-mobile-tabs">
              {renderSectionNav("tabs")}
            </div>
          </div>
        </div>

        <aside className="hidden lg:block w-full lg:w-64 shrink-0 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:z-10 space-y-3">
          {workbook && (
            <WorkbookValidationPanel
              sections={workbook.sections}
              activeSectionKey={activeSectionKey}
              onSelectSection={selectSection}
            />
          )}
          <div className="rounded-xl bg-[#1c1c1e] p-2" data-testid="workbook-tabs">
            {renderSectionNav("sidebar")}
          </div>
        </aside>

        <section
          ref={mainPanelRef}
          className="flex-1 min-w-0 scroll-mt-24"
          data-testid={`section-panel-${activeSection?.key ?? "unknown"}`}
        >
          {loading ? (
            <div className="rounded-2xl bg-[#1c1c1e] p-6 flex items-center justify-center py-12 text-[#8e8e93] text-[13px]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading workbook…
            </div>
          ) : activeSection ? (
            <div className="rounded-2xl bg-[#1c1c1e] overflow-hidden">
              {activeMetaFieldsResolved && activeSection?.columns ? (
                // Hybrid section: MetaForm for aggregate inputs + grid for data rows.
                <>
                  <div className="px-6 py-4 border-b border-white/[0.06]">
                    <h2 className="text-[18px] font-bold tracking-tight text-white">
                      {activeSection.label}
                    </h2>
                    <p className="text-[13px] text-[#8e8e93] mt-0.5">{activeSection.description}</p>
                  </div>
                  <div className="px-6 pt-5 pb-4 border-b border-white/[0.04]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#636366] mb-4">
                      Section inputs
                    </p>
                    {activeSectionPermissions.loading ? (
                      <div className="text-[13px] text-[#8e8e93] flex items-center gap-2 py-4">
                        <Loader2 className="h-4 w-4 animate-spin" /> Checking permissions…
                      </div>
                    ) : (
                      <>
                        {!activeSectionPermissions.canEdit && (
                          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
                            You have <span className="font-semibold">read-only</span> access to this section — changes here won't be saved. Ask the workspace owner to grant you edit access to this pillar.
                          </div>
                        )}
                        <MetaForm
                          fields={activeMetaFieldsResolved}
                          value={
                            activeSection.key === "financial-information"
                              ? financialMetaWithNorm
                              : activeMeta
                          }
                          readOnly={!activeSectionPermissions.canEdit}
                          crossFieldErrors={activeMetaCrossFieldErrors}
                          onChange={(next) => handleMetaChange(activeSection.key, next)}
                        />
                      </>
                    )}
                  </div>
                  <div className="pt-2">
                    <div className="px-6 pt-4 pb-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#636366]">
                        {activeSection.gridLabel ?? "Training programme entries"}
                      </p>
                    </div>
                    <ActiveSectionEditor
                      section={activeSection}
                      rows={activeRows}
                      workspaceId={workspaceId}
                      clientCreatedByUserId={company.createdByUserId}
                      measurementPeriodEnd={measurementPeriodEnd}
                      onChange={(nextRows) => handleRowsChange(activeSection.key, nextRows)}
                    />
                  </div>
                </>
              ) : activeMetaFieldsResolved ? (
                <>
                  <div className="px-6 py-4 border-b border-white/[0.06]">
                    <h2 className="text-[18px] font-bold tracking-tight text-white">
                      {activeSection.label}
                    </h2>
                    <p className="text-[13px] text-[#8e8e93] mt-0.5">{activeSection.description}</p>
                  </div>
                  <div className="px-6 pb-6 pt-5">
                    {activeSectionPermissions.loading ? (
                      <div className="text-[13px] text-[#8e8e93] flex items-center gap-2 py-4">
                        <Loader2 className="h-4 w-4 animate-spin" /> Checking permissions…
                      </div>
                    ) : (
                      <>
                        {!activeSectionPermissions.canEdit && (
                          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
                            You have <span className="font-semibold">read-only</span> access to this section — changes here won't be saved. Ask the workspace owner to grant you edit access to this pillar.
                          </div>
                        )}
                        <MetaForm
                          fields={activeMetaFieldsResolved}
                          value={
                            activeSection.key === "financial-information"
                              ? financialMetaWithNorm
                              : activeMeta
                          }
                          readOnly={!activeSectionPermissions.canEdit}
                          crossFieldErrors={activeMetaCrossFieldErrors}
                          onChange={(next) => handleMetaChange(activeSection.key, next)}
                        />
                      </>
                    )}
                  </div>
                </>
              ) : activeSection.columns ? (
                <ActiveSectionEditor
                  section={activeSection}
                  rows={activeRows}
                  workspaceId={workspaceId}
                  clientCreatedByUserId={company.createdByUserId}
                  measurementPeriodEnd={measurementPeriodEnd}
                  onChange={(nextRows) => handleRowsChange(activeSection.key, nextRows)}
                />
              ) : (
                <>
                  <div className="px-6 py-4 border-b border-white/[0.06]">
                    <h2 className="text-[18px] font-bold tracking-tight text-white">
                      {activeSection.label}
                    </h2>
                    <p className="text-[13px] text-[#8e8e93] mt-0.5">{activeSection.description}</p>
                  </div>
                  <div className="px-6 pb-6">
                    <div className="rounded-xl border border-dashed border-[#2c2c2e] bg-[#0e0e10] py-16 px-6 text-center mt-5">
                      <p className="text-[13px] text-[#636366]">No editor configured for this section.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function InformationRequest() {
  const params = useParams<{ companyId?: string }>();
  const [location, navigate] = useLocation();
  const [picked, setPicked] = useState<Company | null>(null);
  const basePath = location.startsWith("/create-scorecard") ? "/create-scorecard" : "/information-request";
  const pageTitle = basePath === "/create-scorecard" ? "Create Scorecard" : "Information Request";
  const isCreateScorecardFlow = basePath === "/create-scorecard";
  const isSummaryStep = isCreateScorecardFlow && /\/summary\/?$/.test(location);
  // Provisional live-score page — the destination of the document-upload flow.
  const isEstimateStep = isCreateScorecardFlow && /\/estimate\/?$/.test(location);
  const resolvedCompanyId = params.companyId || picked?.clientId || picked?.id || "";

  // Dynamic back button: remember where the user navigated from.
  // Reads sessionStorage once on mount (set by Dashboard and WorkbookScoreSummary
  // before they navigate here), then clears it to avoid stale values.
  const [backOrigin, setBackOrigin] = useState<string | null>(() => {
    try {
      const from = sessionStorage.getItem("okiru-workbook-from");
      if (from) sessionStorage.removeItem("okiru-workbook-from");
      return from;
    } catch {
      return null;
    }
  });

  // When navigating from the summary view back to the workbook editor *within*
  // the same InformationRequest component session (isSummaryStep goes true → false),
  // update backOrigin so the header back button points back to Summary.
  const prevIsSummaryRef = useRef(isSummaryStep);
  useEffect(() => {
    if (prevIsSummaryRef.current && !isSummaryStep) {
      setBackOrigin("summary");
    }
    prevIsSummaryRef.current = isSummaryStep;
  }, [isSummaryStep]);

  // Derive the back-button destination and label from the tracked origin.
  const backHref = (() => {
    if (backOrigin === "saved-companies") return "/dashboard";
    if (backOrigin === "summary" && resolvedCompanyId) {
      return `/create-scorecard/${encodeURIComponent(resolvedCompanyId)}/summary`;
    }
    return isCreateScorecardFlow ? "/hub" : "/dashboard";
  })();
  const backLabel = (() => {
    if (backOrigin === "saved-companies") return "Saved Companies";
    if (backOrigin === "summary") return "Summary";
    return isCreateScorecardFlow ? "Hub" : "Dashboard";
  })();

  useEffect(() => {
    if (params.companyId && !picked) {
      fetch(`${API_BASE}/api/clients/${params.companyId}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => c && setPicked(c));
    }
  }, [params.companyId, picked]);

  useEffect(() => {
    if (isCreateScorecardFlow && !params.companyId && picked) {
      setPicked(null);
    }
  }, [isCreateScorecardFlow, params.companyId, picked]);

  const handlePick = (c: Company) => {
    setPicked(c);
    const id = c.clientId || c.id;
    if (id) navigate(`${basePath}/${id}`, { replace: true });
  };

  // Document flow: land on the provisional live-score page (not the workbook).
  const handlePickEstimate = (c: Company) => {
    setPicked(c);
    const id = c.clientId || c.id;
    if (id) navigate(`/create-scorecard/${encodeURIComponent(id)}/estimate`, { replace: true });
  };

  const handleBack = () => {
    setPicked(null);
    navigate(basePath, { replace: true });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="h-14 shrink-0 z-20 sticky top-0 bg-black" style={{ borderBottom: "1px solid #2c2c2e" }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AppNavBack
              href={backHref}
              eyebrow="Back"
              label={backLabel}
              variant="dark"
              className="shrink-0"
            />
            <div className="w-px h-5 bg-[#2c2c2e] hidden sm:block" />
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-[8px] bg-violet-500/15 border border-violet-400/30 flex items-center justify-center shrink-0">
                <img
                  src={logoCircle}
                  alt="Okiru"
                  className="h-5 w-5 rounded-[6px] object-contain"
                  style={{
                    filter:
                      "brightness(0) saturate(100%) invert(48%) sepia(79%) saturate(2476%) hue-rotate(245deg) brightness(98%) contrast(98%)",
                  }}
                />
              </div>
              <span className="text-lg font-semibold tracking-tight text-white border-l border-[#2c2c2e] pl-3">
                {pageTitle}
              </span>
            </div>
          </div>
          <UserAccountMenu variant="dashboard" />
        </div>
      </header>

      <main className={basePath === "/create-scorecard" && !picked ? "mx-auto px-4 sm:px-6 py-8" : "max-w-[1400px] mx-auto px-4 sm:px-6 py-10"}>
        {!isSummaryStep && !picked && basePath !== "/create-scorecard" && (
          <div className="mb-10 max-w-3xl">
            <div className="flex items-center gap-2 mb-4 text-[11px] font-medium tracking-[0.18em] uppercase text-[#8e8e93]">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400/80" />
              Workbook
            </div>
            <h1
              className="text-[40px] sm:text-[52px] font-semibold tracking-tight text-white leading-[1.04]"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
            >
              Company Assessment Workbook
            </h1>
            <p className="mt-4 text-[15px] text-[#a1a1a6] leading-relaxed">
              Structured spreadsheet collection - replaces manual onboarding sheets.
            </p>
          </div>
        )}
        {!isSummaryStep && !isEstimateStep && picked && (
          <div className="mb-6">
            <h1 className="text-[24px] font-semibold tracking-tight text-white">
              {picked.name}
            </h1>
            <p className="text-[13px] text-[#8e8e93] mt-1">
              Complete each section — scores sync automatically as you save. Continue to Summary anytime.
            </p>
          </div>
        )}

        {picked ? (
          isEstimateStep && resolvedCompanyId ? (
            <WorkbookScoreSummary companyId={resolvedCompanyId} companyName={picked.name} provisional />
          ) : isSummaryStep && resolvedCompanyId ? (
            <WorkbookScoreSummary companyId={resolvedCompanyId} companyName={picked.name} />
          ) : (
            <WorkbookView company={picked} onBack={handleBack} />
          )
        ) : isCreateScorecardFlow ? (
          <CompanyPicker onPick={handlePick} onLandEstimate={handlePickEstimate} mode="create" />
        ) : (
          <CompanyPicker onPick={handlePick} />
        )}
      </main>
    </div>
  );
}
