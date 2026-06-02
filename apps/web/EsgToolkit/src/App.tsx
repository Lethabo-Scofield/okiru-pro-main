import { Switch, Route } from "wouter";
import { Leaf } from "lucide-react";
import { Link } from "wouter";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { AppNavBack } from "@/components/AppNavBack";
import { EsgSidebar } from "./components/layout/EsgSidebar";
import EsgDashboard from "./pages/EsgDashboard";
import { EsgPlaceholderPage } from "./pages/EsgPlaceholderPage";
import { getEsgActiveCompany } from "@/lib/esgRoutes";

function EsgToolkitHeader() {
  const companyId = getEsgActiveCompany();

  return (
    <header
      className="h-[var(--esg-hdr-h)] shrink-0 sticky top-0 z-20 flex items-center gap-3 px-5 border-b border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.75)] backdrop-blur-2xl"
      data-testid="esg-toolkit-header"
    >
      <AppNavBack href="/esg/clients" eyebrow="ESG" label="Companies" variant="dark" size="compact" />
      <img src={logoCircle} alt="Okiru" className="h-7 w-7 rounded-md opacity-90" />
      <div className="flex items-center gap-2 min-w-0">
        <Leaf className="h-4 w-4 text-[var(--esg-acc-e)] shrink-0" />
        <span className="text-[14px] font-semibold text-[var(--esg-text)] truncate">ESG Toolkit</span>
      </div>
      {companyId ? (
        <span className="text-[10px] text-[var(--esg-text3)] font-mono truncate hidden sm:inline">
          {companyId}
        </span>
      ) : null}
      <div className="flex-1" />
      <Link
        href={companyId ? `/esg/create/${encodeURIComponent(companyId)}` : "/esg/clients"}
        className="text-[11px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] px-3 py-1.5 rounded-full border border-[var(--esg-glass-border)]"
        data-testid="esg-link-inputs"
      >
        Edit inputs
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
            <Route path="/net-zero">
              <EsgPlaceholderPage
                title="Net-Zero Roadmap"
                description="Milestone gaps from NetZero_Roadmap sheet — Phase 2."
              />
            </Route>
            <Route path="/environmental">
              <EsgPlaceholderPage
                title="Environmental"
                description="E_Data monthly grid and E_Scorecard outputs — Phase 1."
              />
            </Route>
            <Route path="/ghg">
              <EsgPlaceholderPage title="GHG & Energy" description="Scope 1–3 from E_Data — Phase 1." />
            </Route>
            <Route path="/fleet">
              <EsgPlaceholderPage title="Fleet Register" description="Fleet_Register grid — Phase 1." />
            </Route>
            <Route path="/waste">
              <EsgPlaceholderPage title="Waste Register" description="Waste_Register grid — Phase 1." />
            </Route>
            <Route path="/social">
              <EsgPlaceholderPage title="Social" description="S_Data and S_Scorecard — Phase 1." />
            </Route>
            <Route path="/ee-scorecard">
              <EsgPlaceholderPage
                title="EE Scorecard"
                description="EE_Scorecard feeds S_Scorecard rows 5–10 — required for social scoring."
              />
            </Route>
            <Route path="/governance">
              <EsgPlaceholderPage
                title="Governance"
                description="G_Data column F uses 0–5 maturity scores (not HTML Yes/Partial/No)."
              />
            </Route>
            <Route path="/king5">
              <EsgPlaceholderPage title="King V" description="King5_Scorecard checklist — Phase 1." />
            </Route>
            <Route path="/ifrs">
              <EsgPlaceholderPage title="IFRS S1/S2" description="IFRS_S1_S2 disclosures — Phase 1." />
            </Route>
            <Route path="/import">
              <EsgPlaceholderPage title="Data Import" description="Paste and Excel import — Phase 1." />
            </Route>
            <Route>
              <EsgPlaceholderPage title="Not found" description="This ESG section is not available yet." />
            </Route>
          </Switch>
        </main>
      </div>
    </div>
  );
}
