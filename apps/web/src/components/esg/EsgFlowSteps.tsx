/**
 * The 1-2-3 across the top of the ESG create flow.
 *
 * The flow has always had three acts — choose a way in, provide what you have,
 * check it before it becomes a workbook — but nothing on screen said so, so the
 * first screen read as "the whole thing" and landing in a workbook read as a
 * dead end. Naming the steps costs one line of chrome and tells the user how
 * much is left.
 *
 * Presentational only: no router, no state, no data. It reports where the host
 * says it is and nothing else.
 */
import { Check } from "lucide-react";

export const ESG_CREATE_STEPS = ["Choose", "Provide", "Review"] as const;

export interface EsgFlowStepsProps {
  /** 1-based, matching the labels. */
  current: number;
  labels?: readonly string[];
  className?: string;
}

export function EsgFlowSteps({
  current,
  labels = ESG_CREATE_STEPS,
  className = "",
}: EsgFlowStepsProps) {
  return (
    <div
      className={`mx-auto flex w-full max-w-2xl items-center gap-2 ${className}`}
      data-testid="esg-flow-steps"
      aria-label={`Step ${current} of ${labels.length}`}
    >
      {labels.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        const last = step === labels.length;
        return (
          /* Only a step that HAS a connector may grow. Every step used to be
             flex-1, which gave the last one an equal share of the width with
             nothing to fill it — so the row stopped a third short of its right
             edge and read as left-weighted rather than evenly spaced. */
          <div
            key={label}
            className={`flex min-w-0 items-center gap-2 ${last ? "shrink-0" : "flex-1"}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                done
                  ? "bg-[var(--esg-acc-e,#1de9a0)] text-[#080e14]"
                  : active
                    ? "bg-white text-[#0e0e10]"
                    : "border border-white/[0.14] text-[var(--esg-text3,#636366)]"
              }`}
              data-testid={`esg-flow-step-${step}`}
              aria-current={active ? "step" : undefined}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : step}
            </span>
            <span
              className={`min-w-0 truncate text-[12px] font-medium ${
                active
                  ? "text-[var(--esg-text,#fff)]"
                  : "text-[var(--esg-text3,#636366)]"
              }`}
            >
              {label}
            </span>
            {!last ? (
              <span
                aria-hidden="true"
                className={`ml-1 hidden h-px flex-1 sm:block ${
                  done ? "bg-[var(--esg-acc-e,#1de9a0)]/50" : "bg-white/[0.10]"
                }`}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default EsgFlowSteps;
