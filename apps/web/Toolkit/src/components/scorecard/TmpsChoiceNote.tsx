/**
 * Which TMPS Preferential Procurement is scored against, said in one place.
 *
 * Decided 11 Oct 2026: the supplier schedule's sum, by default. A TMPS the
 * documents state is shown beside it as a flagged difference, and is used
 * only when the user switches this client to it — an explicit choice, saved
 * on the client. Shown on the Procurement page and on the score page.
 */
import type { ProcurementData } from "@toolkit/lib/types";
import type { TmpsChoice } from "@toolkit/lib/calculators/shared";
import { resolveProcurementTmps } from "@toolkit/lib/store";
import { formatRand } from "@toolkit/lib/utils";
import { cn } from "@toolkit/lib/utils";

export interface TmpsChoiceNoteProps {
  procurement: ProcurementData;
  /** Omit to show the note without the switch (read-only places). */
  onChoose?: (choice: TmpsChoice) => void;
  /** Show nothing when there is no stated figure to compare with. */
  onlyWhenFlagged?: boolean;
  className?: string;
}

export function TmpsChoiceNote({ procurement, onChoose, onlyWhenFlagged = false, className }: TmpsChoiceNoteProps) {
  if (procurement.tmpsManualOverride) return null;
  const r = resolveProcurementTmps(procurement);
  const flagged = (r.stated !== null && r.differs) || r.held !== null;
  if (onlyWhenFlagged && !flagged) return null;

  let text: string;
  let action: { label: string; choice: TmpsChoice } | null = null;
  if (r.source === "stated" && r.stated !== null) {
    text = `Using the TMPS your documents state, ${formatRand(r.stated)}, because you chose it. The supplier schedule sums to ${formatRand(r.supplierSum)}.`;
    action = { label: "Use the supplier sum instead", choice: "supplier_sum" };
  } else if (r.stated !== null && r.differs) {
    text = `Your documents state a TMPS of ${formatRand(r.stated)}; the supplier schedule sums to ${formatRand(r.supplierSum)}. Preferential Procurement is scored against the supplier sum.`;
    if (r.canUseStated) action = { label: `Use the stated ${formatRand(r.stated)} instead`, choice: "stated" };
    else text += " The stated figure is smaller than the suppliers listed, so it cannot be the TMPS.";
  } else if (r.stated !== null) {
    text = "Sum of supplier spend. It matches the TMPS your documents state.";
  } else if (r.held !== null) {
    text = "Your documents state a TMPS that could not be read (two figures disagree, or the cell holds an error). Preferential Procurement is scored against the supplier sum.";
  } else {
    text = "Sum of supplier spend. No document states a TMPS.";
  }

  return (
    <div
      className={cn("text-[11px]", flagged && r.source !== "stated" ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground", className)}
      data-testid="text-tmps-source"
      data-tmps-flagged={flagged ? "true" : "false"}
    >
      <p>{text}</p>
      {action && onChoose && (
        <button
          type="button"
          onClick={() => onChoose(action!.choice)}
          className="mt-1 rounded-md border border-current px-2 py-0.5 text-[11px] font-medium hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={action.choice === "stated" ? "button-tmps-use-stated" : "button-tmps-use-supplier-sum"}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
