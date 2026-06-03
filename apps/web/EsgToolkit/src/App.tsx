import { Switch, Route } from "wouter";
import { Leaf } from "lucide-react";
import { Link } from "wouter";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { AppNavBack } from "@/components/AppNavBack";
import { esgCreateHref, esgSummaryHref, esgToolkitHref } from "@/lib/esgRoutes";
import { EsgSidebar } from "./components/layout/EsgSidebar";
import EsgDashboard from "./pages/EsgDashboard";
import EsgCarbonTax from "./pages/EsgCarbonTax";
import EsgNetZero from "./pages/EsgNetZero";
import EsgIso14083 from "./pages/EsgIso14083";
import EsgEnvironmental from "./pages/EsgEnvironmental";
import EsgSocial from "./pages/EsgSocial";
import EsgGovernance from "./pages/EsgGovernance";
import EsgBbbeeBridge from "./pages/EsgBbbeeBridge";
import { useEsgStore } from "./lib/esgStore";

function EsgToolkitNotFound() {
  const companyId = useEsgStore((s) => s.companyId);
  return (
    <div className="text-[13px] text-[var(--esg-text3)]">
      Section not found.{" "}
      {companyId ? (
        <Link href={esgCreateHref(companyId)} className="text-[var(--esg-acc-e)] underline">
          Edit workbook inputs
        </Link>
      ) : (
        <Link href="/esg/clients" className="text-[var(--esg-acc-e)] underline">
          Select a company
        </Link>
      )}
    </div>
  );
}

function EsgToolkitHeader() {
  const companyId = useEsgStore((s) => s.companyId);
  const companyName = useEsgStore((s) => s.companyName);

  return (
    <header
      className="h-[var(--esg-hdr-h)] shrink-0 sticky top-0 z-20 flex items-center gap-3 px-5 border-b border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.75)] backdrop-blur-2xl"
      data-testid="esg-toolkit-header"
    >
      <AppNavBack href="/esg/clients" eyebrow="ESG" label="Companies" variant="dark" size="compact" />
      <img src={logoCircle} alt="Okiru" className="h-7 w-7 rounded-md opacity-90" />
      <div className="flex items-center gap-2 min-w-0">
        <Leaf className="h-4 w-4 text-[var(--esg-acc-e)] shrink-0" />
        <span className="text-[14px] font-semibold text-[var(--esg-text)] truncate">
          {companyName || "ESG Toolkit"}
        </span>
      </div>
      {companyId ? (
        <span className="text-[10px] text-[var(--esg-text3)] font-mono truncate hidden sm:inline">
          {companyId}
        </span>
      ) : null}
      <div className="flex-1" />
      {companyId ? (
        <>
          <Link
            href={esgCreateHref(companyId)}
            className="text-[11px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] px-3 py-1.5 rounded-full border border-[var(--esg-glass-border)]"
            data-testid="esg-link-edit-workbook"
          >
            Edit workbook
          </Link>
          <Link
            href={esgSummaryHref(companyId)}
            className="text-[11px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] px-3 py-1.5 rounded-full border border-[var(--esg-glass-border)] hidden sm:inline"
            data-testid="esg-link-summary"
          >
            Summary
          </Link>
        </>
      ) : null}
      <Link
        href={esgToolkitHref(companyId)}
        className="text-[11px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] px-3 py-1.5 rounded-full border border-[var(--esg-glass-border)]"
        data-testid="esg-link-dashboard"
      >
        Dashboard
      </Link>
    </header>
  );
}

export function EsgAppRoutes() {
  return (
    <div className="esg-theme min-h-screen flex flex-col overflow-hidden">
      <EsgToolkitHeader />
      <div className="flex flex-1 min-h-0" style={{ height: "calc(100vh - var(--esg-hdr-h))" }}>
        <EsgSidebar />
        <main className="flex-1 overflow-y-auto p-6 sm:p-7">
          <Switch>
            <Route path="/" component={EsgDashboard} />
            <Route path="/environmental" component={EsgEnvironmental} />
            <Route path="/social" component={EsgSocial} />
            <Route path="/governance" component={EsgGovernance} />
            <Route path="/net-zero" component={EsgNetZero} />
            <Route path="/carbon-tax" component={EsgCarbonTax} />
            <Route path="/iso-14083" component={EsgIso14083} />
            <Route path="/bbbee-bridge" component={EsgBbbeeBridge} />
            <Route>
              <EsgToolkitNotFound />
            </Route>
          </Switch>
        </main>
      </div>
    </div>
  );
}
