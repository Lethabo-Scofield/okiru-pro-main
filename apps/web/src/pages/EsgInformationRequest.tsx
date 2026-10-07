import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  Building2,
  ChevronRight,
  Download,
  Leaf,
  Loader2,
  Save,
  Upload,
} from "lucide-react";
import { EsgSectionMissingPanel } from "@/components/esg-workbook/EsgSectionMissingPanel";
import { EsgValidationPanel } from "@/components/esg-workbook/EsgValidationPanel";
import { EsgAssistantChat } from "@/components/esg-workbook/EsgAssistantChat";
import {
  esgSectionHasMissingRequired,
  missingIssuesForEsgSection,
} from "@/lib/esgValidation";
import {
  EsgWorkbookSectionEditor,
  type EsgWorkbookSectionEditorHandle,
} from "@/components/esg-workbook/EsgWorkbookSectionEditor";
import { useAuth } from "@toolkit/lib/auth";
import { isEsgWorkbookAdmin } from "@/lib/esg/esgAccess";
import { useEsgStore } from "../../EsgToolkit/src/lib/esgStore";
import { EsgReportScopePanel } from "../../EsgToolkit/src/components/EsgReportScopePanel";
import { API_BASE } from "@toolkit/lib/config";
import { useToast } from "@/hooks/use-toast";
import {
  esgHomeHref,
  esgSummaryHref,
  hasChosenEsgStart,
  rememberEsgStartChosen,
  setEsgActiveCompany,
} from "@/lib/esgRoutes";
import { ESG_INPUT_SECTIONS, esgSectionById } from "@/lib/esgSections";
import { EsgImportPreviewModal } from "@/components/esg-workbook/EsgImportPreviewModal";
import { EsgTemplateMenu } from "@/components/esg-workbook/EsgTemplateMenu";
import { esgImportHandover, type EsgImportPreview } from "@/lib/esg/esgWorkbookImport";
import EsgCreateStartChoice from "@/components/esg/EsgCreateStartChoice";
import EsgDocumentUploadStart from "@/components/esg/EsgDocumentUploadStart";
import { esgWorkbookAxisState } from "@/lib/esg/esgCaseAxes";
import EsgFlowSteps from "@/components/esg/EsgFlowSteps";
import {
  esgPatchCellCount,
  persistEsgSectionPatches,
  type EsgInjectionResult,
} from "@/components/esg/esgParserInjection";
import { esgUploadFocus, type EsgUploadFocus } from "@/lib/esg/esgSectionElements";
import "@/styles/esg-glass.css";

const DEFAULT_SECTION = ESG_INPUT_SECTIONS[0]?.id ?? "company-reporting-setup";

function sectionFromQuery(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("section");
  return q && ESG_INPUT_SECTIONS.some((s) => s.id === q) ? q : null;
}

/**
 * Which of the three ways in the user is on.
 *
 * `deciding` is the moment before the workbook has loaded — we cannot tell an
 * empty workbook from an unloaded one, and flashing the chooser at somebody
 * with a half-filled workbook is worse than a beat of nothing.
 */
type EsgStartStage = "deciding" | "choose" | "upload" | "workbook";

