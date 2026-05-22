import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ChevronRight,
  Download,
  Loader2,
  Save,
  Building2,
  Search,
  Send,
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
  SECTIONS,
  getSection,
  getCompanyInfoMetaFields,
  resolveScorecardTypeForSector,
  type ColumnDef,
} from "@/components/workbook/sections";
import { SpreadsheetGrid } from "@/components/workbook/SpreadsheetGrid";
import {
  validateWorkbook,
  formatWorkbookValidationSummary,
} from "@/components/workbook/workbookValidation";
import {
  normalizeExcelFile,
  type WorkbookSectionsInput,
} from "@/lib/workbookExcelNormalizer";
import { importBeeGatheringExcel, type ExcelExtractionResult } from "@/lib/excelImport";
import { ExcelImportPreviewModal } from "@/components/scorecard/ExcelImportPreviewModal";
import { useBbeeStore } from "@toolkit/lib/store";
import { ScorecardFlowStepper } from "@/components/scorecard/ScorecardFlowStepper";
import { WorkbookScoreSummary } from "@/pages/WorkbookScoreSummary";

type Row = Record<string, unknown> & { _id: string };
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

function LakeTradingDemoEntry({ onPick }: { onPick: (c: Company) => void }) {
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
  label = "Import from Excel",
}: {
  onImport: (file: File) => Promise<void>;
  disabled?: boolean;
  label?: string;
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
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[12px] text-[#d1d1d6] smooth press-sm disabled:opacity-60"
        data-testid="button-import-excel"
      >
        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {label}
      </button>
    </>
  );
}

