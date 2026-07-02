/**
 * CalculatorConfigGate + CalculatorConfigBanner
 *
 * Renders a destructive Alert with a Retry button when calculatorConfig fails
 * to load, a spinner while loading, and (gate) the children once ready.
 *
 * Replaces the silent `console.error` + stale-score behaviour previously
 * exhibited by loadCalculatorConfig + _recalculateAll when:
 *   - the sectorCode is unknown (e.g. "Manufacturing")
 *   - the FSC sub-sector is missing or malformed
 *   - the remote sector-config endpoint is unreachable
 *   - _recalculateAll is invoked before loadCalculatorConfig completes
 *
 * See apps/web/Toolkit/src/lib/store.ts for the status/error state machine.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@toolkit/components/ui/alert";
import { Button } from "@toolkit/components/ui/button";
import { useBbeeStore } from "@toolkit/lib/store";
import { useToast } from "@toolkit/hooks/use-toast";

interface BannerProps {
  /** Compact variant suitable for embedding above page content (no full-page spinner). */
  variant?: "banner" | "page";
}

function CalculatorConfigInner({ variant = "page" }: BannerProps): ReactNode | null {
  const status = useBbeeStore((s) => s.calculatorConfigStatus);
  const error = useBbeeStore((s) => s.calculatorConfigError);
  const activeClientId = useBbeeStore((s) => s.activeClientId);
  const loadCalculatorConfig = useBbeeStore((s) => s.loadCalculatorConfig);
  const { toast } = useToast();
  const prevStatusRef = useRef(status);

  // Auto-load when status is idle and we have a client (replicates
  // ScorecardSummary's existing pattern so deep-links to pillar pages hydrate
  // config without manual retry).
  useEffect(() => {
    if (status === "idle" && activeClientId) {
      loadCalculatorConfig(activeClientId).catch(() => {
        // loadCalculatorConfig sets its own error state — nothing to do here.
      });
    }
  }, [status, activeClientId, loadCalculatorConfig]);

  // Fire a one-time toast on first transition into error, so users navigating
  // away from the gated page still get a heads-up.
  useEffect(() => {
    if (prevStatusRef.current !== "error" && status === "error" && error) {
      toast({
        title: "Calculator config did not load",
        description: error.message,
        variant: "destructive",
      });
    }
    prevStatusRef.current = status;
  }, [status, error, toast]);

  if (status === "ready") return null;

  if (status === "loading" || status === "idle") {
    if (variant === "banner") {
      return (
        <div className="flex items-center gap-2 px-3 py-2 mb-3 text-xs text-muted-foreground bg-muted/30 border rounded-md" data-testid="calculator-config-banner-loading">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading calculator config…
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3" data-testid="calculator-config-gate-loading">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading calculator config…</p>
      </div>
    );
  }

  // status === "error"
  const isFscNoSub = error?.reason === "fsc-no-subsector";
  const retry = () => {
    if (!activeClientId) return;
    loadCalculatorConfig(activeClientId).catch(() => undefined);
  };

  return (
    <Alert variant="destructive" className={variant === "banner" ? "mb-4" : "max-w-2xl mx-auto mt-12"} data-testid="calculator-config-gate-error">
      <AlertTitle>Calculator config did not load</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{error?.message ?? "Unknown error loading calculator config."}</p>
        {error && (
          <p className="text-xs opacity-80">
            Sector: <span className="font-mono">{error.sectorCode}</span> · Scorecard: <span className="font-mono">{error.scorecardType}</span>
            {error.fscSubSector ? <> · FSC sub-sector: <span className="font-mono">{error.fscSubSector}</span></> : null}
            {" · "}reason: <span className="font-mono">{error.reason}</span>
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={retry} data-testid="calculator-config-retry">Retry</Button>
          {isFscNoSub && (
            <Button asChild variant="outline" size="sm">
              <Link to="/company-info">Pick FSC sub-sector</Link>
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

/** Full-page gate — wraps page content; renders children only when status === 'ready'. */
export function CalculatorConfigGate({ children }: { children: ReactNode }) {
  const status = useBbeeStore((s) => s.calculatorConfigStatus);
  const calculatorConfig = useBbeeStore((s) => s.calculatorConfig);
  if (status === "ready" && calculatorConfig) return <>{children}</>;
  return <CalculatorConfigInner variant="page" />;
}

/** Inline banner — renders nothing on ready; renders a small alert/spinner otherwise. */
export function CalculatorConfigBanner() {
  return <CalculatorConfigInner variant="banner" />;
}
