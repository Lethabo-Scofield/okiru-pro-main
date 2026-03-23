import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@toolkit/components/ui/toaster";
import { TooltipProvider } from "@toolkit/components/ui/tooltip";
import { ThemeProvider } from "@toolkit/components/theme-provider";
import { AuthProvider, useAuth } from "@toolkit/lib/auth";
import { ClientProvider } from "@toolkit/lib/client-context";
import NotFound from "@toolkit/pages/not-found";
import LandingPage from "@toolkit/pages/LandingPage";
import { AppLayout } from "@toolkit/components/layout/AppLayout";
import { ScorecardSkeleton, PillarPageSkeleton, ReportsSkeleton, ScenariosSkeleton, SettingsSkeleton } from "@toolkit/components/PageSkeletons";
import Dashboard from "@toolkit/pages/Dashboard";
import Ownership from "@toolkit/pages/pillars/Ownership";
import ManagementControl from "@toolkit/pages/pillars/ManagementControl";
import SkillsDevelopment from "@toolkit/pages/pillars/SkillsDevelopment";
import ESD from "@toolkit/pages/pillars/ESD";
import SED from "@toolkit/pages/pillars/SED";
import Financials from "@toolkit/pages/pillars/Financials";
import IndustryNorms from "@toolkit/pages/pillars/IndustryNorms";
import Reports from "@toolkit/pages/Reports";
import Scenarios from "@toolkit/pages/Scenarios";
import ExcelImport from "@toolkit/pages/ExcelImport";
import Scorecard from "@toolkit/pages/Scorecard";
import Settings from "@toolkit/pages/Settings";
import Profile from "@toolkit/pages/Profile";
import AuthPage from "@toolkit/pages/AuthPage";
import ClientSelector from "@toolkit/pages/ClientSelector";
import { AppLoader } from "@toolkit/components/Loader";
import okiruLogoDark from "@toolkit-assets/Okiru_WHT_Circle_Logo_V1_1772658965196.png";
import { useBbeeStore } from "@toolkit/lib/store";
import { useActiveClient } from "@toolkit/lib/client-context";
import { useEffect, useState } from "react";

function RouteAwareSkeleton() {
  const [location] = useLocation();

  if (location === '/scorecard') return <ScorecardSkeleton />;
  if (location === '/reports') return <ReportsSkeleton />;
  if (location === '/scenarios') return <ScenariosSkeleton />;
  if (location === '/settings') return <SettingsSkeleton />;
  if (location.startsWith('/pillars/')) return <PillarPageSkeleton />;

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-4">
        <img src={okiruLogoDark} alt="Okiru" className="h-16 w-16 rounded-full object-contain mx-auto animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading client data...</p>
      </div>
    </div>
  );
}

function DataLoader({ children }: { children: React.ReactNode }) {
  const { activeClientId } = useActiveClient();
  const { loadClientData, isLoaded, activeClientId: storeClientId } = useBbeeStore();

  useEffect(() => {
    if (activeClientId && activeClientId !== storeClientId) {
      loadClientData(activeClientId);
    }
  }, [activeClientId, storeClientId, loadClientData]);

  if (!isLoaded) {
    return <RouteAwareSkeleton />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <AppLayout>
      <DataLoader>
        <Switch>
          <Route path="/" component={Dashboard}/>
          <Route path="/scorecard" component={Scorecard}/>
          <Route path="/import" component={ExcelImport}/>
          <Route path="/scenarios" component={Scenarios}/>
          <Route path="/reports" component={Reports}/>
          <Route path="/settings" component={Settings}/>
          <Route path="/profile" component={Profile}/>
          
          <Route path="/pillars/financials" component={Financials}/>
          <Route path="/pillars/industry-norms" component={IndustryNorms}/>
          <Route path="/pillars/ownership" component={Ownership}/>
          <Route path="/pillars/management" component={ManagementControl}/>
          <Route path="/pillars/employment-equity" component={ManagementControl}/>
          <Route path="/pillars/skills" component={SkillsDevelopment}/>
          <Route path="/pillars/procurement" component={ESD}/>
          <Route path="/pillars/esd" component={ESD}/>
          <Route path="/pillars/sed" component={SED}/>
          
          <Route component={NotFound} />
        </Switch>
      </DataLoader>
    </AppLayout>
  );
}

function PostLoginClientGate() {
  const { activeClientId } = useActiveClient();

  if (!activeClientId) {
    return <ClientSelector />;
  }

  return <AppRoutes />;
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (isLoading) {
    return <AppLoader />;
  }

  if (!user) {
    if (showAuth) {
      return <AuthPage />;
    }
    return <LandingPage onNavigateAuth={() => setShowAuth(true)} />;
  }

  return (
    <ClientProvider>
      <PostLoginClientGate />
    </ClientProvider>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="okiru-pro-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AuthenticatedApp />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
