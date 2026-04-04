import { useParams } from "wouter";
import { queryClient } from "@toolkit/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@toolkit/components/ui/toaster";
import { TooltipProvider } from "@toolkit/components/ui/tooltip";
import { ThemeProvider } from "@toolkit/components/theme-provider";
import { ClientProvider } from "@toolkit/lib/client-context";
import { AppRoutes } from "@toolkit/App";

/**
 * ToolkitView - Embedded Toolkit for DocumentProcessor
 *
 * IMPORTANT: This component renders the Toolkit AppRoutes WITHOUT wrapping in AuthProvider.
 * The outer app (DocumentProcessor) already has AuthProvider, so we skip it here to avoid
 * double-wrapping which causes session flicker and logout issues.
 */
export default function ToolkitView() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId || "";

  if (clientId) {
    localStorage.setItem("okiru-pro-active-client", clientId);
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
