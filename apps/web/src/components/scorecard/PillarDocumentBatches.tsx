/**
 * Upload by pillar, not by scorecard section.
 *
 * The old screen showed the verification's *section breakdown* — an accordion
 * of scorecard elements with "23 documents an auditor may ask for" under each,
 * and one shared drop zone somewhere else on the page. It read as a reference
 * list rather than a job, and it left the actual work ("which of these do I
 * have, and where do I put them?") entirely to the user.
 *
 * People do not gather evidence one document at a time. They gather it a pillar
 * at a time — ownership on Monday, skills on Tuesday, whatever the client sends
 * back on Thursday — usually as a folder per pillar. So the unit here is the
 * BATCH: five pillar batches plus one for the whole-file uploads that cover
 * several pillars at once (the information-gathering workbook, a client data
 * pack, the financials, or simply the entire evidence folder).
 *
 * Each batch takes files or a folder. Inside it, all 109 document types the
 * expert's matrix asks for are listed, and each one has its own slot for the
 * person who does want to file precisely.
 *
 * NOTHING ABOUT PROCESSING CHANGES. The classifier still decides what every
 * document actually is, and it still auto-places a document that belongs to a
 * different pillar than the one it was dropped in. The batch a file was filed
 * under is presentation: it tells the user where their work went, and it is
 * shown alongside — never instead of — what we actually read.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  FileQuestion,
  FilePlus2,
  FolderOpen,
  Info,
  Layers,
  Sparkles,
} from "lucide-react";

interface RequiredDocument {
  id: string;
  name: string;
  whatTheAuditorTests: string;
  exampleOfGoodData: string;
  expectedFields: string[];
}

interface RequiredElement {
  element: string;
  documentCount: number;
  documents: RequiredDocument[];
}

export interface UploadOrigin {
  batchId: string;
  batchLabel: string;
  documentTypeId?: string;
  documentTypeName?: string;
  fromFolder?: boolean;
}

/** Matrix element codes → the pillar names people actually use, in scorecard order. */
const PILLAR_ORDER: Array<{ element: string; label: string; blurb: string }> = [
  {
    element: "OWNERSHIP",
    label: "Ownership",
    blurb: "Who owns the company, and how much of it is black-owned.",
  },
  {
    element: "MANAGEMENT_CONTROL",
    label: "Management control",
    blurb: "Board, executives, senior and junior management, and your EE numbers.",
  },
  {
    element: "SKILLS_DEVELOPMENT",
    label: "Skills development",
    blurb: "Training spend, learnerships, and the people who went on them.",
  },
  {
    element: "ESD",
    label: "Enterprise & supplier development",
    blurb: "Procurement spend, supplier certificates, and the businesses you develop.",
  },
  {
    element: "SED",
    label: "Socio-economic development",
    blurb: "Community contributions and who benefited from them.",
  },
];

/**
 * The sixth batch. These are not matrix documents — they are the whole-file
 * uploads that answer several pillars at once, which is how most clients
 * actually send their evidence. Keeping them in their own batch stops people
 * hunting for the right pillar to put a 60-tab workbook in.
 */
const HOLISTIC_BATCH = {
  id: "HOLISTIC",
  label: "Workbooks & client data",
  blurb: "Whole files that cover several pillars at once. Drop them here and we sort out what goes where.",
  items: [
    {
      id: "holistic__info_gathering_workbook",
      name: "B-BBEE information gathering workbook",
      hint: "The filled-in workbook — every tab, in one upload.",
    },
    {
      id: "holistic__client_data_pack",
      name: "Client data pack",
      hint: "Whatever the client sent back: a spreadsheet, a zip of returns, a mixed bundle.",
    },
    {
      id: "holistic__annual_financial_statements",
      name: "Annual financial statements",
      hint: "Signed AFS for the measured year. Sets revenue, NPAT and the leviable amount.",
    },
    {
      id: "holistic__management_accounts",
      name: "Management accounts or trial balance",
      hint: "Where there are no signed AFS yet.",
    },
    {
      id: "holistic__payroll_export",
      name: "Payroll or employee master data",
      hint: "One export covering headcount, race, gender, occupational level and salaries.",
    },
    {
      id: "holistic__company_profile",
      name: "Company profile & registration documents",
      hint: "CIPC documents, company profile, letterheads — these name the measured entity.",
    },
    {
      id: "holistic__whole_folder",
      name: "Your whole evidence folder",
      hint: "Everything, unsorted. We read what we can and tell you what is missing.",
    },
  ],
};

const READABLE_ACCEPT = ".pdf,.txt,.csv,.doc,.docx,.xlsx,.xlsm,.xls,.pptx,.png,.jpg,.jpeg,.tiff,.tif,.webp";

