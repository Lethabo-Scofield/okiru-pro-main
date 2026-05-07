import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type AppNavBackBase = {
  /** Main line, e.g. "Hub" or "All certificates" */
  label: string;
  /** Optional small caps context, e.g. "Suite" or "Registry" */
  eyebrow?: string;
  variant?: "dark" | "light" | "zinc";
  /** Larger chip (headers); compact for in-page secondary nav */
  size?: "default" | "compact";
  className?: string;
  "data-testid"?: string;
};

export type AppNavBackProps = AppNavBackBase &
  ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

const variantStyles = {
  dark: {
    shell:
      "border-white/[0.10] bg-white/[0.045] shadow-sm shadow-black/25 hover:bg-white/[0.08] hover:border-white/[0.14] focus-visible:ring-white/25",
    iconWrap: "border-white/[0.10] bg-white/[0.06] text-[#a8a8ad] group-hover:text-white group-hover:border-white/[0.14]",
    eyebrow: "text-[#636366] group-hover:text-[#8e8e93]",
    label: "text-[#ececec] group-hover:text-white",
  },
  light: {
    shell:
      "border-border/60 bg-muted/40 shadow-sm shadow-black/[0.04] hover:bg-muted/55 hover:border-border focus-visible:ring-ring",
    iconWrap:
      "border-border/60 bg-background/80 text-muted-foreground group-hover:text-foreground group-hover:border-border",
    eyebrow: "text-muted-foreground/80 group-hover:text-muted-foreground",
    label: "text-foreground/90 group-hover:text-foreground",
  },
  zinc: {
    shell:
      "border-white/10 bg-white/[0.04] shadow-sm shadow-black/30 hover:bg-white/[0.07] hover:border-white/[0.16] focus-visible:ring-white/25",
    iconWrap: "border-white/10 bg-white/[0.06] text-zinc-400 group-hover:text-white group-hover:border-white/15",
    eyebrow: "text-zinc-500 group-hover:text-zinc-400",
    label: "text-zinc-200 group-hover:text-white",
  },
} as const;

const innerShellClass = (
  v: (typeof variantStyles)[keyof typeof variantStyles],
  compact: boolean,
  className: string | undefined,
) =>
  cn(
    "group inline-flex max-w-full items-center gap-2 rounded-xl border transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
    compact ? "py-0.5 pl-0.5 pr-2.5" : "py-1 pl-1 pr-3",
    v.shell,
    className,
  );

export function AppNavBack(props: AppNavBackProps) {
  const {
    label,
    eyebrow,
    variant = "dark",
    size = "default",
    className,
    "data-testid": testId,
  } = props;
  const v = variantStyles[variant];
  const compact = size === "compact";

  const inner = (
    <>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border transition-colors duration-200",
          compact ? "h-7 w-7" : "h-8 w-8",
          v.iconWrap,
        )}
        aria-hidden
      >
        <ChevronLeft className={cn("-ml-px", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      </span>
      <span className={cn("min-w-0 text-left leading-tight", eyebrow && !compact ? "py-0.5" : "")}>
        {eyebrow && (
          <span
            className={cn(
              "block truncate font-semibold uppercase tracking-[0.14em]",
              compact ? "text-[9px]" : "text-[10px]",
              v.eyebrow,
            )}
          >
            {eyebrow}
          </span>
        )}
        <span
          className={cn(
            "block truncate font-semibold",
            compact ? "text-[12px]" : "text-[13px]",
            v.label,
          )}
        >
          {label}
        </span>
      </span>
    </>
  );

  if ("onClick" in props) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        className={innerShellClass(v, compact, className)}
        data-testid={testId}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link href={props.href} className={innerShellClass(v, compact, className)} data-testid={testId}>
      {inner}
    </Link>
  );
}
