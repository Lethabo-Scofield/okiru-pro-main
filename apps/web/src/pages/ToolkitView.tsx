import { useEffect, useRef } from "react";
import { useParams } from "wouter";
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
  const { setActiveClientId, activeClientId } = useActiveClient();
  const { loadClientData, isLoaded, activeClientId: storeClientId } = useBbeeStore();
  const lastLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (clientId && clientId !== activeClientId) {
      setActiveClientId(clientId);
    }
  }, [clientId, activeClientId, setActiveClientId]);

  useEffect(() => {
    if (activeClientId && activeClientId !== lastLoadedRef.current) {
      lastLoadedRef.current = activeClientId;
      loadClientData(activeClientId).catch((err: any) => {
        console.error("Failed to load client data:", err);
      });
    }
  }, [activeClientId, loadClientData]);

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
