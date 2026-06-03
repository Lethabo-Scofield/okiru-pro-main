import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Building2, ChevronRight, Leaf, Loader2, Plus, Search } from "lucide-react";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { DeleteCompanyButton } from "@/components/DeleteCompanyButton";
import { API_BASE } from "@toolkit/lib/config";
import { useToast } from "@/hooks/use-toast";
import { esgCreateHref, setEsgActiveCompany } from "@/lib/esgRoutes";
import "@/styles/esg-glass.css";

interface CompanyRow {
  clientId?: string;
  id?: string;
  name: string;
  createdByUserId?: string | null;
}

export default function EsgClientSelector() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      }
    } catch {
      toast({ title: "Error", description: "Failed to load companies", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => companies.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase())),
    [companies, search],
  );

  const pickCompany = (c: CompanyRow) => {
    const id = c.clientId || c.id || "";
    if (!id) return;
    setEsgActiveCompany(id);
    navigate(esgCreateHref(id));
  };

  const createCompany = async () => {
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
        pickCompany(c);
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: "Could not create",
          description: (err as { error?: string }).error || "Server error.",
          variant: "destructive",
        });
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="esg-theme min-h-screen flex flex-col">
      <header className="h-14 shrink-0 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 border-b border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.85)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <AppNavBack href="/hub" eyebrow="Hub" label="Okiru Hub" variant="dark" size="compact" />
          <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-lg hidden sm:block" />
          <span className="text-[15px] font-semibold text-[var(--esg-text)] flex items-center gap-2">
            <Leaf className="h-4 w-4 text-[var(--esg-acc-e)]" />
            ESG Companies
          </span>
        </div>
        <UserAccountMenu variant="hub" />
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8" data-testid="esg-client-selector">
        <h1
          className="text-[28px] sm:text-[32px] font-semibold tracking-tight text-[var(--esg-text)]"
          style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
        >
          Select a company
        </h1>
        <p className="text-[14px] text-[var(--esg-text2)] mt-2 mb-8">
          Reuses your workspace companies — start with the ESG workbook, then summary and toolkit.
        </p>

        <div className="esg-glass p-5 mb-6">
          <label htmlFor="esg-new-company" className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--esg-text3)] mb-2">
            New company
          </label>
          <div className="flex gap-2">
            <input
              id="esg-new-company"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCompany()}
              placeholder="Company name"
              className="flex-1 bg-black/30 border border-[var(--esg-glass-border)] rounded-xl px-4 py-2.5 text-[14px] text-[var(--esg-text)] placeholder-[var(--esg-text3)] outline-none focus:border-[var(--esg-acc-e)]/40"
              data-testid="input-esg-new-company"
            />
            <button
              type="button"
              onClick={createCompany}
              disabled={!newName.trim() || creating}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[13px] disabled:opacity-50"
              data-testid="button-esg-create-company"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </button>
          </div>
        </div>

        <div className="esg-glass p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-[14px] font-semibold text-[var(--esg-text)]">Your companies</h2>
            <div className="relative w-full max-w-[220px]">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--esg-text3)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full bg-black/30 border border-[var(--esg-glass-border)] rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-[var(--esg-text)]"
                data-testid="input-esg-company-search"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12 text-[var(--esg-text2)] text-[13px] gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-10 text-[13px] text-[var(--esg-text3)]">No companies yet — create one above.</p>
          ) : (
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {filtered.map((c) => {
                const companyId = c.clientId || c.id || "";
                return (
                  <div
                    key={companyId || c.name}
                    className="group flex items-center rounded-xl border border-transparent hover:border-[var(--esg-glass-border)] hover:bg-white/[0.03]"
                  >
                    <button
                      type="button"
                      onClick={() => pickCompany(c)}
                      className="flex-1 flex items-center justify-between px-3.5 py-3 text-left"
                      data-testid={`esg-company-${companyId}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg border border-[var(--esg-glass-border)] grid place-items-center shrink-0">
                          <Building2 className="h-4 w-4 text-[var(--esg-text2)]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[var(--esg-text)] truncate">{c.name}</div>
                          <div className="text-[10px] text-[var(--esg-text3)] font-mono truncate">{companyId}</div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[var(--esg-text3)] group-hover:text-[var(--esg-acc-e)]" />
                    </button>
                    <DeleteCompanyButton
                      companyId={companyId}
                      companyName={c.name}
                      createdByUserId={c.createdByUserId}
                      onDeleted={load}
                      className="mr-2"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
