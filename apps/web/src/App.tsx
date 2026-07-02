import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@toolkit/lib/queryClient";
import { ThemeProvider } from "@toolkit/components/theme-provider";
import { AuthProvider } from "@toolkit/lib/auth";
import { Toaster } from "@toolkit/components/ui/toaster";
import { TooltipProvider } from "@toolkit/components/ui/tooltip";
import { ProtectedRoute, GuestRoute, SuperAdminRoute } from "@/components/RouteGuards";
import SuperAdmin from "@/pages/SuperAdmin";
import LandingWrapper from "@/pages/LandingWrapper";
import AboutWrapper from "@/pages/AboutWrapper";
import ContactWrapper from "@/pages/ContactWrapper";
import ProductLandingWrapper from "@/pages/ProductLandingWrapper";
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
import Team from "@/pages/Team";
import CompanyProfilePage from "@/pages/CompanyProfilePage";
import AcceptInvite from "@/pages/AcceptInvite";
import InformationRequest from "@/pages/InformationRequest";
import EsgClientSelector from "@/pages/EsgClientSelector";
import EsgInformationRequest from "@/pages/EsgInformationRequest";
import EsgScoreSummary from "@/pages/EsgScoreSummary";
import { EsgPreviewRoute } from "@/components/esg/EsgPreviewRoute";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { useAuth } from "@toolkit/lib/auth";
import { isSuperAdmin } from "@/lib/roles";

const ToolkitView = lazy(() => import("@/pages/ToolkitView"));
const EsgToolkitView = lazy(() => import("@/pages/EsgToolkitView"));

/** Legacy upload/build flows — super-admin only in production go-live. */
function SuperAdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isLoading && user && !isSuperAdmin(user)) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, isLoading, navigate]);
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#636366]" />
      </div>
    );
  }
  if (!user || !isSuperAdmin(user)) return null;
  return <>{children}</>;
}

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

/** Legacy `/information-request` URLs → canonical create-scorecard flow. */
function InformationRequestRedirect() {
  const params = useParams<{ companyId?: string }>();
  const [, navigate] = useLocation();
  useEffect(() => {
    const id = params.companyId;
    navigate(id ? `/create-scorecard/${encodeURIComponent(id)}` : "/create-scorecard", {
      replace: true,
    });
  }, [params.companyId, navigate]);
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="h-10 w-10 border-2 border-[#636366] border-t-transparent rounded-full animate-spin" />
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

function EsgToolkitLoader() {
  return (
    <Suspense
      fallback={
        <div className="esg-theme min-h-screen flex items-center justify-center">
          <div className="h-10 w-10 border-2 border-[#1de9a0] border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <EsgToolkitView />
    </Suspense>
  );
}

/** /esg → company picker */
function EsgHubRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/esg/clients", { replace: true });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#636366]" />
    </div>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/">
        <GuestRoute><LandingWrapper /></GuestRoute>
      </Route>
      <Route path="/products/:slug">
        <GuestRoute><ProductLandingWrapper /></GuestRoute>
      </Route>
      <Route path="/about">
        <GuestRoute><AboutWrapper /></GuestRoute>
      </Route>
      <Route path="/contact">
        <GuestRoute><ContactWrapper /></GuestRoute>
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
      <Route path="/team">
        <ProtectedRoute><Team /></ProtectedRoute>
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
      <Route path="/create-scorecard/:companyId/summary">
        <ProtectedRoute><InformationRequest /></ProtectedRoute>
      </Route>
      <Route path="/create-scorecard/:companyId">
        <ProtectedRoute><InformationRequest /></ProtectedRoute>
      </Route>
      <Route path="/create-scorecard">
        <ProtectedRoute><InformationRequest /></ProtectedRoute>
      </Route>
      <Route path="/information-request/:companyId">
        <ProtectedRoute><InformationRequestRedirect /></ProtectedRoute>
      </Route>
      <Route path="/information-request">
        <ProtectedRoute><InformationRequestRedirect /></ProtectedRoute>
      </Route>
      <Route path="/builder">
        <ProtectedRoute><SuperAdminOnlyRoute><EntityBuilder /></SuperAdminOnlyRoute></ProtectedRoute>
      </Route>
      <Route path="/processor">
        <ProtectedRoute><SuperAdminOnlyRoute><DocumentProcessor /></SuperAdminOnlyRoute></ProtectedRoute>
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
      <Route path="/esg">
        <ProtectedRoute><EsgPreviewRoute><EsgHubRedirect /></EsgPreviewRoute></ProtectedRoute>
      </Route>
      <Route path="/esg/clients">
        <ProtectedRoute><EsgPreviewRoute><EsgClientSelector /></EsgPreviewRoute></ProtectedRoute>
      </Route>
      <Route path="/esg/create/:companyId/summary">
        <ProtectedRoute><EsgPreviewRoute><EsgScoreSummary /></EsgPreviewRoute></ProtectedRoute>
      </Route>
      <Route path="/esg/create/:companyId">
        <ProtectedRoute><EsgPreviewRoute><EsgInformationRequest /></EsgPreviewRoute></ProtectedRoute>
      </Route>
      <Route path="/esg/toolkit/:companyId" nest>
        <ProtectedRoute><EsgPreviewRoute><EsgToolkitLoader /></EsgPreviewRoute></ProtectedRoute>
      </Route>
      <Route path="/esg/toolkit" nest>
        <ProtectedRoute><EsgPreviewRoute><EsgToolkitLoader /></EsgPreviewRoute></ProtectedRoute>
      </Route>
      <Route path="/devmode">
        <DevMode />
      </Route>
      <Route path="/super-admin">
        <SuperAdminRoute><SuperAdmin /></SuperAdminRoute>
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
