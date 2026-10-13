import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { API_BASE } from "@toolkit/lib/config";
import {
  ESG_TEMPLATE_GROUPS,
  esgTemplateHref,
  type EsgTemplateGroupId,
} from "@/lib/esg/esgTemplateParts";

/**
 * "Download template" as a menu (C3): the whole workbook, one pillar, or one
 * sheet — so the fleet manager is sent the fleet register, not fifteen sheets
 * of which one is theirs. Every part imports back on its own.
 *
 * A disclosure, not an ARIA menu: a button that shows a list of download
 * links, each an ordinary link the browser and screen readers already know.
 */
const ACCENT: Record<EsgTemplateGroupId, string> = {
  setup: "var(--esg-text2,rgba(255,255,255,0.56))",
  environmental: "var(--esg-acc-e,#22c55e)",
  social: "var(--esg-acc-s,#f5a623)",
  governance: "var(--esg-acc-g,#9333ea)",
};

export function EsgTemplateMenu({
  className,
  label = "Download template",
  align = "right",
  testId = "esg-template-menu",
}: {
  /** The trigger's look — each page keeps its own button style. */
  className?: string;
  label?: string;
  /** Which edge of the button the list lines up with. */
  align?: "left" | "right";
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const link = (partId: string | undefined, text: string, extra: string, hint?: string) => (
    <a
      href={esgTemplateHref(API_BASE, partId)}
      onClick={() => setOpen(false)}
      title={hint}
      className={`block rounded-md px-2.5 py-1.5 text-[12px] hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none ${extra}`}
      data-testid={`esg-template-${partId ?? "all"}`}
    >
      {text}
    </a>
  );

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={className}
        data-testid={testId}
      >
        <Download className="h-3.5 w-3.5" /> {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          id={listId}
          className={`absolute z-50 mt-1.5 w-[280px] max-h-[70vh] overflow-y-auto rounded-xl border border-[var(--esg-glass-border,rgba(255,255,255,0.07))] bg-[var(--esg-bg2,#101114)] p-1.5 shadow-2xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
          data-testid={`${testId}-list`}
        >
          {link(undefined, "The whole workbook", "font-semibold text-[var(--esg-text,rgba(255,255,255,0.92))]", "Every sheet")}
          {ESG_TEMPLATE_GROUPS.map((group) => (
            <div key={group.id} role="group" aria-label={group.title} className="mt-1.5 border-t border-white/[0.06] pt-1.5">
              <a
                href={esgTemplateHref(API_BASE, group.id)}
                onClick={() => setOpen(false)}
                className="flex items-baseline justify-between gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-semibold hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none"
                style={{ color: ACCENT[group.id] }}
                data-testid={`esg-template-${group.id}`}
              >
                {group.title}
                <span className="text-[10.5px] font-normal text-[var(--esg-text3,rgba(255,255,255,0.32))]">
                  all {group.sheets.length} sheets
                </span>
              </a>
              {group.sheets.map((sheet) => (
                <div key={sheet.id} className="pl-3">
                  {link(sheet.id, sheet.title, "text-[var(--esg-text2,rgba(255,255,255,0.56))] hover:text-[var(--esg-text,rgba(255,255,255,0.92))]", sheet.collects)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
