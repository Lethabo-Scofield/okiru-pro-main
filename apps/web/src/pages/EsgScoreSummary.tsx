import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronRight, Leaf, Loader2 } from "lucide-react";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { API_BASE } from "@toolkit/lib/config";
import { EsgFlowStepper } from "@/components/esg/EsgFlowStepper";
import { EsgValidationPanel } from "@/components/esg/EsgValidationPanel";
import { computeEsgScores, formatEsgPercent, ESG_PILLAR_MAX } from "@/lib/esgCalculators";
import { esgFlowStepHref, setEsgActiveCompany } from "@/lib/esgRoutes";
import { fetchEsgWorkbook, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import "@/styles/esg-glass.css";

export default function EsgScoreSummary() {
  const params = useParams<{ companyId: string }>();
  const companyId = params.companyId ?? "";
  const [, navigate] = useLocation();
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [workbook, setWorkbook] = useState<EsgWorkbookData | null>(null);

  useEffect(() => {
    if (!companyId) {
      navigate("/esg/clients", { replace: true });
      return;
    }
    setEsgActiveCompany(companyId);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [clientRes, wb] = await Promise.all([
          fetch(`${API_BASE}/api/clients/${encodeURIComponent(companyId)}`, {
            credentials: "include",
          }),
          fetchEsgWorkbook(companyId),
        ]);
        if (clientRes.ok) {
          const data = await clientRes.json();
          if (!cancelled) setCompanyName(data.name || "Company");
        }
        if (!cancelled) setWorkbook(wb);
      } catch {
        if (!cancelled) setCompanyName("Company");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, navigate]);

  const scores = useMemo(() => computeEsgScores(workbook), [workbook]);
  const openToolkit = () => navigate("/esg/toolkit");

  return (
    <div className="esg-theme min-h-screen flex flex-col">
      <header className="h-14 shrink-0 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 border-b border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.85)] backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <AppNavBack
            href={esgFlowStepHref("inputs", companyId)}
            eyebrow="Inputs"
            label="Workbook"
            variant="dark"
            size="compact"
          />
          <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-lg hidden sm:block" />
          <span className="text-[15px] font-semibold text-[var(--esg-text)] truncate flex items-center gap-2">
            <Leaf className="h-4 w-4 text-[var(--esg-acc-e)] shrink-0" />
            Summary
          </span>
        </div>
        <UserAccountMenu variant="hub" />
      </header>

      <EsgFlowStepper companyId={companyId} />

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-8" data-testid="esg-score-summary">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--esg-text3)]" />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              <h1 className="text-[26px] font-semibold text-[var(--esg-text)]">{companyName}</h1>
              <p className="text-[13px] text-[var(--esg-text2)] mt-1 mb-6">
                Overall ESG score uses workbook D9: average of (E, S, G points ÷ 100).
              </p>

              <div className="esg-glass p-6 mb-4">
                <div className="text-[48px] font-bold text-[var(--esg-acc-e)] leading-none">
                  {scores ? formatEsgPercent(scores.overallPercent) : "—%"}
                </div>
                <div className="text-[11px] text-[var(--esg-text3)] mt-2">Overall ESG score (D9)</div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mb-8">
                {(
                  [
                    { key: "E", points: scores?.environmental, max: ESG_PILLAR_MAX.environmental, color: "var(--esg-acc-e)" },
                    { key: "S", points: scores?.social, max: ESG_PILLAR_MAX.social, color: "var(--esg-acc-s)" },
                    { key: "G", points: scores?.governance, max: ESG_PILLAR_MAX.governance, color: "var(--esg-acc-g)" },
                  ] as const
                ).map((p) => (
                  <div key={p.key} className="esg-glass-sm p-4">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--esg-text3)]">
                      {p.key} pillar
                    </div>
                    <div className="text-[22px] font-bold mt-1" style={{ color: p.color }}>
                      {p.points != null ? `${p.points.toFixed(1)} / ${p.max}` : `— / ${p.max}`}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={openToolkit}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[14px]"
                data-testid="button-esg-open-toolkit"
              >
                Open ESG toolkit
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="w-full lg:w-[280px]">
              <EsgValidationPanel workbook={workbook} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
