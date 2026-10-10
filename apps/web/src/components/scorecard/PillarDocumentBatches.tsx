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
import { useEffect, useMemo, useState } from "react";
import { Checklist, type ChecklistOrigin } from "@/components/upload/flow/Checklist";

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

export type UploadOrigin = ChecklistOrigin;

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
  label: "Whole packs and workbooks",
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
  const unfiledCount = stagedFileNames.filter((name) => !filedBatchByFile[name]).length;

  // Groups are built from the matrix where it has an element, and from the
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

  return (
    <Checklist
      testIdPrefix=""
      testId="pillar-upload-batches"
      groups={batches}
      satisfied={satisfied}
      anyRead={satisfiedDocumentIds.length > 0}
      filedBatchByFile={filedBatchByFile}
      unfiledCount={unfiledCount}
      onPick={onPick}
      disabled={disabled}
      catalogueLoaded={elements !== null}
      // Guidance, not a gate: a failed list never blocks uploading, and every
      // group still takes files.
      notice={
        error ? (
          <p className="mt-1 text-[12px] text-[color:var(--muted)]" data-testid="batches-catalog-error">
            {error}. You can still upload — we will tell you what is missing after reading your documents.
          </p>
        ) : null
      }
    />
  );
}

export default PillarDocumentBatches;
