/**
 * "Disagreements between documents" — counted as only the real ones.
 *
 * Rounding (under R1), the same value written two ways, and notes on how
 * readings were joined are kept, each folded under its own line, so the count
 * a person sees is the number of things they actually have to settle.
 */
import { ChevronRight } from "lucide-react";
import { ReviewSection } from "@/components/scorecard/ReviewSection";
import { sortReconciliationFlags, type ReconciliationFlag } from "@/lib/reconciliationNotes";

/** The note without its own lead-in when it already starts with the name shown before it. */
export function noteWithoutName(flag: ReconciliationFlag): string {
  const lead = `${flag.sourceFile}:`;
  return flag.note.startsWith(lead) ? flag.note.slice(lead.length).trimStart() : flag.note;
}

function FlagList({ flags, testId }: { flags: ReconciliationFlag[]; testId?: string }) {
  return (
    <ul className="space-y-1" data-testid={testId}>
      {flags.map((flag, i) => (
        <li key={i} className="text-[11.5px] leading-5 text-[color:var(--body)]">
          <span className="text-[color:var(--hi)]">{flag.sourceFile}:</span> {noteWithoutName(flag)}
        </li>
      ))}
    </ul>
  );
}

function Folded({ title, hint, flags, testId }: { title: string; hint: string; flags: ReconciliationFlag[]; testId: string }) {
  if (flags.length === 0) return null;
  return (
    <details className="group mt-2" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-[12px] font-medium text-[color:var(--hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3 w-3 text-[color:var(--body)] transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
        {title} · {flags.length}
        <span className="font-normal text-[color:var(--body)]">{hint}</span>
      </summary>
      <div className="mt-1.5 pl-4">
        <FlagList flags={flags} />
      </div>
    </details>
  );
}

export function ReconciliationFlagsSection({ flags }: { flags: ReconciliationFlag[] }) {
  if (flags.length === 0) return null;
  const sorted = sortReconciliationFlags(flags);
  const real = sorted.disagreements.length;
  const noise = sorted.rounding.length + sorted.sameValue.length;
  const noiseLine = noise > 0
    ? ` ${noise} other difference${noise === 1 ? " was" : "s were"} only rounding or the same value written differently.`
    : "";
  return (
    <ReviewSection
      title="Disagreements between documents"
      meta={real > 0 ? `${real}` : "none"}
      summary={
        real > 0
          ? `Where two documents state different figures, the lower one is scored until you confirm which is right.${noiseLine}`
          : `Nothing your documents disagree on.${noiseLine}`
      }
      testId="reconciliation-flags"
    >
      {real > 0 && <FlagList flags={sorted.disagreements} testId="reconciliation-disagreements" />}
      <Folded
        title="Differ only by rounding"
        hint="under R1 — the lower figure is used"
        flags={sorted.rounding}
        testId="reconciliation-rounding"
      />
      <Folded
        title="Same value, written differently"
        hint="or blank in one document"
        flags={sorted.sameValue}
        testId="reconciliation-same-value"
      />
      <Folded
        title="How we matched your documents"
        hint="not disagreements"
        flags={sorted.notes}
        testId="reconciliation-notes"
      />
    </ReviewSection>
  );
}

export default ReconciliationFlagsSection;
