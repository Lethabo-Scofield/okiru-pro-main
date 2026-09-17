import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE } from "@toolkit/lib/config";
import { useAuth } from "@toolkit/lib/auth";

export const ACTIVE_COMPANY_KEY = "okiru-active-company";
const LEGACY_SCORECARD_KEY = "okiru-pro-active-client";
const LEGACY_ESG_KEY = "okiru-esg-active-company";

export interface ActiveCompany { id: string; name: string; }
type CompanyResponse = { clientId?: string; id?: string; name?: string };
type ActiveCompanyContextValue = { activeCompany: ActiveCompany | null; companies: ActiveCompany[]; loading: boolean; refreshCompanies: () => Promise<void>; selectCompany: (company: ActiveCompany) => void; clearActiveCompany: () => void; };
const ActiveCompanyContext = createContext<ActiveCompanyContextValue | null>(null);

export function getStoredActiveCompanyId(): string {
  try { return localStorage.getItem(ACTIVE_COMPANY_KEY) || localStorage.getItem(LEGACY_SCORECARD_KEY) || ""; } catch { return ""; }
}

export function persistActiveCompany(company: ActiveCompany): void {
  try {
    localStorage.setItem(ACTIVE_COMPANY_KEY, JSON.stringify(company));
    // Preserve existing deep-link behaviour while it migrates to this context.
    localStorage.setItem(LEGACY_SCORECARD_KEY, company.id);
    localStorage.setItem(LEGACY_ESG_KEY, company.id);
  } catch { /* private browsing can reject storage */ }
}

function readStoredCompany(): ActiveCompany | null {
  try {
    const raw = localStorage.getItem(ACTIVE_COMPANY_KEY);
    if (raw) { const parsed = JSON.parse(raw) as ActiveCompany; if (parsed?.id) return parsed; }
    const id = localStorage.getItem(LEGACY_SCORECARD_KEY) || localStorage.getItem(LEGACY_ESG_KEY);
    return id ? { id, name: "" } : null;
  } catch { return null; }
}

export function ActiveCompanyProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<ActiveCompany[]>([]);
  const [activeCompany, setActiveCompany] = useState<ActiveCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshCompanies = useCallback(async () => {
    if (!user) { setCompanies([]); setActiveCompany(null); setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/clients`, { credentials: "include" });
      const data = response.ok ? await response.json() : [];
      const next = (Array.isArray(data) ? data : []).map((company: CompanyResponse) => ({ id: company.clientId || company.id || "", name: company.name || "" })).filter((company: ActiveCompany) => company.id && company.name);
      setCompanies(next);
      const stored = readStoredCompany();
      const valid = stored ? next.find((company) => company.id === stored.id) : undefined;
      setActiveCompany(valid || null);
      if (valid) persistActiveCompany(valid);
    } catch { setCompanies([]); setActiveCompany(null); } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { if (!authLoading) void refreshCompanies(); }, [authLoading, refreshCompanies]);
  const selectCompany = useCallback((company: ActiveCompany) => { setActiveCompany(company); persistActiveCompany(company); }, []);
  const clearActiveCompany = useCallback(() => { setActiveCompany(null); try { localStorage.removeItem(ACTIVE_COMPANY_KEY); localStorage.removeItem(LEGACY_SCORECARD_KEY); localStorage.removeItem(LEGACY_ESG_KEY); } catch { /* ignore */ } }, []);
  const value = useMemo(() => ({ activeCompany, companies, loading, refreshCompanies, selectCompany, clearActiveCompany }), [activeCompany, companies, loading, refreshCompanies, selectCompany, clearActiveCompany]);
  return <ActiveCompanyContext.Provider value={value}>{children}</ActiveCompanyContext.Provider>;
}

export function useActiveCompany(): ActiveCompanyContextValue {
  const context = useContext(ActiveCompanyContext);
  if (!context) throw new Error("useActiveCompany must be used within ActiveCompanyProvider");
  return context;
}