function CompanyPicker({
  onPick,
}: {
  onPick: (c: Company) => void;
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
    load();
  }, [load]);

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

  const filtered = useMemo(
    () =>
      companies.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase())),
    [companies, search],
  );

  return (
    <div className="space-y-6">
      {showLakeDemo && <LakeTradingDemoEntry onPick={onPick} />}
      <div className="rounded-2xl bg-[#1c1c1e] p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white mb-1">Pick a company</h2>
            <p className="text-[13px] text-[#8e8e93]">Workbook data is isolated per company.</p>
          </div>
          <ExcelImportButton
            label="Import from Excel"
            onImport={async (file) => {
              const result = await importBeeGatheringExcel(file, API_BASE);
              if (!result.extraction.isBeeGatheringFormat) {
                const fallback = await normalizeExcelFile(file);
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
                  unmappedFields: [],
                  fieldStatuses: { companyName: "mapped" },
                  isBeeGatheringFormat: true,
                  mappedSheets: Object.keys(fallback.mappedSheets),
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

        <div className="relative mb-4">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-[#636366]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies"
            className="w-full bg-[#0e0e10] border border-[#2c2c2e] rounded-lg pl-9 pr-3 py-2 text-[13px] text-white placeholder-[#636366] outline-none focus:border-[#48484a]"
            data-testid="input-company-search"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[#8e8e93] text-[13px] py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-[13px] text-[#636366] py-6 text-center">
            No companies yet. Create one below.
          </div>
        ) : (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {filtered.map((c) => {
              const companyId = c.clientId || c.id || "";
              return (
                <div
                  key={companyId || c.name}
                  className="flex items-center gap-1 rounded-lg bg-[#0e0e10] hover:bg-[#2c2c2e] smooth"
                >
                  <button
                    type="button"
                    onClick={() => onPick(c)}
                    className="flex-1 min-w-0 text-left flex items-center justify-between px-3 py-2.5 press-sm"
                    data-testid={`company-${companyId}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-white/[0.06] grid place-items-center shrink-0">
                        <Building2 className="h-4 w-4 text-[#d1d1d6]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-white truncate">{c.name}</div>
                        <div className="text-[11px] text-[#636366] truncate">{companyId}</div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#636366] shrink-0 ml-2" />
                  </button>
                  <DeleteCompanyButton
                    companyId={companyId}
                    companyName={c.name}
                    createdByUserId={c.createdByUserId}
                    onDeleted={load}
                    className="mr-1"
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
            employees: previewResult?.data.numberOfEmployees,
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
            const warnCount = previewResult?.warnings.length ?? 0;
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

      <div className="rounded-2xl bg-[#1c1c1e] p-6">
        <h2 className="text-[15px] font-semibold text-white mb-1">Add a new company</h2>
        <p className="text-[13px] text-[#8e8e93] mb-4">Creates a client record you can collect data for.</p>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Company name"
            className="flex-1 bg-[#0e0e10] border border-[#2c2c2e] rounded-lg px-3 py-2 text-[13px] text-white placeholder-[#636366] outline-none focus:border-[#48484a]"
            data-testid="input-new-company"
          />
          <button
            onClick={create}
            disabled={!newName.trim() || creating}
            className="px-4 py-2 rounded-lg bg-white text-black text-[13px] font-semibold press-sm hover:bg-white/90 disabled:opacity-50 smooth"
            data-testid="button-create-company"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Single-record key/value editor for sections like Company Information or Financials.
function MetaForm({
  fields,
  value,
  onChange,
}: {
  fields: ColumnDef[];
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const setField = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map((f) => {
        const v = value[f.key];
        const blank =
          v === "" || v === undefined || v === null ||
          (typeof v === "string" && v.trim() === "");
        const err = f.required && blank ? "Required" : f.validate ? f.validate(v) : null;
        return (
          <label key={f.key} className="block" data-testid={`meta-field-${f.key}`}>
            <div className="text-[12px] text-[#8e8e93] mb-1.5 flex items-center gap-1">
              {f.label}
              {f.required && <span className="text-status-error">*</span>}
            </div>
            {f.type === "select" ? (
              <select
                value={String(v ?? "")}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full bg-[#0e0e10] border border-[#2c2c2e] rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-[#48484a]"
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
                  onChange={(e) => setField(f.key, e.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
              </div>
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={String(v ?? "")}
                onChange={(e) =>
                  setField(
                    f.key,
                    f.type === "number" && e.target.value !== ""
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
                className={`w-full bg-[#0e0e10] border rounded-lg px-3 py-2 text-[13px] text-white placeholder-[#48484a] outline-none focus:border-[#48484a] ${err ? "border-status-error" : "border-[#2c2c2e]"}`}
                placeholder={f.required ? "Required" : ""}
              />
            )}
            {err && <div className="text-[11px] text-status-error mt-1">{err}</div>}
          </label>
        );
      })}
    </div>
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
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  // Per-section debounce timers + pending payloads so editing section B never
  // discards a pending save for section A.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}); 
  const pendingPayloads = useRef<
    Record<string, { rows?: Row[]; meta?: Record<string, unknown> }>
  >({});
  const inFlight = useRef(0);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/workbook/${encodeURIComponent(companyId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
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
      pendingPayloads.current[sectionKey] = body;
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
        return {
          ...prev,
          sections: { ...prev.sections, [sectionKey]: { ...current, rows } },
        };
      });
      scheduleSave(sectionKey, { rows });
    },
    [scheduleSave],
  );

  const handleMetaChange = useCallback(
    (sectionKey: string, meta: Record<string, unknown>) => {
      let next = meta;
      if (sectionKey === "company-information") {
        const prevSector = String(
          workbook?.sections[sectionKey]?.meta?.industrySector ?? "",
        );
        const newSector = String(meta.industrySector ?? "");
        if (newSector !== prevSector) {
          next = {
            ...meta,
            scorecardType: resolveScorecardTypeForSector(newSector, meta.scorecardType),
          };
        }
      }
      setWorkbook((prev) => {
        if (!prev) return prev;
        const current = prev.sections[sectionKey] || { rows: [] };
        return {
          ...prev,
          sections: { ...prev.sections, [sectionKey]: { ...current, meta: next } },
        };
      });
      scheduleSave(sectionKey, { rows: [], meta: next });
    },
    [scheduleSave, workbook],
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

  const handleSubmit = useCallback(async () => {
    if (!workbook) return;
    setSubmitting(true);
    try {
      // 1. Wait for any save that is already mid-flight to land.
      await waitForInFlight();
      // 2. Flush every pending debounced save.
      const ok = await flushAllPending();
      // 3. Wait for the saves we just kicked off to actually complete.
      await waitForInFlight();
      // 4. Refuse to submit if any of those saves failed, or a prior save error
      //    has not been cleared.
      if (!ok || saveError) {
        toast({
          title: "Submit aborted",
          description: "Unsaved changes failed to save — fix the save error and try again.",
          variant: "destructive",
        });
        return;
      }
      const validationIssues = validateWorkbook(workbook.sections);
      if (validationIssues.length > 0) {
        toast({
          title: "Fix validation errors before submitting",
          description: formatWorkbookValidationSummary(validationIssues, 4),
          variant: "destructive",
        });
        return;
      }
      const res = await fetch(
        `${API_BASE}/api/workbook/${encodeURIComponent(companyId)}/submit`,
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSubmittedAt(data.submittedAt || new Date().toISOString());
        const c = data.counts || {};
        toast({
          title: "Submitted to scorecard",
          description: `Synced ${c.employees ?? 0} employees, ${c.trainingPrograms ?? 0} training, ${c.suppliers ?? 0} suppliers, ${c.shareholders ?? 0} shareholders.`,
        });
        localStorage.setItem("okiru-pro-active-client", companyId);
        try {
          await loadClientData(companyId);
        } catch {
          // DataLoader will retry on the summary page if preload fails.
        }
        navigate(`/create-scorecard/${encodeURIComponent(companyId)}/summary`);
      } else {
        toast({
          title: "Submit failed",
          description: data.error || `Server returned ${res.status}.`,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Submit failed", description: "Network error.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [companyId, workbook, flushAllPending, waitForInFlight, saveError, toast, navigate, loadClientData]);

  const handleExcelImport = useCallback(
    async (file: File) => {
      const bee = await importBeeGatheringExcel(file, API_BASE);
      const result = bee.extraction.isBeeGatheringFormat
        ? { sections: bee.sections, validationIssues: bee.validationIssues, criticalBlocked: bee.criticalBlocked, warnings: bee.extraction.warnings }
        : await normalizeExcelFile(file);

      if (result.criticalBlocked) {
        toast({
          title: "Import blocked — fix critical fields",
          description: formatWorkbookValidationSummary(result.validationIssues, 5),
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
          body: JSON.stringify({ sections: result.sections }),
        },
      );
      if (!res.ok) {
        toast({ title: "Import failed", variant: "destructive" });
        return;
      }
      setWorkbook((prev) =>
        prev ? { ...prev, sections: { ...prev.sections, ...result.sections } } : prev,
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
    },
    [companyId, toast],
  );

  const enabledSections = useMemo(() => SECTIONS.filter((s) => s.enabled), []);

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
    const def = getSection(key);
    if (def?.meta) {
      const m = (sec.meta || {}) as Record<string, unknown>;
      const has = Object.values(m).some((v) => v !== "" && v != null);
      return has ? "filled" : "empty";
    }
    return (sec.rows?.length || 0) > 0 ? "filled" : "empty";
  };

  const saveStatusText = saving
    ? "Saving…"
    : saveError
      ? saveError
      : savedAt
        ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
        : "";

  const renderSectionNav = (variant: "sidebar" | "tabs") =>
    enabledSections.map((s) => {
      const status = sectionStatus(s.key);
      const count = workbook?.sections[s.key]?.rows?.length || 0;
      const isActive = activeSectionKey === s.key;
      const indicator = s.meta
        ? status === "filled"
          ? "✓"
          : "—"
        : count > 0
          ? String(count)
          : "—";
      const baseClass =
        variant === "sidebar"
          ? "w-full text-left px-3 py-2 rounded-lg text-[13px] flex items-center justify-between smooth press-sm"
          : "shrink-0 px-3 py-2 rounded-lg text-[12px] flex items-center gap-2 smooth press-sm whitespace-nowrap";
      return (
        <button
          key={s.key}
          onClick={() => selectSection(s.key)}
          className={`${baseClass} ${
            isActive
              ? "bg-white/[0.08] text-white"
              : "text-[#8e8e93] hover:bg-white/[0.04] hover:text-[#d1d1d6]"
          }`}
          data-testid={`tab-${s.key}`}
        >
          <span className={variant === "sidebar" ? "truncate" : ""}>{s.label}</span>
          <span
            className={`text-[10px] tabular-nums ${status === "filled" ? "text-status-success" : "text-[#636366]"}`}
          >
            {indicator}
          </span>
        </button>
      );
    });

  const activeSectionData = workbook?.sections[activeSection?.key ?? ""] || {
    rows: [],
    meta: {},
  };
  const activeRows = activeSectionData.rows || [];
  const activeMeta = (activeSectionData.meta || {}) as Record<string, unknown>;
  const activeMetaFields = activeSection?.meta
    ? activeSection.key === "company-information"
      ? getCompanyInfoMetaFields(String(activeMeta.industrySector ?? ""))
      : activeSection.meta
    : undefined;

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
          {submittedAt && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success-bg text-status-success text-[10px] font-semibold uppercase tracking-wide">
              <CheckCircle2 className="h-3 w-3" /> Submitted
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
          {submittedAt && (
            <button
              onClick={() => navigate(`/create-scorecard/${encodeURIComponent(companyId)}/summary`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold smooth press-sm"
              data-testid="button-continue-summary"
            >
              Continue to Summary
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-[12px] font-semibold smooth press-sm hover:bg-white/90 disabled:opacity-60"
            data-testid="button-submit"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {submittedAt ? "Re-submit" : "Submit to scorecard"}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="lg:hidden w-full -mx-1 px-1 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max pb-1" data-testid="workbook-mobile-tabs">
            {renderSectionNav("tabs")}
          </div>
        </div>

        <aside className="hidden lg:block w-full lg:w-64 shrink-0 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:z-10">
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
              <div className="px-6 py-4 border-b border-white/[0.06]">
                <h2 className="text-[18px] font-bold tracking-tight text-white">
                  {activeSection.label}
                </h2>
                <p className="text-[13px] text-[#8e8e93] mt-0.5">{activeSection.description}</p>
              </div>
              <div className="px-6 pb-6">
                {activeMetaFields ? (
                  <div className="pt-5">
                    <MetaForm
                      fields={activeMetaFields}
                      value={activeMeta}
                      onChange={(next) => handleMetaChange(activeSection.key, next)}
                    />
                  </div>
                ) : activeSection.columns ? (
                  <div className="pt-5">
                    <SpreadsheetGrid
                      columns={activeSection.columns}
                      rows={activeRows}
                      rowValidate={activeSection.rowValidate}
                      onChange={(nextRows) => handleRowsChange(activeSection.key, nextRows)}
                      sectionLabel={activeSection.label}
                      sectionDescription={activeSection.description}
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#2c2c2e] bg-[#0e0e10] py-16 px-6 text-center mt-5">
                    <p className="text-[13px] text-[#636366]">No editor configured for this section.</p>
                  </div>
                )}
              </div>
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
  const resolvedCompanyId = params.companyId || picked?.clientId || picked?.id || "";

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

  const handleBack = () => {
    setPicked(null);
    navigate(basePath, { replace: true });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="h-14 shrink-0 z-20 sticky top-0 bg-black" style={{ borderBottom: "1px solid #2c2c2e" }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AppNavBack href="/dashboard" eyebrow="Back" label="Dashboard" variant="dark" className="shrink-0" />
            <div className="w-px h-5 bg-[#2c2c2e] hidden sm:block" />
            <div className="flex items-center gap-3">
              <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
              <span className="text-lg font-semibold tracking-tight text-white border-l border-[#2c2c2e] pl-3">
                {pageTitle}
              </span>
            </div>
          </div>
          <UserAccountMenu variant="dashboard" />
        </div>
      </header>

      {isCreateScorecardFlow && (
        <ScorecardFlowStepper companyId={params.companyId || resolvedCompanyId || undefined} />
      )}

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        {!isSummaryStep && (
          <div className="mb-8">
            <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">
              {basePath === "/create-scorecard" ? "Create Scorecard" : "Company Assessment Workbook"}
            </h1>
            <p className="text-[14px] text-[#98989f] mt-1">
              {basePath === "/create-scorecard"
                ? "Pick a company, complete the workbook sections, then submit to generate your scorecard."
                : "Structured spreadsheet collection — replaces manual onboarding sheets."}
            </p>
          </div>
        )}

        {picked ? (
          isSummaryStep && resolvedCompanyId ? (
            <WorkbookScoreSummary companyId={resolvedCompanyId} companyName={picked.name} />
          ) : (
            <WorkbookView company={picked} onBack={handleBack} />
          )
        ) : (
          <CompanyPicker onPick={handlePick} />
        )}
      </main>
    </div>
  );
}
