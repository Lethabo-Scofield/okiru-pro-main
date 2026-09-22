import { useCallback, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Download, AlertTriangle, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@toolkit/components/ui/dialog";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { cn } from "@toolkit/lib/utils";
import { useToast } from "@toolkit/hooks/use-toast";
import { useEffect } from "react";
import { readSectionSheet, type SectionSheetRead } from "@/lib/workbookExcelNormalizer";
import {
  fetchCertificateMatches,
  applyCertificateMatches,
  type SupplierMatchResult,
  type AutofillReport,
  type ProcurementRow,
} from "@/lib/certificateAutofill";
import { downloadSectionTemplate } from "@/lib/informationRequestTemplate";
import { CertificatePreview } from "@/components/certificates/CertificatePreview";
import { describeDuplicates, findDuplicates, mergeByAmount } from "@/lib/duplicateRows";
import type { BulkImportSpec, ParsedRow } from "./bulkImportSpecs";

/**
 * One pillar's bulk upload, for every pillar.
 *
 * It is the workbook's "Import section" in the toolkit: choose a file, see what
 * was understood, see what would change, then add to what is there or replace
 * it. Nothing is written until that last click — the old uploads committed rows
 * the moment the file was read, so a wrong file meant undoing it by hand.
 *
 * The reading is `readSectionSheet`, shared with the whole-workbook import, so
 * an information-gathering workbook, a single-pillar export, or a template
 * downloaded from here all land the same way.
 */

type Step = "choose" | "review";

export interface BulkImportDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: BulkImportSpec<T>;
  /** What the pillar already holds — drives added-vs-updated and Replace. */
  existing: T[];
  /** Add these records. Called once, with everything, on confirm. */
  onImport: (entities: T[], mode: "append" | "replace") => void;
  /** Sector the template button should generate for. */
  sectorCode?: string;
  fscSubSector?: string;
}

interface Outcome<T> {
  added: T[];
  updated: T[];
  /** Rows that are not records: a missing name, an empty spend. */
  skipped: number;
  read: SectionSheetRead;
}

