import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronRight, Download, Loader2, Save, Building2, Search, Send, CheckCircle2, Pencil, UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@toolkit/lib/config";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { SECTIONS, getSection, type ColumnDef } from "@/components/workbook/sections";
import { SpreadsheetGrid } from "@/components/workbook/SpreadsheetGrid";
import {
  validateWorkbook,
  formatWorkbookValidationSummary,
} from "@/components/workbook/workbookValidation";

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
}

function CompanyPicker({ onPick }: { onPick: (c: Company) => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const { toast } = useToast();

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
      <div className="rounded-2xl bg-[#1c1c1e] p-6">
        <h2 className="text-[15px] font-semibold text-white mb-1">Pick a company</h2>
        <p className="text-[13px] text-[#8e8e93] mb-4">Workbook data is isolated per company.</p>

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
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.id || c.clientId || c.name}
                onClick={() => onPick(c)}
                className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#0e0e10] hover:bg-[#2c2c2e] smooth press-sm"
                data-testid={`company-${c.clientId || c.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-white/[0.06] grid place-items-center">
                    <Building2 className="h-4 w-4 text-[#d1d1d6]" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-white">{c.name}</div>
                    <div className="text-[11px] text-[#636366]">{c.clientId || c.id}</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#636366]" />
              </button>
            ))}
          </div>
        )}
      </div>

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
  const [activeKey, setActiveKey] = useState<string>("company-information");
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
      setWorkbook((prev) => {
        if (!prev) return prev;
        const current = prev.sections[sectionKey] || { rows: [] };
        return {
          ...prev,
          sections: { ...prev.sections, [sectionKey]: { ...current, meta } },
        };
      });
      scheduleSave(sectionKey, { rows: [], meta });
    },
    [scheduleSave],
  );

  const handleManualSave = useCallback(() => {
    if (!workbook) return;
    const sec = workbook.sections[activeKey] || { rows: [] };
    // Cancel any pending debounced save for this section — we're firing now.
    const t = saveTimers.current[activeKey];
    if (t) clearTimeout(t);
    delete saveTimers.current[activeKey];
    delete pendingPayloads.current[activeKey];
    saveSection(activeKey, { rows: sec.rows, meta: sec.meta });
  }, [workbook, activeKey, saveSection]);

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

  const waitForInFlight = useCallback(async () => {
    // Spin-wait (cheap) until all in-flight section saves resolve.
    const start = Date.now();
    while (inFlight.current > 0 && Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 50));
    }
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
          title: "Submitted to scorecard engine",
          description: `Synced ${c.employees ?? 0} employees, ${c.trainingPrograms ?? 0} training, ${c.suppliers ?? 0} suppliers, ${c.shareholders ?? 0} shareholders.`,
        });
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
  }, [companyId, workbook, flushAllPending, waitForInFlight, saveError, toast]);

  const activeSection = getSection(activeKey);
  const activeData = workbook?.sections[activeKey] || { rows: [], meta: {} };
  const activeRows = activeData.rows || [];
  const activeMeta = (activeData.meta || {}) as Record<string, unknown>;

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

      {/* Gap 5: Start Assessment shortcuts after submit */}
      {submittedAt && (
        <div className="flex flex-wrap items-center gap-2 px-1 pb-2 pt-0">
          <span className="text-[11px] text-[#636366] shrink-0">Start assessment:</span>
          <button
            onClick={() => navigate(`/processor?new=true&client=${encodeURIComponent(companyId)}&mode=build`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[12px] text-[#d1d1d6] smooth press-sm border border-[#2c2c2e]"
            data-testid="button-open-manual-build"
          >
            <Pencil className="h-3.5 w-3.5" /> Open in Manual Build
          </button>
          <button
            onClick={() => navigate(`/processor?new=true&client=${encodeURIComponent(companyId)}&mode=upload`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2c2c2e] text-[12px] text-[#d1d1d6] smooth press-sm border border-[#2c2c2e]"
            data-testid="button-open-upload-extract"
          >
            <UploadCloud className="h-3.5 w-3.5" /> Open in Upload &amp; Extract
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 lg:col-span-3">
          <div className="rounded-xl bg-[#1c1c1e] p-2 sticky top-20" data-testid="workbook-tabs">
            {SECTIONS.map((s) => {
              const isActive = s.key === activeKey;
              const status = sectionStatus(s.key);
              const count = workbook?.sections[s.key]?.rows?.length || 0;
              const indicator = s.meta
                ? status === "filled"
                  ? "✓"
                  : "—"
                : count > 0
                  ? String(count)
                  : "—";
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveKey(s.key)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[13px] flex items-center justify-between smooth press-sm ${
                    isActive
                      ? "bg-white/[0.08] text-white"
                      : "text-[#8e8e93] hover:bg-white/[0.04] hover:text-[#d1d1d6]"
                  }`}
                  data-testid={`tab-${s.key}`}
                >
                  <span className="truncate">{s.label}</span>
                  <span
                    className={`text-[10px] tabular-nums ${status === "filled" ? "text-status-success" : "text-[#636366]"}`}
                  >
                    {indicator}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="col-span-12 lg:col-span-9">
          <div className="rounded-2xl bg-[#1c1c1e] p-6">
            <div className="mb-5">
              <h2 className="text-[20px] font-bold tracking-tight text-white">
                {activeSection?.label}
              </h2>
              <p className="text-[13px] text-[#8e8e93] mt-1">{activeSection?.description}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-[#8e8e93] text-[13px]">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading workbook…
              </div>
            ) : activeSection?.meta ? (
              <MetaForm
                fields={activeSection.meta}
                value={activeMeta}
                onChange={(next) => handleMetaChange(activeKey, next)}
              />
            ) : activeSection?.columns ? (
              <SpreadsheetGrid
                columns={activeSection.columns}
                rows={activeRows}
                rowValidate={activeSection.rowValidate}
                onChange={(rows) => handleRowsChange(activeKey, rows)}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-[#2c2c2e] bg-[#0e0e10] py-16 px-6 text-center">
                <p className="text-[13px] text-[#636366]">No editor configured for this section.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function InformationRequest() {
  const params = useParams<{ companyId?: string }>();
  const [, navigate] = useLocation();
  const [picked, setPicked] = useState<Company | null>(null);

  useEffect(() => {
    if (params.companyId && !picked) {
      fetch(`${API_BASE}/api/clients/${params.companyId}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => c && setPicked(c));
    }
  }, [params.companyId, picked]);

  const handlePick = (c: Company) => {
    setPicked(c);
    const id = c.clientId || c.id;
    if (id) navigate(`/information-request/${id}`, { replace: true });
  };

  const handleBack = () => {
    setPicked(null);
    navigate("/information-request", { replace: true });
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
                Information Request
              </span>
            </div>
          </div>
          <UserAccountMenu variant="dashboard" />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">
            Company Assessment Workbook
          </h1>
          <p className="text-[14px] text-[#98989f] mt-1">
            Structured spreadsheet collection — replaces manual onboarding sheets.
          </p>
        </div>

        {picked ? (
          <WorkbookView company={picked} onBack={handleBack} />
        ) : (
          <CompanyPicker onPick={handlePick} />
        )}
      </main>
    </div>
  );
}
