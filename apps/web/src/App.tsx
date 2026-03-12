import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@toolkit/lib/queryClient";
import { ThemeProvider } from "@toolkit/components/theme-provider";
import { AuthProvider } from "@toolkit/lib/auth";
import { Toaster } from "@toolkit/components/ui/toaster";
import { TooltipProvider } from "@toolkit/components/ui/tooltip";
import LandingWrapper from "@/pages/LandingWrapper";
import AuthWrapper from "@/pages/AuthWrapper";
import Dashboard from "@/pages/Dashboard";
import EntityBuilder from "@/pages/EntityBuilder";
import DocumentProcessor from "@/pages/DocumentProcessor";

const ToolkitView = lazy(() => import("@/pages/ToolkitView"));

function ToolkitLoader() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
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
      <Route path="/" component={LandingWrapper} />
      <Route path="/auth" component={AuthWrapper} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/builder" component={EntityBuilder} />
      <Route path="/processor" component={DocumentProcessor} />
      <Route path="/toolkit/:clientId" nest component={ToolkitLoader} />
      <Route>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-4xl font-bold text-foreground">404</p>
            <p className="text-muted-foreground">This page doesn't exist.</p>
            <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-primary hover:underline" data-testid="link-404-dashboard">
              Go to Dashboard
            </a>
          </div>
        </div>
      </Route>
    </Switch>
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
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
