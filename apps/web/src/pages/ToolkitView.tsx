import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { queryClient } from "@toolkit/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@toolkit/components/ui/toaster";
import { TooltipProvider } from "@toolkit/components/ui/tooltip";
import { ThemeProvider } from "@toolkit/components/theme-provider";
import { ClientProvider } from "@toolkit/lib/client-context";
import { AppRoutes } from "@toolkit/App";
import { useBbeeStore } from "@toolkit/lib/store";
import { API_BASE } from "@toolkit/lib/config";

async function hydrateStoreFromSession(session: any) {
  const sessionId = session.sessionId || session.id;
  const syntheticId = `session-${sessionId}`;
  const fd = session.foundationData || {};
  const ci = fd.clientInfo || {};
  const fin = fd.financials || {};
  const pd = session.pillarData || {};

  useBbeeStore.setState({
    isLoaded: true,
    pipelineOverrides: null,
    activeClientId: syntheticId,
    client: {
      id: syntheticId,
      name: ci.companyName || session.companyInfo?.name || 'Client',
      financialYear: ci.financialYearEnd
        ? String(ci.financialYearEnd).substring(0, 4)
        : String(new Date().getFullYear()),
      revenue: fin.totalRevenue ?? 0,
      npat: fin.npat ?? 0,
      leviableAmount: fin.leviableAmount ?? 0,
      industryNorm: ci.industryNorm,
      eapProvince: ci.eapProvince ?? 'National',
      registrationNumber: ci.registrationNumber ?? '',
      physicalAddress: ci.physicalAddress ?? '',
      contactPerson: ci.contactPerson ?? '',
      contactEmail: ci.contactEmail ?? '',
      contactPhone: ci.contactPhone ?? '',
      sectorCode: ci.sectorCode ?? 'RCOGP',
      industry: ci.industry ?? 'Generic',
      companySize: ci.companySize ?? 'Generic',
      annualTurnover: ci.annualTurnover ?? 0,
      numberOfEmployees: ci.numberOfEmployees ?? 0,
      financialHistory: [],
    },
    ownership: pd.ownership
      ? { ...pd.ownership, id: pd.ownership.id || '', clientId: syntheticId }
      : { id: '', clientId: syntheticId, shareholders: [], companyValue: 0, outstandingDebt: 0, yearsHeld: 0 },
    management: pd.management
      ? { ...pd.management, id: pd.management.id || '', clientId: syntheticId }
      : { id: '', clientId: syntheticId, employees: [] },
    skills: pd.skills
      ? { ...pd.skills, id: pd.skills.id || '', clientId: syntheticId, leviableAmount: fin.leviableAmount || pd.skills.leviableAmount || 0 }
      : { id: '', clientId: syntheticId, leviableAmount: fin.leviableAmount || 0, trainingPrograms: [] },
    procurement: pd.procurement
      ? { ...pd.procurement, id: pd.procurement.id || '', clientId: syntheticId, tmps: fin.tmps || pd.procurement.tmps || 0 }
      : { id: '', clientId: syntheticId, tmps: fin.tmps || 0, suppliers: [] },
    esd: pd.esd
      ? { ...pd.esd, id: pd.esd.id || '', clientId: syntheticId }
      : { id: '', clientId: syntheticId, contributions: [], graduationBonus: false, jobsCreatedBonus: false },
    sed: pd.sed
      ? { ...pd.sed, id: pd.sed.id || '', clientId: syntheticId }
      : { id: '', clientId: syntheticId, contributions: [] },
    calculatorConfig: null,
  });

  // Always load config and recalculate — never use stale saved results
  const sectorCode = ci.sectorCode || 'RCOGP';
  const turnover = ci.annualTurnover ?? fin.totalRevenue ?? 0;
  const scorecardType = turnover > 50_000_000 ? 'Generic' : (turnover >= 10_000_000 ? 'QSE' : 'Generic');
  try {
    const cfgRes = await fetch(`${API_BASE}/api/scorecard/sector-config/${encodeURIComponent(sectorCode)}/${encodeURIComponent(scorecardType)}`);
    if (cfgRes.ok) {
      const cfgData = await cfgRes.json();
      if (cfgData.success && cfgData.config) {
        useBbeeStore.setState({ calculatorConfig: cfgData.config });
        useBbeeStore.getState()._recalculateAll();
      }
    }
  } catch (e) {
    console.warn('[ToolkitView] Failed to load sector config for session:', e);
  }
}

export default function ToolkitView() {
  const search = useSearch();
  const sessionParam = new URLSearchParams(search).get("session");
  const clientId = localStorage.getItem("okiru-pro-active-client") || "";
  const isSyntheticId = clientId.startsWith('build-') || clientId.startsWith('session') || clientId.startsWith('upload-');
  const [sessionLoading, setSessionLoading] = useState(!!sessionParam || (isSyntheticId && !useBbeeStore.getState().isLoaded));

  useEffect(() => {
    // Case 1: session param in query string -- load session from API
    if (sessionParam) {
      const storeState = useBbeeStore.getState();
      const uploadId = `upload-${sessionParam}`;
      const sessionId = `session-${sessionParam}`;
      const alreadyHydrated = storeState.isLoaded &&
        (storeState.activeClientId === uploadId || storeState.activeClientId === sessionId);

      if (alreadyHydrated) {
        // Store already has valid data from DocumentProcessor — don't overwrite
        localStorage.setItem("okiru-pro-active-client", storeState.activeClientId!);
        setSessionLoading(false);
        return;
      }

      const loadSession = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/processor-sessions/${sessionParam}`);
          if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
          const session = await res.json();
          localStorage.setItem("okiru-pro-active-client", sessionId);
          await hydrateStoreFromSession(session);
        } catch (err) {
          console.error("Failed to load session for toolkit:", err);
        } finally {
          setSessionLoading(false);
        }
      };
      loadSession();
      return;
    }

    // Case 2: synthetic clientId in URL but store not loaded (page refresh)
    // Try to load session from the clientId if it contains a session identifier
    if (isSyntheticId && !useBbeeStore.getState().isLoaded) {
      const extractedSessionId = clientId.replace(/^(build-|session-|upload-)/, '').replace(/^sess-/, '');
      if (extractedSessionId) {
        const loadSession = async () => {
          try {
            const res = await fetch(`${API_BASE}/api/processor-sessions/${extractedSessionId}`);
            if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
            const session = await res.json();
            localStorage.setItem("okiru-pro-active-client", clientId);
            await hydrateStoreFromSession(session);
          } catch (err) {
            console.error("Failed to reload session for synthetic client:", err);
          } finally {
            setSessionLoading(false);
          }
        };
        loadSession();
      } else {
        setSessionLoading(false);
      }
      return;
    }

    setSessionLoading(false);
  }, [sessionParam, clientId, isSyntheticId]);

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-2 border-[#636366] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading scorecard data...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider defaultTheme="light" storageKey="okiru-pro-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <ClientProvider>
            <AppRoutes />
          </ClientProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
