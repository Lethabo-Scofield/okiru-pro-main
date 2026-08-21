/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `/esg` — starting an ESG scorecard, in three steps, with no company up front.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS REPLACED
 *
 * `/esg` used to redirect to the company picker, which made naming a company
 * the first thing anyone did. Then the named-but-empty company opened its
 * workbook, with the document route reduced to a small "Add documents" button
 * in the toolbar. So the main way in was hidden behind the one step nobody can
 * do well yet: the evidence pack is what KNOWS the entity's registered name.
 *
 * THE ORDER NOW
 *
 *   1. Choose   — documents (primary), an Excel workbook, or by hand.
 *   2. Provide  — the upload/quote/pay/read flow, the `.xlsx`, or (manual only,
 *                 because there is nothing to read a name out of) the name.
 *   3. Review   — what was read, the name it produced, editable — then one
 *                 button that creates the company, writes the values and opens
 *                 the workbook.
 *
 * Nothing is created before step 3 confirms. A user who abandons the flow at
 * step 2 leaves no company behind, which is the other half of why naming first
 * was wrong: it littered the workspace with empty companies.
 *
 * WHAT IT REUSES RATHER THAN REBUILDS
 *   - `EsgCreateStartChoice` — the same three doors, unchanged.
 *   - `EsgDocumentUploadStart` — the same staging/quote/token/SSE flow. It
 *     already tolerates an empty `companyId` (it only stamps one on the case),
 *     so no upload code changed to run it before a company exists.
 *   - `parseEsgWorkbookXlsx` — literally the function the server import route
 *     calls. Running it here is what lets the Excel path be reviewed before a
 *     company exists; the WRITE still goes through the server's
 *     `{confirm:true, sections}` endpoint, so there is one import path.
 *   - `persistEsgSectionPatches` — the one workbook write.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Leaf, Loader2 } from "lucide-react";
import logoCircle from "@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png";
import { AppNavBack } from "@/components/AppNavBack";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { API_BASE } from "@toolkit/lib/config";
import { useToast } from "@/hooks/use-toast";
import {
  esgClientsHref,
  esgCreateHref,
  rememberEsgStartChosen,
  setEsgActiveCompany,
} from "@/lib/esgRoutes";
import { parseEsgWorkbookXlsx, type EsgImportPreview } from "@/lib/esg/esgWorkbookImport";
import EsgCreateStartChoice from "./EsgCreateStartChoice";
import EsgDocumentUploadStart from "./EsgDocumentUploadStart";
import EsgCreateReview, { type EsgCreateRoute, type EsgNameSource } from "./EsgCreateReview";
import EsgFlowSteps from "./EsgFlowSteps";
import { esgEntityNameFromSections, esgProposedEntityName } from "./esgEntityName";
import {
  esgPatchCellCount,
  persistEsgSectionPatches,
  type EsgInjectionResult,
  type EsgParserCaseLike,
  type EsgSectionPatches,
} from "./esgParserInjection";
import "@/styles/esg-glass.css";

type EsgCreateStep = "choose" | "provide" | "review";

/** What step 3 will write. Both routes produce the same section-patch shape. */
interface PendingWork {
  route: EsgCreateRoute;
  patches: EsgSectionPatches;
  injection: EsgInjectionResult | null;
  parserCase: EsgParserCaseLike | null;
  excel: { fileName: string; preview: EsgImportPreview } | null;
}

const EMPTY_WORK: PendingWork = {
  route: "manual",
  patches: {},
  injection: null,
  parserCase: null,
  excel: null,
};

