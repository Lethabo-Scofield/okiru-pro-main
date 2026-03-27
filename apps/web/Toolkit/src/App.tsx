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
import ScorecardSummary from "@toolkit/pages/ScorecardSummary";
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
  const [, navigate] = useLocation();
  const { activeClientId } = useActiveClient();
  const { loadClientData, isLoaded, activeClientId: storeClientId } = useBbeeStore();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(0);

  useEffect(() => {
    if (activeClientId && (activeClientId !== storeClientId || retrying > 0)) {
      setLoadError(null);
      loadClientData(activeClientId).catch((err: any) => {
        const msg: string = err?.message || '';
        if (msg.includes('401') || msg.toLowerCase().includes('not authenticated')) {
          setLoadError('session');
        } else if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
          setLoadError('notfound');
        } else {
          setLoadError(msg || 'unknown');
        }
      });
    }
  }, [activeClientId, storeClientId, loadClientData, retrying]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="max-w-sm w-full bg-card rounded-2xl border border-border p-8 flex flex-col items-center gap-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-foreground text-base mb-1">
              {loadError === 'session' ? 'Session expired' : loadError === 'notfound' ? 'Client not found' : 'Failed to load data'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {loadError === 'session'
                ? 'Your session has expired. Please log in again.'
                : loadError === 'notfound'
                ? 'This client record was not found. It may still be saving — try retrying in a moment.'
                : `An unexpected error occurred: ${loadError}`}
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <button onClick={() => setRetrying(r => r + 1)} className="flex-1 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold text-sm transition-colors">
              Retry
            </button>
            <button onClick={() => navigate('/')} className="flex-1 py-2 bg-muted hover:bg-muted/70 text-muted-foreground rounded-lg font-semibold text-sm transition-colors">
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return <RouteAwareSkeleton />;
  }

  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <AppLayout>
      <DataLoader>
        <Switch>
          <Route path="/" component={Dashboard}/>
          <Route path="/scorecard" component={Scorecard}/>
          <Route path="/scorecard-summary" component={ScorecardSummary}/>
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
