/**
 * "More" — the workbook's occasional actions, one click away.
 *
 * The header carried six actions beside the save status and the filled
 * "Continue to Summary": Add documents, Save, Download template, Import / bulk
 * upload and Export workbook. Three of those are things a person does once a
 * reporting cycle, so they sit here; the ones used every visit stay in view.
 *
 * A disclosure, not an ARIA menu (the same choice `EsgTemplateMenu` makes):
 * a button that shows ordinary buttons and links, which keyboards and screen
 * readers already know how to use. The page renders the items, so every
 * action keeps its test id and its handler where it always was.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

/** One item in the list: quiet, full width, keyboard-visible. */
export const ESG_MORE_ITEM =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-[var(--esg-text2,rgba(255,255,255,0.56))] hover:bg-white/[0.06] hover:text-[var(--esg-text,#fff)] focus:bg-white/[0.06] focus:outline-none disabled:opacity-50";

export function EsgWorkbookMoreMenu({
  className,
  children,
}: {
  /** The trigger's look — the toolbar's outline button. */
  className?: string;
  children: ReactNode;
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

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={className}
        data-testid="button-esg-more"
      >
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden /> More
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {/* Kept in the DOM while closed (hidden), so every action stays reachable by its id. */}
      <div
        id={listId}
        hidden={!open}
        // A click on an item (not on the template menu's own toggle) closes the list.
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("a[href], button[data-closes-menu]")) setOpen(false);
        }}
        className="absolute right-0 z-50 mt-1.5 w-[260px] rounded-xl border border-[var(--esg-glass-border,rgba(255,255,255,0.07))] bg-[var(--esg-bg2,#101114)] p-1.5 shadow-2xl"
        data-testid="esg-more-menu"
      >
        {children}
      </div>
    </div>
  );
}
