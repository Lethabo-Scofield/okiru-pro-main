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

const TONE_STYLES: Record<ReviewTone, { border: string; background: string; title: string }> = {
  // Needs a human decision before the score means anything.
  decide: { border: "rgba(255,214,10,0.22)", background: "rgba(255,214,10,0.05)", title: "#fde68a" },
  // Worth a look, but nothing is blocked on it.
  check: { border: "rgba(255,214,10,0.16)", background: "rgba(255,214,10,0.03)", title: "#e5e5ea" },
  // Confirmation — evidence that agreed with itself.
  good: { border: "rgba(48,209,88,0.20)", background: "rgba(48,209,88,0.04)", title: "#a7f3c0" },
  // Plain detail.
  neutral: { border: "rgba(255,255,255,0.07)", background: "#0e0e10", title: "#e5e5ea" },
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
      className="dus-fade-up overflow-hidden rounded-xl text-left"
      style={{ background: style.background, border: `1px solid ${style.border}` }}
      data-testid={testId}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-[#636366] transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        {icon}
        <span className="text-[12.5px] font-medium" style={{ color: style.title }}>
          {title}
        </span>
        {meta && <span className="ml-auto shrink-0 text-[11.5px] text-[#8e8e93]">{meta}</span>}
      </button>
      {summary && !open && (
        <p className="px-3.5 pb-2.5 pl-9 text-[11.5px] leading-5 text-[#8e8e93]">{summary}</p>
      )}
      {open && (
        <div className="px-3.5 pb-3 pl-9">
          {summary && <p className="mb-2 text-[11.5px] leading-5 text-[#8e8e93]">{summary}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

export default ReviewSection;