/** Batch id → its display name, for anywhere outside this component. */
export const BATCH_LABELS: Record<string, string> = {
  ...Object.fromEntries(PILLAR_ORDER.map(({ element, label }) => [element, label])),
  [HOLISTIC_BATCH.id]: HOLISTIC_BATCH.label,
};

export function batchLabel(batchId: string): string {
  return BATCH_LABELS[batchId] ?? batchId;
}

export interface PillarDocumentBatchesProps {
  /** Matrix document ids the parser has already read values out of. */
  satisfiedDocumentIds?: string[];
  /** filename → the batch it was filed under, so each card can show its own pile. */
  filedBatchByFile?: Record<string, string>;
  /** Names of every file currently staged, for the "not yet filed" count. */
  stagedFileNames?: string[];
  /** Hand files up to the page. The page confirms, then adds and quotes them. */
  onPick: (files: File[], origin: UploadOrigin) => void;
  disabled?: boolean;
}

export function PillarDocumentBatches({
  satisfiedDocumentIds = [],
  filedBatchByFile = {},
  stagedFileNames = [],
  onPick,
  disabled = false,
}: PillarDocumentBatchesProps) {
  const [elements, setElements] = useState<RequiredElement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [dragBatch, setDragBatch] = useState<string | null>(null);

  // One pair of inputs for the whole component; the pending origin says which
  // batch (and optionally which document type) the pick belongs to. Rendering
  // 116 hidden file inputs would be the obvious alternative and a bad one.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const pendingOrigin = useRef<UploadOrigin | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/parser/required-documents", { credentials: "include" });
        if (!res.ok) throw new Error(`Could not load the document list (${res.status})`);
        const body = await res.json();
        if (!cancelled) setElements((body?.data?.elements ?? []) as RequiredElement[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the document list");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const satisfied = useMemo(() => new Set(satisfiedDocumentIds), [satisfiedDocumentIds]);

  const filedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const batchId of Object.values(filedBatchByFile)) {
      counts[batchId] = (counts[batchId] ?? 0) + 1;
    }
    return counts;
  }, [filedBatchByFile]);

  const unfiledCount = stagedFileNames.filter((name) => !filedBatchByFile[name]).length;

  const openPicker = (origin: UploadOrigin, kind: "files" | "folder") => {
    if (disabled) return;
    pendingOrigin.current = { ...origin, fromFolder: kind === "folder" };
    (kind === "folder" ? folderInputRef : fileInputRef).current?.click();
  };

  const handlePicked = (list: FileList | null) => {
    const origin = pendingOrigin.current;
    pendingOrigin.current = null;
    if (!origin || !list?.length) return;
    onPick(Array.from(list), origin);
  };

  const handleDrop = (event: React.DragEvent, origin: UploadOrigin) => {
    event.preventDefault();
    event.stopPropagation();
    setDragBatch(null);
    if (disabled || !event.dataTransfer.files?.length) return;
    onPick(Array.from(event.dataTransfer.files), origin);
  };

  // Batch cards are built from the matrix where it has an element, and from the
  // local list where it does not. Same shape either way, so one renderer.
  const batches = useMemo(() => {
    const byElement = new Map((elements ?? []).map((e) => [e.element, e]));
    const pillarBatches = PILLAR_ORDER.map(({ element, label, blurb }) => {
      const matrix = byElement.get(element);
      const documents = matrix?.documents ?? [];
      return {
        id: element,
        label,
        blurb,
        documentCount: matrix?.documentCount ?? documents.length,
        covered: documents.filter((doc) => satisfied.has(doc.id)).length,
        items: documents.map((doc) => ({ id: doc.id, name: doc.name, hint: doc.whatTheAuditorTests })),
        holistic: false,
      };
    }).filter((batch) => batch.documentCount > 0 || elements === null);

    return [
      ...pillarBatches,
      {
        id: HOLISTIC_BATCH.id,
        label: HOLISTIC_BATCH.label,
        blurb: HOLISTIC_BATCH.blurb,
        documentCount: HOLISTIC_BATCH.items.length,
        covered: 0,
        items: HOLISTIC_BATCH.items,
        holistic: true,
      },
    ];
  }, [elements, satisfied]);

  if (error) {
    // Guidance, not a gate: its failure must never block uploading.
    return (
      <p className="text-[12px] text-[#636366]">
        {error}. You can still upload — we will tell you what is missing after reading your documents.
      </p>
    );
  }

  const totalTypes = batches.reduce((sum, batch) => sum + (batch.holistic ? 0 : batch.documentCount), 0);
  const totalCovered = batches.reduce((sum, batch) => sum + batch.covered, 0);

  return (
    <div className="rounded-[22px] border border-white/[0.08] bg-[#0e0e10] p-5" data-testid="pillar-upload-batches">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={READABLE_ACCEPT}
        onChange={(e) => { handlePicked(e.target.files); e.currentTarget.value = ""; }}
        data-testid="batch-file-input"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => { handlePicked(e.target.files); e.currentTarget.value = ""; }}
        data-testid="batch-folder-input"
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#636366]">Upload by pillar</p>
          <h4
            className="mt-2 text-[22px] font-semibold leading-none text-white"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 500 }}
          >
            {satisfiedDocumentIds.length > 0
              ? `${totalCovered} of ${totalTypes} document types covered`
              : "Six batches, one at a time"}
          </h4>
          <p className="mt-2 max-w-lg text-[13px] leading-5 text-[#a1a1a6]">
            Send what you have for each pillar — files or a whole folder. You do not need all
            {totalTypes > 0 ? ` ${totalTypes}` : ""} document types, and it does not matter if something lands in
            the wrong batch: we read every document and file it where it actually belongs.
          </p>
        </div>
        {unfiledCount > 0 && (
          <p className="rounded-xl border border-white/[0.07] bg-[#141416] px-3 py-2 text-[11.5px] text-[#8e8e93]">
            {unfiledCount} file{unfiledCount === 1 ? "" : "s"} added outside a batch
          </p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {batches.map((batch) => {
          const isOpen = openBatch === batch.id;
          const filed = filedCounts[batch.id] ?? 0;
          const isDragTarget = dragBatch === batch.id;
          const origin: UploadOrigin = { batchId: batch.id, batchLabel: batch.label };

          return (
            <div
              key={batch.id}
              className={`overflow-hidden rounded-2xl border transition-colors ${
                isDragTarget ? "border-white/[0.35] bg-white/[0.04]" : "border-white/[0.07]"
              }`}
              onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragBatch(batch.id); }}
              onDragLeave={() => setDragBatch((current) => (current === batch.id ? null : current))}
              onDrop={(e) => handleDrop(e, origin)}
              data-testid={`batch-${batch.id}`}
            >
              <div className="flex flex-col gap-3 bg-white/[0.035] px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <button
                  type="button"
                  onClick={() => setOpenBatch(isOpen ? null : batch.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={isOpen}
                  data-testid={`batch-toggle-${batch.id}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                    {batch.holistic ? (
                      <Layers className="h-4 w-4 text-[#a1a1a6]" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-[#a1a1a6]" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[14px] font-medium text-white">
                      <span className="truncate">{batch.label}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-[#8e8e93] transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-[#8e8e93]">
                      {batch.blurb}
                    </span>
                    <span className="mt-1 block text-[11px] text-[#636366]">
                      {batch.holistic
                        ? `${batch.documentCount} kinds of upload`
                        : satisfiedDocumentIds.length > 0
                          ? `${batch.covered} of ${batch.documentCount} document types covered`
                          : `${batch.documentCount} document types`}
                      {filed > 0 && ` · ${filed} file${filed === 1 ? "" : "s"} added`}
                    </span>
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openPicker(origin, "files")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0e0e10] transition-colors hover:bg-[#f2f2f7] disabled:opacity-40"
                    data-testid={`batch-upload-files-${batch.id}`}
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    Files
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openPicker(origin, "folder")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-[#d1d1d6] transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                    data-testid={`batch-upload-folder-${batch.id}`}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Folder
                  </button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ul className="divide-y divide-white/[0.05]">
                      {batch.items.map((item) => {
                        const have = satisfied.has(item.id);
                        return (
                          <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                            <span className="mt-0.5 shrink-0" aria-hidden>
                              {have ? (
                                <Check className="h-3.5 w-3.5 text-[#30d158]" />
                              ) : (
                                <FileQuestion className="h-3.5 w-3.5 text-[#636366]" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] leading-5 text-[#d1d1d6]">
                                {item.name}
                                {/* Never colour alone — state is spelled out. */}
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-[#636366]">
                                  {have ? "supplied" : "not yet"}
                                </span>
                              </span>
                              {item.hint && (
                                <span className="mt-1 block text-[11.5px] leading-[1.45] text-[#8e8e93]">
                                  <Info className="mr-1 inline h-3 w-3 align-[-1px] text-[#636366]" />
                                  {item.hint}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() =>
                                openPicker(
                                  { ...origin, documentTypeId: item.id, documentTypeName: item.name },
                                  "files",
                                )
                              }
                              className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.10] px-2.5 py-1 text-[11px] font-medium text-[#a1a1a6] transition-colors hover:bg-white/[0.06] hover:text-[#e5e5ea] disabled:opacity-40"
                              aria-label={`Upload ${item.name}`}
                              data-testid={`upload-doc-${item.id}`}
                            >
                              <FilePlus2 className="h-3 w-3" />
                              Upload
                            </button>
                          </li>
                        );
                      })}
                      {batch.items.length === 0 && (
                        <li className="px-4 py-3 text-[12px] text-[#636366]">
                          Loading the document list…
                        </li>
                      )}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PillarDocumentBatches;