export function BulkImportDialog<T>({
  open,
  onOpenChange,
  spec,
  existing,
  onImport,
  sectorCode,
  fscSubSector,
}: BulkImportDialogProps<T>) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("choose");
  const [fileName, setFileName] = useState("");
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [sheetName, setSheetName] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [reading, setReading] = useState(false);

  /**
   * What our certificate registry knows about these suppliers.
   *
   * Looked up as soon as the file is read, applied only if the user says so.
   * A client's own spreadsheet is usually months behind on levels and expiry
   * dates, and we hold an independent record — but overwriting what somebody
   * typed, on the strength of a name match, is not ours to do silently.
   */
  const [certMatches, setCertMatches] = useState<SupplierMatchResult[] | null>(null);
  /**
   * Whether to collapse rows that repeat within this sheet.
   *
   * Off by default. A repeated row is usually a mistake but it is not always
   * one — two invoice lines for a supplier, two payments to a beneficiary —
   * and quietly folding a real second transaction takes spend out of a total
   * that was correct.
   */
  const [collapseDuplicates, setCollapseDuplicates] = useState(false);
  /**
   * The certificate being looked at.
   *
   * A match fills in a level and an expiry, and both move the score. Being
   * able to open the document those came from is the difference between
   * checking the match and taking its word for it.
   */
  const [previewing, setPreviewing] = useState<
    { id: string; supplierName: string | null; matchedName: string | null } | null
  >(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);
  const [useCertificates, setUseCertificates] = useState(true);
  /**
   * Matches made on a NAME that only resembles the supplier's, applied only if
   * asked for.
   *
   * A registration number identifies a company; a similar name guesses at one.
   * The registry matched "Interloc Freight Services (PTY) LTD" to a supplier
   * called "Interlink Freight Services" — a different company, and taking its
   * B-BBEE level would have put a wrong level on a real supplier and moved the
   * score. Off by default, and shown with both names side by side so the guess
   * is visible rather than buried.
   */
  const [useFuzzyMatches, setUseFuzzyMatches] = useState(false);

  const reset = useCallback(() => {
    setStep("choose");
    setFileName("");
    setBuffer(null);
    setSheetName(undefined);
    setMode("append");
    setReading(false);
    setCertMatches(null);
    setCertLoading(false);
    setCertError(null);
    setUseCertificates(true);
    setUseFuzzyMatches(false);
    setCollapseDuplicates(false);
  }, []);

  const existingIds = useMemo(
    () => new Set(existing.map((e) => spec.identity(e))),
    [existing, spec],
  );

  /**
   * What this file would do, recomputed whenever the chosen sheet changes.
   *
   * A row missing a required column is counted as skipped rather than imported
   * blank: a shareholder with no name is a spacer row in someone's spreadsheet,
   * not a shareholder.
   */
  const read = useMemo<SectionSheetRead | null>(() => {
    if (!buffer) return null;
    return readSectionSheet(buffer, spec.columns, {
      sectionKey: spec.sectionKey,
      sheetHints: spec.sheetHints,
      sheetName,
    });
  }, [buffer, sheetName, spec]);

  // Ask the registry as soon as the rows are known. Never blocks the import:
  // a registry that is down or slow leaves the spreadsheet's own values alone.
  useEffect(() => {
    if (!spec.certificateLookup || !read || read.rows.length === 0) return;
    let cancelled = false;
    setCertLoading(true);
    setCertError(null);
    void fetchCertificateMatches(read.rows as ProcurementRow[])
      .then((results) => {
        if (!cancelled) setCertMatches(results);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCertMatches(null);
          setCertError(error instanceof Error ? error.message : "Could not reach the certificate registry");
        }
      })
      .finally(() => {
        if (!cancelled) setCertLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [read, spec.certificateLookup]);

  /** The rows as they would be stored, with the registry applied if accepted. */
  const enriched = useMemo<{ rows: Record<string, unknown>[]; report: AutofillReport | null }>(() => {
    if (!read) return { rows: [], report: null };
    if (!useCertificates || !certMatches || certMatches.length === 0) {
      return { rows: read.rows, report: null };
    }
    const accepted = certMatches.filter(
      (m) => m.match && (useFuzzyMatches || m.match.basis !== "name-fuzzy"),
    );
    const applied = applyCertificateMatches(read.rows as ProcurementRow[], accepted);
    return { rows: applied.rows, report: applied.report };
  }, [read, certMatches, useCertificates, useFuzzyMatches]);

  /**
   * Rows that repeat WITHIN this sheet.
   *
   * The import already compared the sheet against what the company holds —
   * that is what separates "new" from "update". It never compared the sheet
   * against itself, so the same supplier on two lines was imported twice, and
   * every pillar inflates in the company's favour when that happens.
   */
  const duplicates = useMemo(() => {
    if (!read) return null;
    const entities = (enriched.rows as ParsedRow[])
      .filter((row) => !spec.requiredKeys.some((k) => String(row[k] ?? "").trim() === ""))
      .map((row) => spec.toEntity(row));
    return findDuplicates(entities, {
      identityOf: spec.identity,
      labelOf: spec.duplicateLabel,
      merge: spec.duplicateAmountField
        ? mergeByAmount<T>(spec.duplicateAmountField)
        : undefined,
    });
  }, [read, enriched, spec]);

  const outcome = useMemo<Outcome<T> | null>(() => {
    if (!read || !duplicates) return null;

    const rows = enriched.rows as ParsedRow[];
    const skipped = rows.filter((row) =>
      spec.requiredKeys.some((k) => String(row[k] ?? "").trim() === ""),
    ).length;

    const entities = collapseDuplicates
      ? duplicates.deduped
      : rows
          .filter((row) => !spec.requiredKeys.some((k) => String(row[k] ?? "").trim() === ""))
          .map((row) => spec.toEntity(row));

    const added: T[] = [];
    const updated: T[] = [];
    for (const entity of entities) {
      if (existingIds.has(spec.identity(entity))) updated.push(entity);
      else added.push(entity);
    }

    return { added, updated, skipped, read };
  }, [read, enriched, spec, existingIds, duplicates, collapseDuplicates]);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setReading(true);
      try {
        const data = await file.arrayBuffer();
        setFileName(file.name);
        setBuffer(data);
        setSheetName(undefined);
        setStep("review");
      } catch {
        toast({
          title: "Could not read that file",
          description: "It needs to be .xlsx, .xls or .csv.",
          variant: "destructive",
        });
      } finally {
        setReading(false);
      }
    },
    [toast],
  );

  const confirm = useCallback(() => {
    if (!outcome) return;
    const entities = mode === "replace" ? [...outcome.added, ...outcome.updated] : outcome.added;
    if (entities.length === 0) {
      toast({
        title: "Nothing to import",
        description: `No new ${spec.noun} were found in that sheet.`,
        variant: "destructive",
      });
      return;
    }
    onImport(entities, mode);
    toast({
      title: "Import complete",
      description:
        mode === "replace"
          ? `Replaced the ${spec.noun} with ${entities.length} from ${fileName}.`
          : `Added ${entities.length} ${spec.noun} from ${fileName}.`,
    });
    onOpenChange(false);
    reset();
  }, [outcome, mode, onImport, onOpenChange, reset, spec.noun, fileName, toast]);

  /** Supplier name per parsed row, so a match can be shown against its row. */
  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of (read?.rows ?? []) as ProcurementRow[]) {
      map.set(String(row._id), String(row.supplierName ?? "").trim());
    }
    return map;
  }, [read]);

  const confidentMatches = (certMatches ?? []).filter(
    (m) => m.match && m.match.basis !== "name-fuzzy",
  );
  const fuzzyMatches = (certMatches ?? []).filter(
    (m) => m.match && m.match.basis === "name-fuzzy",
  );

  const recognised = outcome
    ? outcome.read.headers.filter((h, i) => h && outcome.read.mappedKeys[i])
    : [];
  const unrecognised = outcome
    ? outcome.read.headers.filter((h, i) => h && !outcome.read.mappedKeys[i])
    : [];
  const missingRequired = outcome
    ? spec.columns
        .filter((c) => c.required && !outcome.read.mappedKeys.includes(c.key))
        .map((c) => c.label)
    : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-[760px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import {spec.label}
          </DialogTitle>
          <DialogDescription>
            Upload a spreadsheet of {spec.noun}. You will see what it changes before anything is
            saved.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
          data-testid={`input-bulk-${spec.sectionKey}`}
        />

        {step === "choose" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover-elevate transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFile(e.dataTransfer.files?.[0]);
              }}
              data-testid={`dropzone-bulk-${spec.sectionKey}`}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">
                {reading ? "Reading…" : "Click to choose a file, or drop one here"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                An information-gathering workbook, or a sheet of just these {spec.noun}.
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium mb-2 text-muted-foreground">
                Columns this pillar reads
              </p>
              <div className="flex flex-wrap gap-1.5">
                {spec.columns.slice(0, 14).map((c) => (
                  <Badge key={c.key} variant="secondary" className="text-[10px]">
                    {c.label}
                    {c.required ? " *" : ""}
                  </Badge>
                ))}
                {spec.columns.length > 14 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{spec.columns.length - 14} more
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 gap-2 px-0 text-xs"
                onClick={() =>
                  downloadSectionTemplate(spec.sectionKey, {
                    sectorCode: sectorCode ?? "RCOGP",
                    fscSubSector,
                  })
                }
                data-testid={`button-template-${spec.sectionKey}`}
              >
                <Download className="h-3.5 w-3.5" />
                Download a blank sheet with these columns
              </Button>
            </div>
          </div>
        )}

        {step === "review" && outcome && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{fileName}</span>
              {outcome.read.sheetName && (
                <>
                  <span className="text-muted-foreground">→ sheet</span>
                  <select
                    value={outcome.read.sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    data-testid={`select-sheet-${spec.sectionKey}`}
                  >
                    {outcome.read.sheetNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {!outcome.read.sheetName && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  No sheet in this file looks like {spec.label}.
                </p>
                <p className="mt-1 text-muted-foreground">
                  It has {outcome.read.sheetNames.length} sheet
                  {outcome.read.sheetNames.length === 1 ? "" : "s"}:{" "}
                  {outcome.read.sheetNames.join(", ")}. Download the blank sheet to see the
                  headings this pillar reads.
                </p>
              </div>
            )}

            {outcome.read.sheetName && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: `New ${spec.noun}`, value: outcome.added.length },
                    { label: "Already here", value: outcome.updated.length },
                    { label: "Rows skipped", value: outcome.skipped },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border p-3 text-center">
                      <div className="text-2xl font-semibold">{stat.value}</div>
                      <div className="text-[11px] text-muted-foreground">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* What our own registry holds for these suppliers. Shown
                    before anything is applied, because a name match against an
                    outside record is a suggestion, not a fact — and an expiry
                    date is the single field a client's spreadsheet is most
                    often wrong about. */}
                {spec.certificateLookup && (
                  <div className="rounded-lg border p-3">
                    {certLoading ? (
                      <p className="text-xs text-muted-foreground">
                        Checking these suppliers against the certificate registry…
                      </p>
                    ) : certError ? (
                      <p className="text-xs text-muted-foreground">
                        Certificate registry unavailable — importing the spreadsheet's own values.
                      </p>
                    ) : certMatches && certMatches.length > 0 ? (
                      <>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useCertificates}
                            onChange={(e) => setUseCertificates(e.target.checked)}
                            className="mt-0.5"
                            data-testid="use-certificates"
                          />
                          <span className="text-xs">
                            <span className="font-medium">
                              Identified {confidentMatches.length} of {certMatches.length} suppliers
                              in our registry.
                            </span>{" "}
                            <span className="text-muted-foreground">
                              Matched on registration number or exact name. Fill in their B-BBEE
                              level and expiry date; values already in your sheet are kept.
                            </span>
                          </span>
                        </label>

                        {useCertificates && (
                          <div className="mt-2.5 max-h-[150px] overflow-y-auto rounded border">
                            <table className="w-full text-[11px]">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="px-2 py-1.5 text-left font-medium">Your supplier</th>
                                  <th className="px-2 py-1.5 text-left font-medium">Matched to</th>
                                  <th className="px-2 py-1.5 text-left font-medium">Level</th>
                                  <th className="px-2 py-1.5 text-left font-medium">Expires</th>
                                  <th className="px-2 py-1.5 text-left font-medium sr-only">Certificate</th>
                                </tr>
                              </thead>
                              <tbody>
                                {confidentMatches
                                  .slice(0, 12)
                                  .map((m, i) => (
                                    <tr key={i} className="border-t">
                                      <td className="px-2 py-1 truncate max-w-[160px]">
                                        {supplierNameById.get(m.key) || "—"}
                                      </td>
                                      <td className="px-2 py-1 truncate max-w-[180px]">
                                        {m.match?.companyName ?? "—"}
                                      </td>
                                      <td className="px-2 py-1">
                                        {m.match?.fields?.bbbeeLevel != null
                                          ? `Level ${m.match.fields.bbbeeLevel}`
                                          : "—"}
                                      </td>
                                      <td className="px-2 py-1">
                                        {m.match?.expiryDate ?? (
                                          <span className="text-amber-500">not on record</span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1 text-right">
                                        {m.match?.certificateId && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPreviewing({
                                                id: m.match!.certificateId!,
                                                supplierName: supplierNameById.get(m.key) ?? null,
                                                matchedName: m.match!.companyName,
                                              })
                                            }
                                            className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-primary underline-offset-2 hover:underline"
                                            data-testid={`preview-certificate-${m.key}`}
                                          >
                                            View
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Matched on a name that merely resembles the supplier's.
                            Shown separately and off by default: taking a level
                            from the wrong company puts a wrong level on a real
                            supplier and moves the score. Both names are side by
                            side so the guess can be judged rather than trusted. */}
                        {fuzzyMatches.length > 0 && (
                          <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/[0.05] p-2.5">
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={useFuzzyMatches}
                                onChange={(e) => setUseFuzzyMatches(e.target.checked)}
                                className="mt-0.5"
                                data-testid="use-fuzzy-matches"
                              />
                              <span className="text-xs">
                                <span className="font-medium text-amber-500">
                                  {fuzzyMatches.length} more matched only on a similar name.
                                </span>{" "}
                                <span className="text-muted-foreground">
                                  These may be different companies. Check each one before using it.
                                </span>
                              </span>
                            </label>
                            <div className="mt-2 max-h-[110px] overflow-y-auto">
                              <table className="w-full text-[11px]">
                                <tbody>
                                  {fuzzyMatches.slice(0, 8).map((m, i) => (
                                    <tr key={i} className="border-t border-amber-500/20">
                                      <td className="px-2 py-1 truncate max-w-[170px]">
                                        {supplierNameById.get(m.key) || "—"}
                                      </td>
                                      <td className="px-2 py-1 text-muted-foreground">→</td>
                                      <td className="px-2 py-1 truncate max-w-[190px]">
                                        {m.match?.companyName ?? "—"}
                                      </td>
                                      <td className="px-2 py-1">
                                        {m.match?.fields?.bbbeeLevel != null
                                          ? `Level ${m.match.fields.bbbeeLevel}`
                                          : "—"}
                                      </td>
                                      <td className="px-2 py-1 text-right">
                                        {m.match?.certificateId && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPreviewing({
                                                id: m.match!.certificateId!,
                                                supplierName: supplierNameById.get(m.key) ?? null,
                                                matchedName: m.match!.companyName,
                                              })
                                            }
                                            className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-500 underline-offset-2 hover:underline"
                                            data-testid={`preview-fuzzy-certificate-${m.key}`}
                                          >
                                            Check it
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* A lapsed certificate still identifies the supplier, but
                            it cannot be used to score them — so say which, rather
                            than filling the grid and letting it look complete. */}
                        {enriched.report && enriched.report.notValid.length > 0 && (
                          <p className="mt-2 text-[11px] text-amber-500">
                            {enriched.report.notValid.length} certificate
                            {enriched.report.notValid.length === 1 ? " has" : "s have"} lapsed or
                            carry no expiry date — the expiry is filled in, the scoring columns are
                            left for you.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No matching certificates in our registry — importing the spreadsheet's own
                        values.
                      </p>
                    )}
                  </div>
                )}

                {missingRequired.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    <p className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      No column found for: {missingRequired.join(", ")}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Rows without these are counted as skipped rather than imported half-filled.
                    </p>
                  </div>
                )}

                {unrecognised.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{recognised.length}</span> columns
                    understood. Ignored:{" "}
                    {unrecognised.slice(0, 8).join(", ")}
                    {unrecognised.length > 8 ? ` +${unrecognised.length - 8} more` : ""}.
                  </p>
                )}

                {outcome.added.length + outcome.updated.length > 0 && (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          {spec.previewColumns.map((c) => (
                            <th key={c} className="px-3 py-2 text-left font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...outcome.added, ...outcome.updated].slice(0, 8).map((e, i) => (
                          <tr key={i} className="border-t">
                            {spec.describe(e).map((cell, j) => (
                              <td key={j} className="px-3 py-1.5 truncate max-w-[200px]">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {outcome.added.length + outcome.updated.length > 8 && (
                      <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                        and {outcome.added.length + outcome.updated.length - 8} more
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  {(["append", "replace"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={cn(
                        "flex-1 rounded-lg border p-3 text-left text-xs transition-colors",
                        mode === m ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                      data-testid={`mode-${m}-${spec.sectionKey}`}
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        {mode === m && <Check className="h-3.5 w-3.5" />}
                        {m === "append" ? "Add to what is here" : "Replace what is here"}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {m === "append"
                          ? `Keeps the ${existing.length} already captured and adds ${outcome.added.length}.`
                          : `Removes all ${existing.length} and leaves ${outcome.added.length + outcome.updated.length}.`}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* The same record twice in one sheet. Shown before the import,
                because afterwards it is two rows in a register that look like
                two real ones — and every pillar inflates in the company's
                favour when it happens. */}
            {duplicates && duplicates.groups.length > 0 && (
              <div
                className="rounded border border-amber-500/40 bg-amber-500/[0.05] p-2.5"
                data-testid="duplicate-warning"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-amber-500">
                      {describeDuplicates(duplicates, spec.noun)}
                    </p>
                    <label className="mt-2 flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={collapseDuplicates}
                        onChange={(e) => setCollapseDuplicates(e.target.checked)}
                        className="mt-0.5"
                        data-testid="collapse-duplicates"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {spec.duplicateAmountField
                          ? `Import one record each and add the ${spec.duplicateAmountField}s together. Leave this unticked if they are genuinely separate entries.`
                          : "Import one record each, keeping the first of every repeat."}
                      </span>
                    </label>
                    <div className="mt-2 max-h-[110px] overflow-y-auto">
                      <table className="w-full text-[11px]">
                        <tbody>
                          {duplicates.groups.slice(0, 8).map((group) => (
                            <tr key={group.key} className="border-t border-amber-500/20">
                              <td className="max-w-[240px] truncate px-2 py-1">
                                {group.label || "unnamed"}
                              </td>
                              <td className="px-2 py-1 text-muted-foreground">
                                rows {group.positions.join(", ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={reset}>
                Choose another file
              </Button>
              <Button
                onClick={confirm}
                disabled={!outcome.read.sheetName}
                data-testid={`button-confirm-${spec.sectionKey}`}
              >
                {mode === "replace"
                  ? `Replace with ${outcome.added.length + outcome.updated.length}`
                  : `Add ${outcome.added.length} ${spec.noun}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Outside DialogContent: the preview is its own layer, so it is not
          clipped by the import dialog's own scroll container. */}
      <CertificatePreview
        certificateId={previewing?.id ?? null}
        supplierName={previewing?.supplierName}
        matchedName={previewing?.matchedName}
        onClose={() => setPreviewing(null)}
      />
    </Dialog>
  );
}

export default BulkImportDialog;
