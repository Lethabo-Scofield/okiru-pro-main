/**
 * The three button weights the parser flow uses — and the rule they enforce:
 * ONE filled button per screen, the step's main action. Everything else is an
 * outline or a text button.
 *
 * One accent per product: white-on-dark for B-BBEE (its violet stays in focus
 * rings and the selected row), the ESG green for ESG.
 */
export type FlowProduct = "bbbee" | "esg";

export function productOf(testIdPrefix: "" | "esg-"): FlowProduct {
  return testIdPrefix === "esg-" ? "esg" : "bbbee";
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20";

/** The step's one main action. */
export function primaryButton(product: FlowProduct, size: "md" | "lg" = "md"): string {
  const base = `inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
  const sizing = size === "lg" ? "min-h-[44px] px-6 py-3 text-[14px]" : "min-h-[40px] px-5 py-2.5 text-[13.5px]";
  const colour = product === "esg"
    ? "bg-[var(--esg-acc-e,var(--green))] text-black hover:brightness-110"
    : "bg-white text-black hover:bg-white/90";
  return `${base} ${sizing} ${colour}`;
}

/** A secondary action that still looks like a button. */
export function outlineButton(size: "sm" | "md" = "md"): string {
  const sizing = size === "sm" ? "min-h-[32px] px-3 py-1.5 text-[12px]" : "min-h-[40px] px-4 py-2 text-[13px]";
  return `inline-flex items-center justify-center gap-1.5 rounded-full border border-white/[0.14] font-medium text-[color:var(--body)] transition-colors duration-200 hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS} ${sizing}`;
}

/** A quiet text action. */
export function textButton(size: "sm" | "md" = "md"): string {
  const sizing = size === "sm" ? "px-1.5 py-1 text-[12px]" : "px-2 py-1.5 text-[13px]";
  return `inline-flex items-center justify-center gap-1.5 rounded-md font-medium text-[color:var(--body)] underline-offset-2 transition-colors duration-200 hover:text-white hover:underline disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${sizing}`;
}
