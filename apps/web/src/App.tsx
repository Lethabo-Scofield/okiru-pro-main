import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@toolkit/lib/queryClient";
import { ThemeProvider } from "@toolkit/components/theme-provider";
import { AuthProvider } from "@toolkit/lib/auth";
import { Toaster } from "@toolkit/components/ui/toaster";
import { TooltipProvider } from "@toolkit/components/ui/tooltip";
import { ProtectedRoute, GuestRoute } from "@/components/RouteGuards";
import LandingWrapper from "@/pages/LandingWrapper";
import AuthWrapper from "@/pages/AuthWrapper";
import HubLanding from "@/pages/HubLanding";
import Dashboard from "@/pages/Dashboard";
import EntityBuilder from "@/pages/EntityBuilder";
import DocumentProcessor from "@/pages/DocumentProcessor";
import NotFound from "@/pages/NotFound";
import AdminUsers from "@/pages/AdminUsers";
import CertificateHub from "@/pages/CertificateHub";
import CertificateDetail from "@/pages/CertificateDetail";
import AdminCertificates from "@/pages/AdminCertificates";
import DevMode from "@/pages/DevMode";
import Workspace from "@/pages/Workspace";
import CompanyProfilePage from "@/pages/CompanyProfilePage";
import AcceptInvite from "@/pages/AcceptInvite";
import { FeedbackWidget } from "@/components/FeedbackWidget";

const ToolkitView = lazy(() => import("@/pages/ToolkitView"));

/** Old links to `/onboarding` continue to work — company profile now lives on `/auth`. */
function LegacyOnboardingRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const q = window.location.search;
    navigate(`/auth${q}`, { replace: true });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function ToolkitLoader() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-2 border-[#636366] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground text-sm">Loading Toolkit...</p>
        </div>
      </div>
    }>
      <ToolkitView />
    </Suspense>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/">
        <GuestRoute><LandingWrapper /></GuestRoute>
      </Route>
      <Route path="/auth">
        <AuthWrapper />
      </Route>
      <Route path="/onboarding">
        <ProtectedRoute><LegacyOnboardingRedirect /></ProtectedRoute>
      </Route>
      <Route path="/hub">
        <ProtectedRoute><HubLanding /></ProtectedRoute>
      </Route>
      <Route path="/workspace">
        <ProtectedRoute><Workspace /></ProtectedRoute>
      </Route>
      <Route path="/company-profile">
        <ProtectedRoute><CompanyProfilePage /></ProtectedRoute>
      </Route>
      <Route path="/invite/:token">
        <AcceptInvite />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/builder">
        <ProtectedRoute><EntityBuilder /></ProtectedRoute>
      </Route>
      <Route path="/processor">
        <ProtectedRoute><DocumentProcessor /></ProtectedRoute>
      </Route>
      <Route path="/certificates">
        <CertificateHub />
      </Route>
      <Route path="/certificates/:slug">
        {(params) => <CertificateDetail slug={params.slug} />}
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute><AdminUsers /></ProtectedRoute>
      </Route>
      <Route path="/admin/certificates">
        <ProtectedRoute><AdminCertificates /></ProtectedRoute>
      </Route>
      <Route path="/toolkit" nest>
        <ProtectedRoute><ToolkitLoader /></ProtectedRoute>
      </Route>
      <Route path="/devmode">
        <ProtectedRoute><DevMode /></ProtectedRoute>
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function GlobalFeedbackWidget() {
  const [location] = useLocation();
  if (location === "/onboarding" || location.startsWith("/auth") || location.startsWith("/company-profile")) return null;
  return <FeedbackWidget />;
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="okiru-pro-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AppRouter />
            <GlobalFeedbackWidget />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
