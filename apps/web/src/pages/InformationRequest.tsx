import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronRight, Download, Loader2, Save, Building2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@toolkit/lib/config";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { SECTIONS, getSection } from "@/components/workbook/sections";
import { SpreadsheetGrid } from "@/components/workbook/SpreadsheetGrid";

type Row = Record<string, unknown> & { _id: string };
type Workbook = {
  companyId: string;
  sections: Record<string, { rows: Row[] }>;
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
          description: err.error || "Server error (MongoDB may be unavailable in dev).",
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

function WorkbookView({ company, onBack }: { company: Company; onBack: () => void }) {
  const companyId = company.clientId || company.id || "";
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [activeKey, setActiveKey] = useState<string>("employees");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const saveSection = useCallback(
    async (sectionKey: string, rows: Row[]) => {
      setSaving(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/workbook/${encodeURIComponent(companyId)}/section/${sectionKey}`,
          {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          setSavedAt(data.updatedAt);
        } else {
          toast({ title: "Save failed", variant: "destructive" });
        }
      } catch {
        toast({ title: "Save failed", description: "Network error.", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [companyId, toast],
  );

  const handleRowsChange = useCallback(
    (sectionKey: string, rows: Row[]) => {
      setWorkbook((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: { ...prev.sections, [sectionKey]: { rows } },
        };
      });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveSection(sectionKey, rows), 800);
    },
    [saveSection],
  );

  const handleManualSave = useCallback(() => {
    if (!workbook) return;
    const rows = workbook.sections[activeKey]?.rows || [];
    saveSection(activeKey, rows);
  }, [workbook, activeKey, saveSection]);

  const handleExport = useCallback(() => {
    window.open(
      `${API_BASE}/api/workbook/${encodeURIComponent(companyId)}/export.xlsx`,
      "_blank",
    );
  }, [companyId]);

  const activeSection = getSection(activeKey);
  const activeRows = workbook?.sections[activeKey]?.rows || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#636366]" data-testid="save-status">
            {saving ? "Saving…" : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : ""}
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-[12px] font-semibold smooth press-sm hover:bg-white/90"
            data-testid="button-export"
          >
            <Download className="h-3.5 w-3.5" /> Download Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 lg:col-span-3">
          <div className="rounded-xl bg-[#1c1c1e] p-2 sticky top-20" data-testid="workbook-tabs">
            {SECTIONS.map((s) => {
              const count = workbook?.sections[s.key]?.rows?.length || 0;
              const isActive = s.key === activeKey;
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
                  <span className="text-[10px] text-[#636366] tabular-nums">
                    {s.enabled ? count : "—"}
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
            ) : activeSection?.enabled && activeSection.columns ? (
              <SpreadsheetGrid
                columns={activeSection.columns}
                rows={activeRows}
                onChange={(rows) => handleRowsChange(activeKey, rows)}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-[#2c2c2e] bg-[#0e0e10] py-16 px-6 text-center">
                <p className="text-[14px] text-[#d1d1d6] font-medium mb-1">
                  Coming next
                </p>
                <p className="text-[13px] text-[#636366] max-w-md mx-auto">
                  This section will use the same spreadsheet experience as Employees.
                  In Phase 1 only the Employees section is fully editable; data captured
                  here will still appear in the Excel export with its tab name.
                </p>
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