export default function EsgInformationRequest() {
  const params = useParams<{ companyId: string }>();
  const companyId = params.companyId ?? "";
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isEsgAdmin = isEsgWorkbookAdmin(user);
  const load = useEsgStore((s) => s.load);
  const setCompanyName = useEsgStore((s) => s.setCompanyName);
  const companyName = useEsgStore((s) => s.companyName);
  const workbook = useEsgStore((s) => s.workbook);
  const loading = useEsgStore((s) => s.loading);
  const saving = useEsgStore((s) => s.saving);
  const submittedAt = useEsgStore((s) => s.submittedAt);
  const unlockWorkbook = useEsgStore((s) => s.unlockWorkbook);
  const setSubmitAttempted = useEsgStore((s) => s.setSubmitAttempted);
  const touched = useEsgStore((s) => s.touched);

  const [activeSectionId, setActiveSectionId] = useState(DEFAULT_SECTION);
  const [reopening, setReopening] = useState(false);
  const [importPreview, setImportPreview] = useState<EsgImportPreview | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /** A spreadsheet the template import could not place, handed to the document reader. */
  const [handover, setHandover] = useState<File[] | null>(null);
  /**
   * The section documents are being added from (C1): the reader looks for its
   * pillar and writes only there. Null is the whole workbook — the toolbar's
   * "Add documents" and the entry choice.
   */
  const [uploadFocus, setUploadFocus] = useState<EsgUploadFocus | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EsgWorkbookSectionEditorHandle>(null);
  const [sectionBusy, setSectionBusy] = useState(false);

  /**
   * `/esg/create/:companyId/start` always asks; the bare route only asks when
   * there is nothing in the workbook to go back to (see `stage` below).
   */
  const startRouteRequested = location.endsWith("/start");
  // `/start?with=documents` — the toolkit's upload hub sending someone
  // straight to the document reader rather than the chooser in front of it.
  const startWithDocuments =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("with") === "documents";
  const [stage, setStage] = useState<EsgStartStage>(
    startRouteRequested ? (startWithDocuments ? "upload" : "choose") : "deciding",
  );
  /** True while the parsed sections are being written into the workbook. */
  const [injecting, setInjecting] = useState(false);

  const goToWorkbook = useCallback(() => {
    if (companyId) rememberEsgStartChosen(companyId);
    setStage("workbook");
    // Leaving the /start route behind means Back does not drop the user into
    // the chooser again, and a refresh lands where they actually are.
    if (startRouteRequested) {
      navigate(`/esg/create/${encodeURIComponent(companyId)}`, { replace: true });
    }
  }, [companyId, navigate, startRouteRequested]);

  useEffect(() => {
    if (!companyId) {
      // No company in the URL is not "pick one from a list" — it is "you have
      // not started one yet", which is what `/esg` is for.
      navigate(esgHomeHref(), { replace: true });
      return;
    }
    setEsgActiveCompany(companyId);
    const fromQuery = sectionFromQuery();
    if (fromQuery) setActiveSectionId(fromQuery);

    let cancelled = false;
    (async () => {
      let name = "";
      try {
        const res = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(companyId)}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          name = data.name || "";
        }
      } catch {
        // ignore
      }
      if (!cancelled) {
        await load(companyId, name);
        if (name) setCompanyName(name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, load, navigate, setCompanyName]);

  /**
   * The sites and reporting months this workbook places figures on. Its own
   * when it states them; kept as they are once it holds monthly figures.
   */
  const workbookAxes = useMemo(
    () => esgWorkbookAxisState(workbook?.sections?.["e-data"]?.cells as Record<string, unknown> | undefined),
    [workbook],
  );

  /** Every captured cell across every section — the "is this workbook empty" test. */
  const totalCapturedCells = useMemo(
    () =>
      Object.values(workbook?.sections ?? {}).reduce(
        (sum, section) => sum + Object.keys(section?.cells ?? {}).length,
        0,
      ),
    [workbook],
  );

  /**
   * Decide, once, whether to offer the three ways in or go straight to the
   * workbook.
   *
   * The chooser is for a workbook with nothing in it — the state where the only
   * previous route to bulk data was an "Import / bulk upload" button hidden in
   * the toolbar. Anything else (a deep link to a section, a workbook with data,
   * a submitted workbook, a choice already made this session) goes straight
   * through, so no existing path grows a click.
   */
  useEffect(() => {
    if (stage !== "deciding") return;
    if (!companyId || loading) return;
    // `workbook` null after loading means the fetch failed; the workbook view
    // handles that itself and is the safer place to be.
    if (!workbook) {
      setStage("workbook");
      return;
    }
    const deepLinked = sectionFromQuery() !== null;
    const empty = totalCapturedCells === 0 && !submittedAt;
    setStage(empty && !deepLinked && !hasChosenEsgStart(companyId) ? "choose" : "workbook");
  }, [companyId, loading, stage, submittedAt, totalCapturedCells, workbook]);

  const activeSection = useMemo(
    () => ESG_INPUT_SECTIONS.find((s) => s.id === activeSectionId) ?? ESG_INPUT_SECTIONS[0],
    [activeSectionId],
  );

  const changeSection = useCallback(
    async (nextId: string) => {
      if (nextId === activeSectionId || sectionBusy) return;
      setSectionBusy(true);
      try {
        const ok = (await editorRef.current?.flush()) ?? true;
        if (!ok) {
          toast({
            title: "Save failed",
            description: "Could not save the current section before switching.",
            variant: "destructive",
          });
          return;
        }
        const leavingMissing = missingIssuesForEsgSection(workbook, touched, activeSectionId);
        if (leavingMissing.length > 0) {
          toast({
            title: "Section incomplete",
            description: `${leavingMissing.length} required item(s) still missing on “${activeSection.title}”.`,
          });
        }
        setActiveSectionId(nextId);
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("section", nextId);
          window.history.replaceState(null, "", url.pathname + url.search);
        }
      } finally {
        setSectionBusy(false);
      }
    },
    [activeSection.title, activeSectionId, sectionBusy, toast, touched, workbook],
  );

  /** "Add documents" from inside the open section (C1): save it, then read for its pillar. */
  const addDocumentsToSection = async () => {
    const ok = (await editorRef.current?.flush()) ?? true;
    if (!ok) {
      toast({
        title: "Save failed",
        description: "Could not save this section before adding documents.",
        variant: "destructive",
      });
      return;
    }
    setHandover(null);
    setUploadFocus(esgUploadFocus(activeSection.id, activeSection.title));
    setStage("upload");
  };

  const cellCount = useCallback(
    (sectionId: string) => Object.keys(workbook?.sections?.[sectionId]?.cells ?? {}).length,
    [workbook],
  );

  const sectionStatus = (sectionId: string) => (cellCount(sectionId) > 0 ? "filled" : "empty");

  const handleImportFile = async (file: File) => {
    // `importing` also drives the entry choice's spinner: parsing a 20-tab
    // workbook is not instant, and a card that does nothing for four seconds
    // reads as a card that does nothing.
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(
        `${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/import`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/octet-stream" },
          body: buf,
        },
      );
      if (!res.ok) {
        // Say WHAT failed, in the server's words. The generic toast here is how
        // a broken import read as "I selected the file and nothing happened" —
        // the request fired, the server refused it, and the only evidence was
        // a small unspecific toast (Zoleka's live report, prod 2026-08-24).
        const detail = await res.json().catch(() => null);
        toast({
          title: "Import failed",
          description:
            (detail as { error?: string } | null)?.error ??
            `The server refused the file (HTTP ${res.status}). Try again, and report this if it repeats.`,
          variant: "destructive",
        });
        return;
      }
      const preview = (await res.json()) as EsgImportPreview;
      // Not our template: placing nothing and then saying "Import complete" is
      // what this did. The document reader maps a register by its columns —
      // the same handover a new company's Excel route makes.
      const handoverNote = esgImportHandover(preview);
      if (handoverNote) {
        toast({ title: "That is not the Okiru template", description: handoverNote });
        setHandover([file]);
        setUploadFocus(null);
        setStage("upload");
        return;
      }
      setImportPreview(preview);
      setImportOpen(true);
    } catch (err) {
      // A network failure previously escaped the try (no catch): the spinner
      // stopped and NOTHING was shown at all.
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Network error — please try again.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async (replace: string[] = []) => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/import`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true, sections: importPreview.sections, replace }),
        },
      );
      if (!res.ok) throw new Error("confirm failed");
      setImportOpen(false);
      setImportPreview(null);
      await load(companyId, companyName, { force: true });
      toast({ title: "Import complete" });
      // An import from the entry choice has to land somewhere: without this the
      // chooser stayed on screen behind the modal and the imported data was
      // invisible.
      goToWorkbook();
    } catch {
      toast({ title: "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  /**
   * The document route's landing.
   *
   * Writes whatever the mapping seam produced into the workbook through the
   * SAME import endpoint the `.xlsx` path confirms with, then opens the
   * workbook. While `applyEsgParserResult` is a stub there is nothing to write
   * — so we say so plainly and still land them in the workbook rather than
   * pretending the upload achieved nothing.
   */
  const handleParsedDocuments = async ({ injection }: { injection: EsgInjectionResult }) => {
    setInjecting(true);
    try {
      const cells = esgPatchCellCount(injection.patches);
      // Added from inside a section (C1): what belonged elsewhere was held back, and saying
      // so is the difference between "kept to this section" and "lost".
      const heldBack = (injection.outsideFocus ?? []).reduce((sum, held) => sum + held.figures, 0);
      const heldBackNote =
        heldBack > 0
          ? ` ${heldBack} figure${heldBack === 1 ? "" : "s"} for other sections (${(injection.outsideFocus ?? [])
              .map((held) => esgSectionById(held.sectionId)?.title ?? held.sectionId)
              .join(", ")}) ${heldBack === 1 ? "was" : "were"} kept with the documents, not written.`
          : "";
      if (cells > 0) {
        // The placements travel too, so each cell keeps the document it came from (E4).
        await persistEsgSectionPatches(companyId, injection.patches, injection.placed);
        await load(companyId, companyName, { force: true });
        toast({
          title: uploadFocus ? `Values added to ${uploadFocus.title}` : "Values added to your workbook",
          description: `${cells} field${cells === 1 ? "" : "s"} filled in from your documents — review them before you submit.${heldBackNote}`,
        });
      } else {
        toast({
          title: "Documents read — workbook not filled in",
          description: (injection.valuesRead > 0
            ? `${injection.valuesRead} value${injection.valuesRead === 1 ? "" : "s"} were read and saved to your document library, but none could be placed into workbook cells yet.`
            : "No values could be extracted, so nothing was written. Complete the workbook below.") + heldBackNote,
        });
      }
      setUploadFocus(null);
      goToWorkbook();
    } catch (err) {
      toast({
        title: "Could not write the extracted values",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setInjecting(false);
    }
  };

  const reopenWorkbook = async () => {
    const ok = window.confirm(
      "Reopen this workbook for editing?\n\nInputs become editable again and scores can change. The reopen is recorded against this workbook.",
    );
    if (!ok) return;
    setReopening(true);
    try {
      await unlockWorkbook(companyId);
      await load(companyId, companyName, { force: true });
      toast({ title: "Workbook reopened", description: "Inputs can be edited again." });
    } catch (err) {
      toast({
        title: "Could not reopen workbook",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setReopening(false);
    }
  };

  const handleManualSave = async () => {
    const ok = await editorRef.current?.flush();
    if (ok === false) {
      toast({
        title: "Save failed",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Saved", description: "Workbook section saved." });
    }
  };

  const handleContinueToSummary = async () => {
    const ok = await editorRef.current?.flush();
    if (ok === false) {
      toast({
        title: "Could not save latest edits",
        description: "Fix the save error before continuing.",
        variant: "destructive",
      });
      return;
    }
    const currentMissing = missingIssuesForEsgSection(workbook, touched, activeSectionId);
    if (currentMissing.length > 0) {
      toast({
        title: "This section has gaps",
        description: `${currentMissing.length} required field(s) still empty — you can continue, but scores may be incomplete.`,
      });
    }
    setSubmitAttempted(true);
    navigate(esgSummaryHref(companyId));
  };

  const showSectionMissingBadge = (sectionId: string) =>
    Boolean(touched[sectionId]) && esgSectionHasMissingRequired(workbook, touched, sectionId);

  if (!companyId) return null;

  const saveStatusText = saving
    ? "Saving…"
    : workbook?.updatedAt
      ? `Saved ${new Date(workbook.updatedAt).toLocaleTimeString()}`
      : "Not saved yet";

  return (
    <div className="esg-theme flex flex-col text-white">

      <main
        className="flex-1 max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-6"
        data-testid="esg-information-request"
      >
        <nav
          className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--esg-text3)] mb-4"
          aria-label="Breadcrumb"
          data-testid="esg-breadcrumb"
        >
          <Link href="/hub" className="hover:text-[var(--esg-text2)]">
            Hub
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/esg/clients" className="hover:text-[var(--esg-text2)]">
            ESG
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-[var(--esg-text2)] truncate max-w-[140px]">
            {companyName || companyId}
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-[var(--esg-text)] font-medium">Inputs</span>
        </nav>

        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <Building2 className="h-4 w-4 text-[var(--esg-text3)] shrink-0" />
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold text-[var(--esg-text)] truncate">
                {loading && !companyName ? "Loading…" : companyName || "Company"}
              </h1>
              <p className="text-[12px] text-[var(--esg-text3)] font-mono truncate">{companyId}</p>
            </div>
          </div>
          {stage === "workbook" ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-[var(--esg-text3)]" data-testid="esg-save-status">
              {saveStatusText}
            </span>
            {/* The document route, reachable from inside the workbook too — a
                user who started manually and then received the client's
                evidence pack should not have to leave and come back. */}
            <button
              type="button"
              onClick={() => {
                setUploadFocus(null);
                setStage("choose");
              }}
              disabled={Boolean(submittedAt) || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
              data-testid="button-esg-add-documents"
            >
              <Upload className="h-3.5 w-3.5" /> Add documents
            </button>
            <button
              type="button"
              onClick={() => void handleManualSave()}
              disabled={loading || Boolean(submittedAt)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
              data-testid="button-esg-save"
            >
              <Save className="h-3.5 w-3.5" /> Save
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = "";
              }}
            />
            <EsgTemplateMenu
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
              testId="button-esg-download-template"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={Boolean(submittedAt) || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
              data-testid="button-esg-import-xlsx"
            >
              Import / bulk upload
            </button>
            <a
              href={`${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/export`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
              data-testid="button-esg-export"
            >
              <Download className="h-3.5 w-3.5" /> Export workbook
            </a>
            <button
              type="button"
              onClick={() => void handleContinueToSummary()}
              disabled={loading || !workbook}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--esg-acc-e)] text-[#080e14] font-semibold text-[13px] disabled:opacity-50"
              data-testid="button-esg-continue-summary"
            >
              Continue to Summary
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          ) : null}
        </div>

        {/* The Excel preview lives outside the stage branch: the entry choice
            and the workbook toolbar both open it, and it is the SAME preview +
            confirm in both cases. One import path, two doors. */}
        <EsgImportPreviewModal
          open={importOpen}
          preview={importPreview}
          onClose={() => {
            setImportOpen(false);
            setImportPreview(null);
          }}
          onConfirm={(replace) => void confirmImport(replace)}
          confirming={importing}
          // The workbook being imported INTO — what turns "812 cells" into
          // "300 of these replace figures you already captured".
          workbook={workbook ?? null}
          sectionLabels={Object.fromEntries(
            ESG_INPUT_SECTIONS.map((section) => [section.id, section.title]),
          )}
        />

        {stage === "deciding" ? (
          <div className="p-12 flex items-center justify-center gap-2 text-[var(--esg-text2)] text-[13px]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading workbook…
          </div>
        ) : stage === "choose" ? (
          <EsgCreateStartChoice
            companyName={companyName}
            importing={importing}
            onChooseUpload={() => {
              setUploadFocus(null);
              setStage("upload");
            }}
            onChooseExcel={(file) => void handleImportFile(file)}
            onChooseManual={goToWorkbook}
          />
        ) : stage === "upload" ? (
          <div className="mx-auto w-full max-w-2xl">
            <EsgFlowSteps current={2} className="mb-6" />
            <EsgDocumentUploadStart
              companyId={companyId}
              companyName={companyName}
              busy={injecting}
              onBack={() => {
                setHandover(null);
                // From inside a section, Back is that section — not the three ways in.
                setStage(uploadFocus ? "workbook" : "choose");
                setUploadFocus(null);
              }}
              onComplete={handleParsedDocuments}
              workbookAxes={workbookAxes}
              initialFiles={handover ?? undefined}
              focus={uploadFocus}
            />
          </div>
        ) : (
        <>
        <p className="text-[13px] text-[var(--esg-text2)] mb-6 -mt-2">
          Complete each section — scores update as you save. Once the required fields pass validation, continue to
          Summary and open the toolkit from there.
        </p>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="lg:hidden w-full space-y-3">
            <EsgSectionMissingPanel
              workbook={workbook}
              touched={touched}
              sectionId={activeSectionId}
              sectionTitle={activeSection?.title}
            />
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="flex gap-1.5 min-w-max pb-1" data-testid="esg-workbook-mobile-tabs">
                {ESG_INPUT_SECTIONS.map((section) => {
                  const active = activeSectionId === section.id;
                  const needsAttention = showSectionMissingBadge(section.id);
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => void changeSection(section.id)}
                      className={`shrink-0 px-3 py-2 rounded-lg text-[12px] whitespace-nowrap flex items-center gap-1.5 ${
                        active
                          ? "bg-white/[0.08] text-[var(--esg-text)]"
                          : "text-[var(--esg-text2)] hover:bg-white/[0.04]"
                      }`}
                      data-testid={`tab-${section.id}`}
                    >
                      {section.title}
                      {needsAttention ? (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0"
                          aria-label="Required fields missing"
                          data-testid={`tab-missing-${section.id}`}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="hidden lg:block w-full lg:w-64 shrink-0 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto space-y-3">
            <EsgSectionMissingPanel
              workbook={workbook}
              touched={touched}
              sectionId={activeSectionId}
              sectionTitle={activeSection?.title}
            />
            {/* The validation box — the same rules the import analysis diffs
                against, live on the page. Built long ago, mounted nowhere;
                a validator nobody can see is a validator that ignores
                everything. Clicking an issue jumps to its section. */}
            <EsgValidationPanel
              workbook={workbook}
              activeSectionId={activeSectionId}
              onSelectSection={(sectionId) => void changeSection(sectionId)}
            />
            <div
              className="rounded-xl border border-[var(--esg-glass-border)] bg-white/[0.02] p-2"
              data-testid="esg-workbook-tabs"
            >
              {ESG_INPUT_SECTIONS.map((section) => {
                const active = activeSectionId === section.id;
                const status = sectionStatus(section.id);
                const needsAttention = showSectionMissingBadge(section.id);
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => void changeSection(section.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[13px] flex items-center justify-between gap-2 ${
                      active
                        ? "bg-white/[0.08] text-[var(--esg-text)]"
                        : "text-[var(--esg-text2)] hover:bg-white/[0.04] hover:text-[var(--esg-text)]"
                    }`}
                    data-testid={`tab-${section.id}`}
                  >
                    <span className="truncate flex items-center gap-1.5 min-w-0">
                      {section.title}
                      {needsAttention ? (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0"
                          aria-label="Required fields missing"
                          data-testid={`tab-missing-${section.id}`}
                        />
                      ) : null}
                    </span>
                    <span
                      className={`text-[10px] tabular-nums shrink-0 ${
                        needsAttention
                          ? "text-amber-300"
                          : status === "filled"
                            ? "text-[var(--esg-acc-e)]"
                            : "text-[var(--esg-text3)]"
                      }`}
                    >
                      {needsAttention ? "!" : status === "filled" ? cellCount(section.id) : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section
            className="flex-1 min-w-0 rounded-2xl border border-white/[0.06] bg-[var(--esg-section-bg,#141416)] overflow-hidden"
            data-testid={`section-panel-${activeSection?.id ?? "unknown"}`}
          >
            {loading ? (
              <div className="p-12 flex items-center justify-center gap-2 text-[var(--esg-text2)] text-[13px]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading workbook…
              </div>
            ) : activeSection ? (
              <div className="p-5 sm:p-6">
                {activeSection.id === "company-reporting-setup" ? (
                  <div className="mb-6" data-testid="esg-setup-scope-slot">
                    <EsgReportScopePanel />
                  </div>
                ) : null}
                {activeSection.note ? (
                  <p className="text-[12px] text-[var(--esg-text3)] mb-4">{activeSection.note}</p>
                ) : null}
                {!submittedAt ? (
                  // Documents for this part of the workbook (C1): the reader is told which
                  // pillar to look for, and only this section's pillar is written.
                  <div className="mb-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void addDocumentsToSection()}
                      disabled={loading || sectionBusy}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
                      data-testid="button-esg-section-add-documents"
                    >
                      <Upload className="h-3.5 w-3.5" /> Add documents to this section
                    </button>
                  </div>
                ) : null}
                <EsgWorkbookSectionEditor
                  key={activeSection.id}
                  ref={editorRef}
                  sectionId={activeSection.id}
                  title={activeSection.title}
                />
                {submittedAt ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <p className="text-[12px] text-[var(--esg-acc-s)]">
                      Workbook submitted on {new Date(submittedAt).toLocaleDateString()} — inputs are locked and can
                      no longer be edited.
                      {isEsgAdmin ? "" : " Ask an administrator if this workbook needs to be reopened."}
                    </p>
                    {isEsgAdmin ? (
                      <button
                        type="button"
                        onClick={() => void reopenWorkbook()}
                        disabled={reopening}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[12px] text-[var(--esg-text2)] hover:text-[var(--esg-text)] disabled:opacity-50"
                        data-testid="button-esg-reopen-workbook"
                      >
                        {reopening ? "Reopening…" : "Reopen for editing"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
        {/* The AI chat — grounded server-side in THIS workbook's data,
            scores and validation findings. Workbook stage only: on the
            chooser and upload stages there is nothing to be asked about. */}
        <EsgAssistantChat companyId={companyId} activeSectionId={activeSectionId} />
        </>
        )}
      </main>
    </div>
  );
}
