import { useMemo } from "react";
import { Switch, Route, Link } from "wouter";
import { Leaf } from "lucide-react";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { AppNavBack } from "@/components/AppNavBack";
import { EsgAppLink } from "@/components/EsgAppLink";
import { esgClientsHref, esgCreateHref, esgSummaryHref } from "@/lib/esgRoutes";
import { toolkitPillarHref } from "@/lib/esg/esgToolkitNav";
import { formatEsgPercent } from "@/lib/esgCalculators";
import { ESG_PILLAR_MAX } from "@/lib/esgScoringDefaults";
import {
  ESG_SELECTED_TOPICS_CELL,
  computeScopedSummary,
  parseSelectedTopics,
} from "@/lib/esg/esgTopicScope";
import { EsgSidebar } from "./components/layout/EsgSidebar";
import { EsgAdvisor } from "./components/EsgAdviceChat";
import EsgDashboard from "./pages/EsgDashboard";
import EsgCarbonTax from "./pages/EsgCarbonTax";
import EsgNetZero from "./pages/EsgNetZero";
import EsgEnvironmental from "./pages/EsgEnvironmental";
import EsgSocial from "./pages/EsgSocial";
import EsgGovernance from "./pages/EsgGovernance";
import EsgBbbeeBridge from "./pages/EsgBbbeeBridge";
import EsgToolkitSectionPage from "./pages/EsgToolkitSectionPage";
import EsgImport from "./pages/EsgImport";
import { useEsgStore, type EsgStanceLabel } from "./lib/esgStore";

const STANCES: EsgStanceLabel[] = ["Lean", "Standard", "Strict"];

function EsgToolkitNotFound() {
  const companyId = useEsgStore((s) => s.companyId);
  return (
    <div className="text-[13px] text-[var(--esg-text3)]">
      Section not found.{" "}
      {companyId ? (
        <Link href="/" className="text-[var(--esg-acc-e)] underline">
          Back to dashboard
        </Link>
      ) : (
        <EsgAppLink href={esgClientsHref()} className="text-[var(--esg-acc-e)] underline">
          Select a company
        </EsgAppLink>
      )}
    </div>
  );
}

