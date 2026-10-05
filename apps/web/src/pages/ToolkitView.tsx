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
import { resolveScorecardTypeForSector } from "@/components/workbook/sections";

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
      sectorCode: ci.sectorCode ?? '',
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

  // Always load config and recalculate - never use stale saved results
  // A missing sector used to default to RCOGP — a real, specific sector, so an
  // entity with no sector silently got another sector's scorecard. There is no
  // safe guess here; say so instead.
  const sectorCode = String(ci.sectorCode ?? '').trim();
  if (!sectorCode) {
    throw new Error('This session has no scorecard sector. Set it in the company’s workbook before opening the toolkit.');
  }

  // The scorecard type was re-derived from turnover here, with the wrong
  // thresholds: under R10m returned 'Generic', so a small entity was scored on
  // the large scorecard. It is not this screen's to derive at all — the
  // workbook already captured it, and re-deriving produced a second answer
  // that disagreed with the client record hydrated a few lines above.
  const scorecardType = resolveScorecardTypeForSector(sectorCode, ci.scorecardType ?? ci.companySize);
  if (!scorecardType) {
    throw new Error(
      `“${String(ci.scorecardType ?? ci.companySize ?? '—')}” is not a scorecard type ${sectorCode} offers. Correct it in the company’s workbook.`,
    );
  }
  // This used to swallow the failure into a console.warn and leave
  // calculatorConfig null, so the toolkit opened and scored against nothing.
  // CalculatorConfigGate already knows how to show and retry that state — let
  // the failure reach it.
  const cfgRes = await fetch(
    `${API_BASE}/api/scorecard/sector-config/${encodeURIComponent(sectorCode)}/${encodeURIComponent(scorecardType)}`,
  );
  if (!cfgRes.ok) {
    throw new Error(`Could not load the ${sectorCode} ${scorecardType} scorecard rules (${cfgRes.status}).`);
  }
  const cfgData = await cfgRes.json();
  if (!cfgData?.success || !cfgData.config) {
    throw new Error(`The ${sectorCode} ${scorecardType} scorecard rules came back empty.`);
  }
  useBbeeStore.setState({ calculatorConfig: cfgData.config });
  useBbeeStore.getState()._recalculateAll();
}

export default function ToolkitView() {
  const search = useSearch();
  const sessionParam = new URLSearchParams(search).get("session");
  const clientId = localStorage.getItem("okiru-pro-active-client") || "";
  const isSyntheticId = clientId.startsWith('build-') || clientId.startsWith('session') || clientId.startsWith('upload-');
  const [sessionLoading, setSessionLoading] = useState(!!sessionParam || (isSyntheticId && !useBbeeStore.getState().isLoaded));
  // A failed session load used to be a console.error, after which the toolkit
  // rendered anyway against an empty store: every pillar zero, the scorecard
  // “Non-Compliant”, and nothing on screen saying the data never arrived.
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Case 1: session param in query string -- load session from API
    if (sessionParam) {
      const storeState = useBbeeStore.getState();
      const uploadId = `upload-${sessionParam}`;
      const sessionId = `session-${sessionParam}`;
      const alreadyHydrated = storeState.isLoaded &&
        (storeState.activeClientId === uploadId || storeState.activeClientId === sessionId);

      if (alreadyHydrated) {
        // Store already has valid data from DocumentProcessor - don't overwrite
        localStorage.setItem("okiru-pro-active-client", storeState.activeClientId!);
        setSessionLoading(false);
        return;
      }

      const loadSession = async () => {
        setSessionError(null);
        try {
          const res = await fetch(`${API_BASE}/api/processor-sessions/${sessionParam}`);
          if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
          const session = await res.json();
          localStorage.setItem("okiru-pro-active-client", sessionId);
          await hydrateStoreFromSession(session);
        } catch (err) {
          console.error("[ToolkitView] session load failed", err);
          setSessionError(err instanceof Error ? err.message : "The scorecard data could not be loaded.");
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
          setSessionError(null);
          try {
            const res = await fetch(`${API_BASE}/api/processor-sessions/${extractedSessionId}`);
            if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
            const session = await res.json();
            localStorage.setItem("okiru-pro-active-client", clientId);
            await hydrateStoreFromSession(session);
          } catch (err) {
            console.error("[ToolkitView] session load failed", err);
            setSessionError(err instanceof Error ? err.message : "The scorecard data could not be loaded.");
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
  }, [sessionParam, clientId, isSyntheticId, retryCount]);

  if (sessionError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-card rounded-2xl border border-border p-8 flex flex-col items-center gap-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-foreground text-base mb-1">Scorecard data didn’t load</h3>
            <p className="text-muted-foreground text-sm" data-testid="toolkit-session-error">{sessionError}</p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => { setSessionError(null); setSessionLoading(true); setRetryCount((n) => n + 1); }}
              className="flex-1 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold text-sm transition-colors"
              data-testid="toolkit-session-retry"
            >
              Retry
            </button>
            <a
              href="/bbbee"
              className="flex-1 py-2 bg-muted hover:bg-muted/70 text-muted-foreground rounded-lg font-semibold text-sm transition-colors flex items-center justify-center"
            >
              Companies
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-2 border-[rgba(255,255,255,0.32)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading scorecard data...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="okiru-pro-theme">
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
