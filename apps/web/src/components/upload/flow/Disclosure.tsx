/**
 * A quiet "details" disclosure: a native <details>, closed by default.
 *
 * Native on purpose. The browser gives it keyboard support and the expanded
 * state for screen readers, and its content stays in the DOM while closed —
 * so everything that moved behind one is still there for a test, a search
 * (Ctrl+F opens it) or a screen reader, it is just not on screen until asked.
 *
 * Never styled as a warning: what sits behind a disclosure is, by definition,
 * not something the user must act on now.
 */
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export interface DisclosureProps {
  summary: ReactNode;
  /** Right-aligned, quieter than the summary — usually a count. */
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Classes for the summary row. */
  summaryClassName?: string;
  testId?: string;
  summaryTestId?: string;
  onToggle?: (open: boolean) => void;
  /**
   * "app" (default) sits inside the dark signed-in app and uses its glass
   * tokens. "dialog" is for a disclosure rendered in a portal (an
   * AlertDialog), which sits outside `.okiru-app` on the theme's own
   * background: it takes the theme's foreground, muted and ring colours, so the
   * summary never turns white on a light dialog and keyboard focus stays
   * visible.
   */
  tone?: "app" | "dialog";
}

const TONES = {
  app: {
    summary:
      "text-[color:var(--body)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
    muted: "text-[color:var(--muted)]",
    /** A count or a short note a person reads to decide: --body, not --muted (about 2.8:1 on the panels). */
    meta: "text-[color:var(--body)]",
  },
  dialog: {
    summary:
      "text-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    muted: "text-muted-foreground",
    meta: "text-muted-foreground",
  },
} as const;

export function Disclosure({
  summary,
  meta,
  children,
  defaultOpen = false,
  className = "",
  summaryClassName = "",
  testId,
  summaryTestId,
  onToggle,
  tone = "app",
}: DisclosureProps) {
  const colours = TONES[tone];
  return (
    <details
      className={`group ${className}`}
      open={defaultOpen || undefined}
      data-testid={testId}
      onToggle={onToggle ? (event) => onToggle((event.currentTarget as HTMLDetailsElement).open) : undefined}
    >
      <summary
        className={`flex cursor-pointer list-none items-center gap-1.5 rounded-md text-[12.5px] font-medium ${colours.summary} transition-colors duration-200 [&::-webkit-details-marker]:hidden ${summaryClassName}`}
        data-testid={summaryTestId}
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 ${colours.muted} transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">{summary}</span>
        {meta != null && meta !== "" && (
          <span className={`ml-auto shrink-0 text-[11.5px] font-normal tabular-nums ${colours.meta}`}>{meta}</span>
        )}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export default Disclosure;
