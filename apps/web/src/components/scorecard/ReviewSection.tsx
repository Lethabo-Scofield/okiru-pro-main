/**
 * One collapsible finding group in the extraction reveal.
 *
 * WHY THIS EXISTS
 *
 * The reveal used to be a column of sibling panels — conflicts, corroboration,
 * what-we-read, reconciliation flags, certificate autofill, per-pillar notes —
 * each always rendered at full height. Eight of them stacked pushed the Build
 * button below the fold on any real evidence pack, which the code itself had
 * already noticed and worked around by collapsing one of the panels.
 *
 * Collapsing one panel treats the symptom. The shape that works is the one
 * `ReconciliationReview` already uses elsewhere in this flow: every finding
 * group gets a headline and a count, the group opens on demand, and the ones
 * that need a decision are open from the start while the merely informational
 * ones stay shut.
 *
 * Tone is never carried by colour alone — each tone pairs with an icon supplied
 * by the caller and a counted headline that says what the group is.
 */
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export type ReviewTone = "decide" | "check" | "good" | "neutral";

/** Token and palette classes only; the tone is also carried by an icon and a counted title. */
const TONE_STYLES: Record<ReviewTone, { box: string; title: string }> = {
  // Needs a human decision before the score means anything.
  decide: { box: "border-amber-300/25 bg-amber-400/[0.05]", title: "text-amber-200" },
  // Worth a look, but nothing is blocked on it.
  check: { box: "border-amber-300/15 bg-amber-400/[0.03]", title: "text-[color:var(--hi)]" },
  // Confirmation — evidence that agreed with itself.
  good: { box: "border-emerald-400/20 bg-emerald-400/[0.04]", title: "text-emerald-200" },
  // Plain detail.
  neutral: { box: "border-white/[0.07] bg-[color:var(--ink-2)]", title: "text-[color:var(--hi)]" },
};

interface Props {
  title: string;
  /** Shown right-aligned in the header — usually a count of findings. */
  meta?: string;
  tone?: ReviewTone;
  /** Open on first render. Use for anything the user must decide. */
  defaultOpen?: boolean;
  icon?: ReactNode;
  /** One line under the title, always visible. The "why this matters". */
  summary?: string;
  children: ReactNode;
  testId?: string;
}

export function ReviewSection({
  title,
  meta,
  tone = "neutral",
  defaultOpen = false,
  icon,
  summary,
  children,
  testId,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const style = TONE_STYLES[tone];

  return (
    <div
      className={`overflow-hidden rounded-xl border text-left ${style.box}`}
      data-testid={testId}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-[color:var(--muted)] transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        {icon}
        <span className={`text-[12.5px] font-medium ${style.title}`}>
          {title}
        </span>
        {meta && <span className="ml-auto shrink-0 text-[11.5px] text-[color:var(--body)]">{meta}</span>}
      </button>
      {summary && !open && (
        <p className="px-3.5 pb-2.5 pl-9 text-[11.5px] leading-5 text-[color:var(--body)]">{summary}</p>
      )}
      {open && (
        <div className="px-3.5 pb-3 pl-9">
          {summary && <p className="mb-2 text-[11.5px] leading-5 text-[color:var(--body)]">{summary}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

export default ReviewSection;
