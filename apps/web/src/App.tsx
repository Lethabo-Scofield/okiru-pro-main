import { lazy, Suspense, useEffect, useState } from "react";
import { Switch, Route, useLocation, useParams } from "wouter";
import { Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@toolkit/lib/queryClient";
import { ThemeProvider } from "@toolkit/components/theme-provider";
import { AuthProvider } from "@toolkit/lib/auth";
import { Toaster } from "@toolkit/components/ui/toaster";
import { TooltipProvider } from "@toolkit/components/ui/tooltip";
import { ProtectedRoute, GuestRoute, SuperAdminRoute } from "@/components/RouteGuards";
import SuperAdmin from "@/pages/SuperAdmin";
import LandingWrapper from "@/pages/LandingWrapper";
import ProductLandingWrapper from "@/pages/ProductLandingWrapper";
import AboutWrapper from "@/pages/AboutWrapper";
import ContactWrapper from "@/pages/ContactWrapper";
import PrivacyWrapper from "@/pages/PrivacyWrapper";
import TermsWrapper from "@/pages/TermsWrapper";
import AuthWrapper from "@/pages/AuthWrapper";
import HubLanding from "@/pages/HubLanding";
import Dashboard from "@/pages/Dashboard";
// Super-admin-only giants (7k + 1.7k lines) — lazy so every ordinary user
// stops downloading flows they can never open.
const EntityBuilder = lazy(() => import("@/pages/EntityBuilder"));
const DocumentProcessor = lazy(() => import("@/pages/DocumentProcessor"));
import NotFound from "@/pages/NotFound";
import AdminUsers from "@/pages/AdminUsers";
import AdminAnalytics from "@/pages/AdminAnalytics";
import CertificateHub from "@/pages/CertificateHub";
import CertificateDetail from "@/pages/CertificateDetail";
import ParserDocumentLibrary from "@/pages/ParserDocumentLibrary";
import ParserDocumentDetail from "@/pages/ParserDocumentDetail";
import AdminCertificates from "@/pages/AdminCertificates";
import DevMode from "@/pages/DevMode";
import Workspace from "@/pages/Workspace";
import Settings from "@/pages/Settings";
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
import { usePageViewTracking } from "@/lib/gaTracker";
import { ScorecardAdviceChat } from "@toolkit/components/scorecard/ScorecardAdviceChat";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";

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
function TeamRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/workspace", { replace: true });
  }, [navigate]);
  return null;
}

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

function ToolkitAuthRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/auth?redirect=/toolkit", { replace: true });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#636366]" />
    </div>
  );
}

function AppRouter() {
  usePageViewTracking();
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
      <Route path="/privacy">
        <PrivacyWrapper />
      </Route>
      <Route path="/terms">
        <TermsWrapper />
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
      {/* Settings — account, billing/tokens, team, company in one shell.
          The bare /settings lands on Account; /settings/:tab picks a pane. */}
      <Route path="/settings">
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>
      <Route path="/settings/:tab">
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>
      {/* /team retired: two member/invite screens with different role models
          confused the permissions story — /workspace is the one surface. */}
      <Route path="/team">
        <TeamRedirect />
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
      <Route path="/create-scorecard/:companyId/estimate">
        <ProtectedRoute><InformationRequest /></ProtectedRoute>
      </Route>
      <Route path="/create-scorecard/:companyId">
        <ProtectedRoute><InformationRequest /></ProtectedRoute>
      </Route>
      <Route path="/create-scorecard">
        <ProtectedRoute><InformationRequest /></ProtectedRoute>
      </Route>
      <Route path="/documents/:id">
        {(params) => <ProtectedRoute><ParserDocumentDetail id={params.id} /></ProtectedRoute>}
      </Route>
      <Route path="/documents">
        <ProtectedRoute><ParserDocumentLibrary /></ProtectedRoute>
      </Route>
      <Route path="/information-request/:companyId">
        <ProtectedRoute><InformationRequestRedirect /></ProtectedRoute>
      </Route>
      <Route path="/information-request">
        <ProtectedRoute><InformationRequestRedirect /></ProtectedRoute>
      </Route>
      <Route path="/builder">
        <ProtectedRoute><SuperAdminOnlyRoute><Suspense fallback={null}><EntityBuilder /></Suspense></SuperAdminOnlyRoute></ProtectedRoute>
      </Route>
      <Route path="/processor">
        <ProtectedRoute><SuperAdminOnlyRoute><Suspense fallback={null}><DocumentProcessor /></Suspense></SuperAdminOnlyRoute></ProtectedRoute>
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
      <Route path="/admin/analytics">
        <ProtectedRoute><AdminAnalytics /></ProtectedRoute>
      </Route>
      <Route path="/toolkit/auth">
        <ToolkitAuthRedirect />
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

function GlobalScorecardAdvisor() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  if (location !== "/toolkit/scorecard") return null;

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open scorecard advisor"
        data-testid="button-scorecard-advisor-open"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-[4.75rem] right-5 z-[9998] flex items-center gap-2 rounded-full bg-zinc-950 py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium text-white shadow-[0_14px_36px_-18px_rgba(0,0,0,0.9)] ring-1 ring-white/15 transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-black"
      >
        <span className="relative h-8 w-8 shrink-0">
          <motion.span
            className="absolute inset-0 rounded-full bg-white/10"
            animate={{ scale: [1, 1.14, 1], opacity: [0.35, 0.08, 0.35] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <img
            src={logoCircle}
            alt=""
            className="relative h-8 w-8 rounded-full object-contain ring-1 ring-white/15"
          />
          <span className="pointer-events-none absolute left-[8px] top-[10px] h-[3px] w-[3px] rounded-full bg-white/85 shadow-[10px_0_0_rgba(255,255,255,0.85)]" />
          <span className="pointer-events-none absolute left-[10px] top-[18px] h-[5px] w-[12px] rounded-b-full border-b-2 border-white/85" />
        </span>
        <span className="hidden sm:inline">Ask Okiru</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[9999] bg-black/45 p-3 backdrop-blur-[2px] sm:p-5"
            role="presentation"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="absolute bottom-24 right-3 w-[calc(100vw-1.5rem)] max-w-[860px] overflow-hidden rounded-[24px] bg-[#101012] shadow-[0_30px_100px_-45px_rgba(0,0,0,1)] ring-1 ring-white/10 sm:right-5"
              role="dialog"
              aria-modal="true"
              aria-label="Scorecard advisor"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close scorecard advisor"
                className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <ScorecardAdviceChat compact />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="okiru-pro-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AppRouter />
            <GlobalScorecardAdvisor />
            <GlobalFeedbackWidget />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
