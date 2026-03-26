import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { ClientProvider, useActiveClient } from "@toolkit/lib/client-context";
import { AppLayout } from "@toolkit/components/layout/AppLayout";
import { useBbeeStore } from "@toolkit/lib/store";
import { Switch, Route } from "wouter";
import { AppLoader } from "@toolkit/components/Loader";
import ToolkitDashboard from "@toolkit/pages/Dashboard";
import Scorecard from "@toolkit/pages/Scorecard";
import ExcelImport from "@toolkit/pages/ExcelImport";
import Scenarios from "@toolkit/pages/Scenarios";
import Reports from "@toolkit/pages/Reports";
import Settings from "@toolkit/pages/Settings";
import Profile from "@toolkit/pages/Profile";
import Ownership from "@toolkit/pages/pillars/Ownership";
import ManagementControl from "@toolkit/pages/pillars/ManagementControl";
import SkillsDevelopment from "@toolkit/pages/pillars/SkillsDevelopment";
import ESD from "@toolkit/pages/pillars/ESD";
import SED from "@toolkit/pages/pillars/SED";
import Financials from "@toolkit/pages/pillars/Financials";
import IndustryNorms from "@toolkit/pages/pillars/IndustryNorms";

function ToolkitRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={ToolkitDashboard} />
        <Route path="/dashboard" component={ToolkitDashboard} />
        <Route path="/scorecard" component={Scorecard} />
        <Route path="/import" component={ExcelImport} />
        <Route path="/scenarios" component={Scenarios} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
        <Route path="/profile" component={Profile} />
        <Route path="/pillars/financials" component={Financials} />
        <Route path="/pillars/industry-norms" component={IndustryNorms} />
        <Route path="/pillars/ownership" component={Ownership} />
        <Route path="/pillars/management" component={ManagementControl} />
        <Route path="/pillars/employment-equity" component={ManagementControl} />
        <Route path="/pillars/skills" component={SkillsDevelopment} />
        <Route path="/pillars/procurement" component={ESD} />
        <Route path="/pillars/esd" component={ESD} />
        <Route path="/pillars/sed" component={SED} />
        <Route component={ToolkitDashboard} />
      </Switch>
    </AppLayout>
  );
}

function ClientAutoLoader({ clientId }: { clientId: string }) {
  const [, navigate] = useLocation();
  const { setActiveClientId, activeClientId } = useActiveClient();
  const { loadClientData, isLoaded } = useBbeeStore();
  const lastLoadedRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (clientId && clientId !== activeClientId) {
      setActiveClientId(clientId);
    }
  }, [clientId, activeClientId, setActiveClientId]);

  useEffect(() => {
    if (activeClientId && (activeClientId !== lastLoadedRef.current || retryCount > 0)) {
      lastLoadedRef.current = activeClientId;
      setLoadError(null);
      loadClientData(activeClientId).catch((err: any) => {
        console.error("Failed to load client data:", err);
        const msg = err?.message || "Unknown error";
        if (msg.includes("401") || msg.toLowerCase().includes("not authenticated")) {
          setLoadError("Your session has expired. Please log in again.");
        } else if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          setLoadError("Client record not found. It may still be saving — please wait a moment and retry.");
        } else {
          setLoadError(`Failed to load client data: ${msg}`);
        }
      });
    }
  }, [activeClientId, loadClientData, retryCount]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e] p-8 flex flex-col items-center gap-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-white font-bold text-lg mb-1">Unable to load scorecard</h2>
            <p className="text-[#8e8e93] text-sm leading-relaxed">{loadError}</p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => setRetryCount(c => c + 1)}
              className="flex-1 py-2.5 bg-white hover:bg-[#e5e5ea] text-black rounded-xl font-semibold text-sm transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => navigate("/processor")}
              className="flex-1 py-2.5 bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white rounded-xl font-semibold text-sm transition-colors border border-[#48484a]"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return <AppLoader />;
  }

  return <ToolkitRoutes />;
}

export default function ToolkitView() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId || "";

  return (
    <ClientProvider>
      <ClientAutoLoader clientId={clientId} />
    </ClientProvider>
  );
}
