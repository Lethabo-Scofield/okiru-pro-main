import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@toolkit/components/ui/button";
import { useBbeeStore } from "@toolkit/lib/store";
import { BulkImportDialog } from "./BulkImportDialog";
import type { BulkImportSpec } from "./bulkImportSpecs";

/**
 * The toolkit stores an FSC sub-sector as a short code; the workbook's section
 * definitions name them in full. The template is built from the latter.
 */
function fscSubSectorLabel(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (code === "LTI") return "Long-Term Insurers";
  if (code === "STI") return "Short-Term Insurers";
  return code;
}

/**
 * The button every pillar puts next to "Add".
 *
 * It exists so a pillar's own file carries the import in a handful of lines —
 * its records and how to store them — and nothing about reading spreadsheets.
 * Two pillars had a bulk upload before this, written twice, and neither
 * worked; the other five had none at all.
 *
 * The sector comes from the client so the blank sheet offered inside the dialog
 * is the one that pillar actually asks for under those codes.
 */
export function PillarBulkImport<T>({
  spec,
  existing,
  onImport,
  label = "Bulk upload",
  className,
}: {
  spec: BulkImportSpec<T>;
  existing: T[];
  onImport: (entities: T[], mode: "append" | "replace") => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const client = useBbeeStore((s) => s.client);

  return (
    <>
      <Button
        variant="outline"
        className={className ?? "gap-2"}
        onClick={() => setOpen(true)}
        data-testid={`button-bulk-${spec.sectionKey}`}
        title={`Upload a spreadsheet of ${spec.noun}. You will see what changes before it is saved.`}
      >
        <Upload className="h-4 w-4" />
        {label}
      </Button>

      <BulkImportDialog
        open={open}
        onOpenChange={setOpen}
        spec={spec}
        existing={existing}
        onImport={onImport}
        sectorCode={client?.sectorCode ?? undefined}
        fscSubSector={fscSubSectorLabel(client?.fscSubSector)}
      />
    </>
  );
}

export default PillarBulkImport;