export function EsgCreateFlow() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<EsgCreateStep>("choose");
  const [work, setWork] = useState<PendingWork>(EMPTY_WORK);
  const [manualName, setManualName] = useState("");
  const [entityName, setEntityName] = useState("");
  const [nameSource, setNameSource] = useState<EsgNameSource>("none");
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);

  const backToChoose = () => {
    setStep("choose");
    setWork(EMPTY_WORK);
    setEntityName("");
    setNameSource("none");
  };

  /**
   * The `.xlsx` route. Parsed here rather than server-side because there is no
   * company yet to parse it against — but with the SAME parser the server runs,
   * imported from the same module, so a workbook previewed here and one
   * previewed by the toolbar's import are the same read.
   */
  const handleExcel = async (file: File) => {
    setImporting(true);
    try {
      const preview = parseEsgWorkbookXlsx(await file.arrayBuffer());
      if (Object.keys(preview.sections).length === 0) {
        toast({
          title: "Nothing to import from that workbook",
          description:
            preview.unmatchedSheets.length > 0
              ? `None of its sheets match a workbook section (${preview.unmatchedSheets.slice(0, 3).join(", ")}). Download the template and fill that in.`
              : "No sheet in that file matched a workbook section.",
          variant: "destructive",
        });
        return;
      }
      const name = esgEntityNameFromSections(preview.sections);
      setWork({
        route: "excel",
        // Same shape the server's `{confirm:true, sections}` accepts; the cell
        // values are whatever the sheet held, exactly as the server import
        // would have handed them over.
        patches: preview.sections as EsgSectionPatches,
        injection: null,
        parserCase: null,
        excel: { fileName: file.name, preview },
      });
      setEntityName(name);
      setNameSource(name ? "workbook" : "none");
      setStep("review");
    } catch (err) {
      toast({
        title: "Could not read that workbook",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  /** The document route's landing — read, then reviewed, then created. */
  const handleParsedDocuments = async ({
    injection,
    parserCase,
  }: {
    injection: EsgInjectionResult;
    parserCase: EsgParserCaseLike | null;
  }) => {
    const proposed = esgProposedEntityName(parserCase, injection.patches);
    setWork({
      route: "documents",
      patches: injection.patches,
      injection,
      parserCase,
      excel: null,
    });
    setEntityName(proposed);
    setNameSource(proposed ? "documents" : "none");
    setStep("review");
  };

  /**
   * Create the company, write what was read, open the workbook.
   *
   * The company is created LAST, from a name the user has just confirmed —
   * mirroring `createFromSections` on the B-BBEE side. If the write fails after
   * the company exists we still open the workbook and say so: stopping here
   * would strand a real company with no way in, and retrying would create a
   * second one.
   */
  const confirmAndCreate = async () => {
    const name = entityName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: "Could not create the company",
          description: err.error || "Server error.",
          variant: "destructive",
        });
        return;
      }
      const created = (await res.json()) as { clientId?: string; id?: string };
      const companyId = String(created.clientId || created.id || "");
      if (!companyId) {
        toast({
          title: "Could not create the company",
          description: "The server did not return a company id.",
          variant: "destructive",
        });
        return;
      }

      setEsgActiveCompany(companyId);
      // The workbook offers the entry choice again when it is empty. Having
      // just come through it, this user must not be handed straight back to it.
      rememberEsgStartChosen(companyId);

      // The confirmed name belongs on the cover sheet too — it is the value the
      // user just approved, written through the same import path as everything
      // else. Merged, never replacing what the parser placed there.
      const cover = work.patches["company-reporting-setup"]?.cells ?? {};
      const patches: EsgSectionPatches = {
        ...work.patches,
        "company-reporting-setup": { cells: { ...cover, entity: name } },
      };

      let written = 0;
      try {
        await persistEsgSectionPatches(companyId, patches);
        written = esgPatchCellCount(work.patches);
      } catch (err) {
        toast({
          title: "Company created, but the values were not written",
          description:
            err instanceof Error
              ? err.message
              : "Open the workbook and import again from the toolbar.",
          variant: "destructive",
        });
        navigate(esgCreateHref(companyId));
        return;
      }

      toast({
        title: written > 0 ? "Workbook created and filled in" : "Workbook created",
        description:
          written > 0
            ? `${name} — ${written} value${written === 1 ? "" : "s"} written in. Review them before you submit.`
            : work.route === "documents"
              ? `${name} — nothing could be placed into workbook cells, so complete the sections below.`
              : name,
      });
      navigate(esgCreateHref(companyId));
    } catch (err) {
      toast({
        title: "Could not create the company",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="esg-theme min-h-screen flex flex-col bg-black text-white">
      <header
        className="h-14 shrink-0 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 bg-black"
        style={{ borderBottom: "1px solid #2c2c2e" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <AppNavBack href="/hub" eyebrow="Hub" label="Okiru Hub" variant="dark" size="compact" />
          <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-lg hidden sm:block" />
          <span className="text-[15px] font-semibold text-[var(--esg-text)] truncate flex items-center gap-2">
            <Leaf className="h-4 w-4 text-[var(--esg-acc-e)] shrink-0" />
            New ESG scorecard
          </span>
        </div>
        <UserAccountMenu variant="hub" />
      </header>

      <main
        className="flex-1 w-full max-w-[900px] mx-auto px-4 sm:px-6 py-8"
        data-testid="esg-create-flow"
      >
        {step === "choose" ? (
          <EsgCreateStartChoice
            importing={importing}
            onChooseUpload={() => {
              setWork({ ...EMPTY_WORK, route: "documents" });
              setStep("provide");
            }}
            onChooseExcel={(file) => void handleExcel(file)}
            onChooseManual={() => {
              setWork({ ...EMPTY_WORK, route: "manual" });
              setStep("provide");
            }}
            onOpenExisting={() => navigate(esgClientsHref())}
          />
        ) : null}

        {step === "provide" && work.route === "documents" ? (
          <div className="mx-auto w-full max-w-2xl">
            <EsgFlowSteps current={2} className="mb-6" />
            {/* No company yet, on purpose: the documents are what will name it.
                The uploader only stamps a company id onto the case when it has
                one, so this is the flow it already supported. */}
            <EsgDocumentUploadStart
              companyId=""
              onBack={backToChoose}
              onComplete={handleParsedDocuments}
            />
          </div>
        ) : null}

        {step === "provide" && work.route === "manual" ? (
          <div className="mx-auto w-full max-w-2xl" data-testid="esg-manual-name-step">
            <EsgFlowSteps current={2} className="mb-6" />
            <div className="mb-6 text-center">
              <h2
                className="text-[30px] font-semibold leading-tight tracking-tight text-[var(--esg-text,#fff)]"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
              >
                What is the company called?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-[var(--esg-text2,#8e8e93)]">
                You are completing this by hand, so there are no documents to read the name out of.
              </p>
            </div>
            <div className="rounded-[20px] border border-[var(--esg-glass-border,#2c2c2e)] bg-[var(--esg-section-bg,#141416)] p-5">
              <label
                htmlFor="esg-manual-name"
                className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3,#636366)]"
              >
                Company name
              </label>
              <input
                id="esg-manual-name"
                value={manualName}
                autoFocus
                autoComplete="organization"
                onChange={(event) => setManualName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && manualName.trim()) {
                    setEntityName(manualName.trim());
                    setNameSource("you");
                    setStep("review");
                  }
                }}
                placeholder="Type the registered name"
                className="mt-2 w-full rounded-xl border border-[var(--esg-glass-border,#2c2c2e)] bg-black/30 px-4 py-2.5 text-[15px] text-[var(--esg-text,#fff)] placeholder-[var(--esg-text3,#636366)] outline-none focus:border-[var(--esg-acc-e,#1de9a0)]/40"
                data-testid="esg-manual-name-input"
              />
            </div>
            <div className="mt-5 space-y-2">
              <button
                type="button"
                disabled={!manualName.trim()}
                onClick={() => {
                  setEntityName(manualName.trim());
                  setNameSource("you");
                  setStep("review");
                }}
                className="inline-flex w-full items-center justify-center rounded-2xl px-6 py-4 text-[15px] font-semibold transition-colors disabled:opacity-50"
                style={{ background: "var(--esg-acc-e, #1de9a0)", color: "#080e14" }}
                data-testid="esg-manual-name-continue"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={backToChoose}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-white/[0.10] px-5 text-[13.5px] font-semibold text-[#d1d1d6] transition-colors hover:bg-white/[0.04]"
                data-testid="esg-manual-name-back"
              >
                <ChevronLeft className="h-4 w-4" />
                Choose a different way to start
              </button>
            </div>
          </div>
        ) : null}

        {step === "review" ? (
          <EsgCreateReview
            route={work.route}
            entityName={entityName}
            onEntityNameChange={setEntityName}
            nameSource={nameSource}
            injection={work.injection}
            parserCase={work.parserCase}
            excel={work.excel}
            creating={creating}
            onBack={() => (work.route === "excel" ? backToChoose() : setStep("provide"))}
            onConfirm={() => void confirmAndCreate()}
          />
        ) : null}

        {importing ? (
          <p
            className="mt-4 flex items-center justify-center gap-2 text-[12px] text-[var(--esg-text2,#8e8e93)]"
            role="status"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--esg-acc-e,#1de9a0)]" />
            Reading that workbook — nothing is saved yet.
          </p>
        ) : null}
      </main>
    </div>
  );
}

export default EsgCreateFlow;
