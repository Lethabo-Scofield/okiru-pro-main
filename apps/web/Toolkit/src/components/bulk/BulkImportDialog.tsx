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
import { readSectionSheet, type SectionSheetRead } from "@/lib/workbookExcelNormalizer";
import { downloadSectionTemplate } from "@/lib/informationRequestTemplate";
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

  const reset = useCallback(() => {
    setStep("choose");
    setFileName("");
    setBuffer(null);
    setSheetName(undefined);
    setMode("append");
    setReading(false);
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
  const outcome = useMemo<Outcome<T> | null>(() => {
    if (!buffer) return null;
    const read = readSectionSheet(buffer, spec.columns, {
      sectionKey: spec.sectionKey,
      sheetHints: spec.sheetHints,
      sheetName,
    });

    const added: T[] = [];
    const updated: T[] = [];
    let skipped = 0;

    for (const row of read.rows as ParsedRow[]) {
      const missing = spec.requiredKeys.some((k) => String(row[k] ?? "").trim() === "");
      if (missing) {
        skipped += 1;
        continue;
      }
      const entity = spec.toEntity(row);
      if (existingIds.has(spec.identity(entity))) updated.push(entity);
      else added.push(entity);
    }

    return { added, updated, skipped, read };
  }, [buffer, sheetName, spec, existingIds]);

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
    </Dialog>
  );
}

export default BulkImportDialog;
