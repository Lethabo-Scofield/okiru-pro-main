/** Shared B-BBEE-aligned panel classes for ESG editors. */
export const ESG_PANEL =
  "rounded-2xl border border-white/[0.06] bg-[var(--esg-section-bg,#141416)] overflow-hidden";
export const ESG_PANEL_HEADER =
  "px-6 py-4 border-b border-white/[0.06] bg-[var(--esg-section-bg,#141416)]";
export const ESG_INPUT =
  "w-full bg-[var(--esg-input-bg,#0e0e10)] border border-[var(--esg-input-border,#2c2c2e)] rounded-lg px-3 py-2 text-[13px] text-[var(--esg-text)]";
/** Dropdowns in scalar forms and maturity grids — explicit contrast for native <select>. */
export const ESG_SELECT = `${ESG_INPUT} cursor-pointer`;
/** Inline editors inside spreadsheet-style tables. */
export const ESG_TABLE_INPUT =
  "esg-table-input w-full bg-[var(--esg-input-bg,#0e0e10)] rounded px-1.5 py-1 text-[12px] text-[var(--esg-text)] outline-none focus:ring-1 focus:ring-[var(--esg-glass-border-hover,#3a3a3c)]";
export const ESG_TABLE_HEAD = "bg-[#1c1c1e] text-[11px] font-semibold uppercase tracking-wider text-[#8e8e93]";
export const ESG_TABLE_CELL =
  "border border-[#2c2c2e] px-2 py-1.5 text-[12px] hover:bg-white/[0.03]";
export const ESG_SAVE_BTN =
  "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white border border-[#2c2c2e] font-semibold text-[13px] disabled:opacity-50";
