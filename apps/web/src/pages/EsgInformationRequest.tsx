import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronRight, Leaf } from "lucide-react";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { API_BASE } from "@toolkit/lib/config";
import { EsgFlowStepper } from "@/components/esg/EsgFlowStepper";
import { EsgValidationPanel } from "@/components/esg/EsgValidationPanel";
import { esgFlowStepHref, setEsgActiveCompany } from "@/lib/esgRoutes";
import { ESG_INPUT_SECTIONS } from "@/lib/esgSections";
import {
  fetchEsgWorkbook,
  saveEsgWorkbookSection,
  type EsgWorkbookData,
} from "@/lib/esgWorkbookStorage";
import "@/styles/esg-glass.css";

export default function EsgInformationRequest() {
  const params = useParams<{ companyId: string }>();
  const companyId = params.companyId ?? "";
  const [, navigate] = useLocation();
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [workbook, setWorkbook] = useState<EsgWorkbookData | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

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

  const goSummary = () => navigate(esgFlowStepHref("summary", companyId));

  const loadGoldenDemo = async () => {
    setSaving("demo");
    const demoCells = {
      D30: 36,
      _months_C_K: 9,
    };
    const sCells = { D28: 33, L12: 0, G35: 0 };
    const gCells = { D26: 64.8529411765 };
    try {
      await saveEsgWorkbookSection(companyId, "e-data", demoCells);
      await saveEsgWorkbookSection(companyId, "s-data", sCells);
      await saveEsgWorkbookSection(companyId, "g-data", gCells);
      const wb = await fetchEsgWorkbook(companyId);
      setWorkbook(wb);
    } finally {
      setSaving(null);
    }
  };

  const cellCount = (sectionId: string) =>
    Object.keys(workbook?.sections?.[sectionId]?.cells ?? {}).length;

  return (
    <div className="esg-theme min-h-screen flex flex-col">
      <header className="h-14 shrink-0 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 border-b border-[var(--esg-glass-border)] bg-[rgba(8,14,20,0.85)] backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <AppNavBack href="/esg/clients" eyebrow="ESG" label="Companies" variant="dark" size="compact" />
          <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-lg hidden sm:block" />
          <span className="text-[15px] font-semibold text-[var(--esg-text)] truncate flex items-center gap-2">
            <Leaf className="h-4 w-4 text-[var(--esg-acc-e)] shrink-0" />
            {loading ? "Loading…" : companyName}
          </span>
        </div>
        <UserAccountMenu variant="hub" />
      </header>

      <EsgFlowStepper companyId={companyId} />

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-8" data-testid="esg-information-request">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-[24px] font-semibold text-[var(--esg-text)]">ESG inputs</h1>
            <p className="text-[13px] text-[var(--esg-text2)] mt-1 mb-6">
              Phase 1 sections save to workbook storage. Full grid editors land in Phase 2.
            </p>

            <div className="grid gap-3">
              {ESG_INPUT_SECTIONS.map((section) => (
                <div
                  key={section.id}
                  className="esg-glass p-4 flex items-center justify-between gap-4"
                  data-testid={`esg-section-${section.id}`}
                >
                  <div>
                    <div className="text-[14px] font-medium text-[var(--esg-text)]">{section.title}</div>
                    <div className="text-[11px] text-[var(--esg-text3)] mt-0.5">
                      {section.sheet}
                      {section.note ? ` · ${section.note}` : ""}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-[var(--esg-glass-border)] ${
                      cellCount(section.id) > 0
                        ? "text-[var(--esg-acc-e)]"
                        : "text-[var(--esg-text3)]"
                    }`}
                  >
                    {section.phase1
                      ? cellCount(section.id) > 0
                        ? `${cellCount(section.id)} cells`
                        : "Empty"
                      : "Soon"}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={loadGoldenDemo}
                disabled={saving === "demo"}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--esg-glass-border)] text-[13px] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
                data-testid="button-esg-load-demo"
              >
                Load SG Consumer demo scores
              </button>
              <button
                type="button"
                onClick={goSummary}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[14px]"
                data-testid="button-esg-continue-summary"
              >
                Continue to summary
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="w-full lg:w-[280px] shrink-0">
            <EsgValidationPanel workbook={workbook} />
          </div>
        </div>
      </main>
    </div>
  );
}