function EsgToolkitHeader() {
  const companyId = useEsgStore((s) => s.companyId);
  const companyName = useEsgStore((s) => s.companyName);
  const scorecard = useEsgStore((s) => s.scorecard);
  const stance = useEsgStore((s) => s.getStance());
  const setStance = useEsgStore((s) => s.setStance);
  const reportMode = useEsgStore((s) => s.getReportMode());
  const setReportMode = useEsgStore((s) => s.setReportMode);
  const topicsCsv = useEsgStore(
    (s) => s.workbook?.sections?.assumptions?.cells?.[ESG_SELECTED_TOPICS_CELL],
  );
  const selectedTopics = useMemo(() => parseSelectedTopics(topicsCsv), [topicsCsv]);
  const scoped = useMemo(
    () => (reportMode === "topic" ? computeScopedSummary(scorecard, selectedTopics) : null),
    [reportMode, scorecard, selectedTopics],
  );

  return (
    <header
      className="h-[var(--esg-hdr-h)] shrink-0 sticky top-0 z-20 flex items-center gap-3 px-5 border-b border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.75)] backdrop-blur-2xl"
      data-testid="esg-toolkit-header"
    >
      <AppNavBack
        href={esgClientsHref()}
        external
        eyebrow="ESG"
        label="Companies"
        variant="dark"
        size="compact"
        data-testid="esg-nav-back-clients"
      />
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
      <div className="hidden md:flex items-center gap-2 mr-2" data-testid="esg-header-scores">
        <div
          className="text-[22px] font-bold tracking-tight text-[var(--esg-acc-e)] tabular-nums"
          data-testid="esg-hdr-overall"
          title={scoped ? "Scoped to your selected topics" : undefined}
        >
          {scoped
            ? formatEsgPercent(scoped.overallPercent)
            : scorecard
              ? formatEsgPercent(scorecard.overallPercent)
              : "—"}
        </div>
        {(
          [
            { key: "environmental" as const, color: "var(--esg-acc-e)" },
            { key: "social" as const, color: "var(--esg-acc-s)" },
            { key: "governance" as const, color: "var(--esg-acc-g)" },
          ] as const
        )
          .filter((p) => !scoped || scoped.pillars[p.key].max > 0)
          .map((p) => (
            <Link
              key={p.key}
              href={toolkitPillarHref(p.key)}
              className="text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-full border border-[var(--esg-glass-border)] hover:bg-white/[0.06] transition-colors"
              style={{ color: p.color }}
              data-testid={`esg-hdr-${p.key}`}
              data-esg-pillar-href={toolkitPillarHref(p.key)}
            >
              {scoped
                ? `${scoped.pillars[p.key].score.toFixed(0)}/${scoped.pillars[p.key].max}`
                : `${scorecard ? scorecard[p.key].score.toFixed(0) : "—"}/${ESG_PILLAR_MAX[p.key]}`}
            </Link>
          ))}
      </div>
      <div className="flex gap-1 mr-2" data-testid="esg-scope-row">
        {(
          [
            { mode: "framework" as const, label: "Frameworks", title: "Report against named standards — the full framework-aligned workbook" },
            { mode: "topic" as const, label: "Topics", title: "Report on selected sustainability topics — no named standard implied" },
          ] as const
        ).map((m) => (
          <button
            key={m.mode}
            type="button"
            title={m.title}
            onClick={() => void setReportMode(m.mode)}
            className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
              reportMode === m.mode
                ? "bg-white/10 border-white/20 text-[var(--esg-text)] font-semibold"
                : "border-[var(--esg-glass-border)] text-[var(--esg-text3)] hover:text-[var(--esg-text2)]"
            }`}
            data-testid={`esg-scope-${m.mode}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 mr-2" data-testid="esg-stance-row">
        {STANCES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void setStance(s)}
            className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
              stance === s
                ? "bg-white/10 border-white/20 text-[var(--esg-text)] font-semibold"
                : "border-[var(--esg-glass-border)] text-[var(--esg-text3)] hover:text-[var(--esg-text2)]"
            }`}
            data-testid={`esg-stance-${s.toLowerCase()}`}
          >
            {s}
          </button>
        ))}
      </div>
      {companyId ? (
        <>
          <Link
            href="/"
            className="text-[11px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] px-3 py-1.5 rounded-full border border-[var(--esg-glass-border)]"
            data-testid="esg-link-dashboard"
          >
            Dashboard
          </Link>
          <EsgAppLink
            href={esgCreateHref(companyId)}
            className="text-[11px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] px-3 py-1.5 rounded-full border border-[var(--esg-glass-border)]"
            data-testid="esg-link-edit-workbook"
          >
            Edit workbook
          </EsgAppLink>
          <EsgAppLink
            href={esgSummaryHref(companyId)}
            className="text-[11px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] px-3 py-1.5 rounded-full border border-[var(--esg-glass-border)] hidden sm:inline"
            data-testid="esg-link-summary"
          >
            Summary
          </EsgAppLink>
        </>
      ) : null}
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
            <Route path="/net-zero" component={EsgNetZero} />
            <Route path="/carbon-tax" component={EsgCarbonTax} />
            <Route path="/bbbee-bridge" component={EsgBbbeeBridge} />
            <Route path="/environmental" component={EsgEnvironmental} />
            <Route path="/environmental/ghg" component={EsgToolkitSectionPage} />
            <Route path="/environmental/energy" component={EsgToolkitSectionPage} />
            <Route path="/environmental/fleet" component={EsgToolkitSectionPage} />
            <Route path="/environmental/waste" component={EsgToolkitSectionPage} />
            <Route path="/environmental/water" component={EsgToolkitSectionPage} />
            <Route path="/environmental/iso" component={EsgToolkitSectionPage} />
            <Route path="/social" component={EsgSocial} />
            <Route path="/social/management" component={EsgToolkitSectionPage} />
            <Route path="/social/wsp" component={EsgToolkitSectionPage} />
            <Route path="/social/health-safety" component={EsgToolkitSectionPage} />
            <Route path="/social/community" component={EsgToolkitSectionPage} />
            <Route path="/governance" component={EsgGovernance} />
            <Route path="/governance/board" component={EsgToolkitSectionPage} />
            <Route path="/governance/king5" component={EsgToolkitSectionPage} />
            <Route path="/governance/ifrs" component={EsgToolkitSectionPage} />
            <Route path="/governance/garp" component={EsgToolkitSectionPage} />
            <Route path="/governance/ethics" component={EsgToolkitSectionPage} />
            <Route path="/import" component={EsgImport} />
            <Route>
              <EsgToolkitNotFound />
            </Route>
          </Switch>
        </main>
      </div>
      <EsgAdvisor />
    </div>
  );
}
