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
  /** Right-aligned, muted — usually a count. */
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Classes for the summary row. */
  summaryClassName?: string;
  testId?: string;
  summaryTestId?: string;
  onToggle?: (open: boolean) => void;
}

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
}: DisclosureProps) {
  return (
    <details
      className={`group ${className}`}
      open={defaultOpen || undefined}
      data-testid={testId}
      onToggle={onToggle ? (event) => onToggle((event.currentTarget as HTMLDetailsElement).open) : undefined}
    >
      <summary
        className={`flex cursor-pointer list-none items-center gap-1.5 rounded-md text-[12.5px] font-medium text-[color:var(--body)] transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 [&::-webkit-details-marker]:hidden ${summaryClassName}`}
        data-testid={summaryTestId}
      >
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted)] transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        <span className="min-w-0 flex-1">{summary}</span>
        {meta != null && meta !== "" && (
          <span className="ml-auto shrink-0 text-[11.5px] font-normal tabular-nums text-[color:var(--muted)]">{meta}</span>
        )}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export default Disclosure;
