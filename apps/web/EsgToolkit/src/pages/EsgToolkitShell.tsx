import { useEffect } from "react";
import { useParams } from "wouter";
import { API_BASE } from "@toolkit/lib/config";
import { esgClientsHref, getEsgActiveCompany, navigateToAppPath, setEsgActiveCompany } from "@/lib/esgRoutes";
import { useEsgStore } from "../lib/esgStore";
import { EsgAppRoutes } from "../App";

export function EsgToolkitShell() {
  const params = useParams<{ companyId?: string }>();
  const companyId = params.companyId || getEsgActiveCompany();
  const load = useEsgStore((s) => s.load);
  const setCompanyName = useEsgStore((s) => s.setCompanyName);
  const loading = useEsgStore((s) => s.loading);

  useEffect(() => {
    if (!companyId) {
      navigateToAppPath(esgClientsHref());
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setEsgActiveCompany(companyId);
    let cancelled = false;
    (async () => {
      let name = "";
      try {
        const res = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(companyId)}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          name = data.name || "";
        }
      } catch {
        // ignore
      }
      if (!cancelled) {
        await load(companyId, name, { force: false });
        if (name) setCompanyName(name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, load, setCompanyName]);

  if (!companyId) {
    return (
      <div className="esg-theme min-h-screen flex items-center justify-center p-6">
        <div className="h-10 w-10 border-2 border-[var(--esg-acc-e)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="esg-theme min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 border-2 border-[var(--esg-acc-e)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <EsgAppRoutes />;
}
