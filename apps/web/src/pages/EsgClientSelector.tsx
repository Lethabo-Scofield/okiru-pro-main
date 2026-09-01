/**
 * Reopen an ESG scorecard that already exists.
 *
 * This page used to BE the ESG front door, and its first control was "New
 * company — name it". That put naming before knowing: the evidence pack is what
 * knows the registered name, and half the companies created here were never
 * used again. Starting now lives at `/esg`, where the name comes out of what
 * was uploaded; this page kept the half it was always good at — finding a
 * scorecard you already started.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Building2, ChevronRight, Leaf, Loader2, Plus, Search } from "lucide-react";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { DeleteCompanyButton } from "@/components/DeleteCompanyButton";
import { API_BASE } from "@toolkit/lib/config";
import { useToast } from "@/hooks/use-toast";
import { esgCreateHref, esgHomeHref, setEsgActiveCompany } from "@/lib/esgRoutes";
import "@/styles/esg-glass.css";

interface CompanyRow {
  clientId?: string;
  id?: string;
  name: string;
  createdByUserId?: string | null;
  /** "bbbee" | "esg" — which product created the company (server-classified). */
  product?: string;
}

export default function EsgClientSelector() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  // The two products stay visibly separate: this page reopens ESG scorecards,
  // so ESG companies lead. B-BBEE companies remain reachable below — picking
  // one deliberately STARTS an ESG workbook for it — but they are labelled as
  // what they are rather than dressed up as ESG scorecards.
  const esgCompanies = useMemo(() => filtered.filter((c) => c.product === "esg"), [filtered]);
  const bbbeeCompanies = useMemo(() => filtered.filter((c) => c.product !== "esg"), [filtered]);

  const pickCompany = (c: CompanyRow) => {
    const id = c.clientId || c.id || "";
    if (!id) return;
    setEsgActiveCompany(id);
    navigate(esgCreateHref(id));
  };

  return (
    <div className="esg-theme min-h-screen flex flex-col bg-black text-white">
      <header
        className="h-14 shrink-0 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 bg-black"
        style={{ borderBottom: "1px solid #2c2c2e" }}
      >
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
          Open an ESG scorecard
        </h1>
        <p className="text-[14px] text-[var(--esg-text2)] mt-2 mb-8">
          Pick up a workbook you have already started — inputs, summary, then toolkit.
        </p>

        {/* Starting one is not naming one: the new-scorecard flow reads the
            documents first and takes the entity's name out of them. */}
        <div className="rounded-2xl border border-[#2c2c2e] bg-white/[0.02] p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[var(--esg-text)]">Starting a new one?</p>
            <p className="text-[12px] text-[var(--esg-text2)] mt-0.5">
              Upload your documents, import a workbook, or enter it by hand — we name the company
              from what you provide.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(esgHomeHref())}
            className="inline-flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[13px]"
            data-testid="button-esg-start-new"
          >
            <Plus className="h-4 w-4" />
            New ESG scorecard
          </button>
        </div>

        <div className="rounded-2xl border border-[#2c2c2e] bg-white/[0.02] p-5">
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
            <p className="text-center py-10 text-[13px] text-[var(--esg-text3)]">
              Nothing started yet — begin a new ESG scorecard above.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {esgCompanies.length === 0 && (
                <p className="px-1 py-4 text-[12px] text-[var(--esg-text3)]">
                  No ESG scorecards yet — begin a new one above, or start one for a saved
                  B-BBEE company below.
                </p>
              )}
              {esgCompanies.map((c) => {
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

              {/* B-BBEE companies are a different product. They are offered
                  here only as a starting point — clicking one begins an ESG
                  workbook for that company — and each is labelled so nobody
                  mistakes it for an ESG scorecard already in progress. */}
              {bbbeeCompanies.length > 0 && (
                <>
                  <p className="px-1 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--esg-text3)]">
                    Start ESG for a B-BBEE company
                  </p>
                  {bbbeeCompanies.map((c) => {
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
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[13px] font-medium text-[var(--esg-text)] truncate">{c.name}</span>
                                <span className="inline-flex shrink-0 items-center rounded-full border border-white/[0.12] bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--esg-text2)]">
                                  B-BBEE
                                </span>
                              </div>
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
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
