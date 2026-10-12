/**
 * How wide each B-BBEE create step is.
 *
 * The calm steps (choose a way in, add documents) sit in a narrow card. The
 * two working surfaces — "Check each document" and the workbook's register
 * grids — take the screen. Capping them is what made a 1920px screen show a
 * centred column with the preview squeezed between the list and the values,
 * and a register grid showing half its columns beside 260px of empty margin.
 *
 * The review asks for the room itself: DocumentReview carries
 * `data-wide-review`, and the step's shell and card drop their cap, gutters and
 * frame while it is on screen (`has-[[data-wide-review]]`). The page's own
 * gutters stay, so phones keep 16px and nothing scrolls sideways.
 *
 * Every class name is written out whole: Tailwind finds them by scanning this
 * file, so a name must never be built from fragments.
 */

/** The create step's outer column: narrow for the calm steps, uncapped for the review. */
export const SETUP_SHELL_CLASS =
  "mx-auto max-w-[980px] px-4 py-8 sm:py-12 has-[[data-wide-review]]:max-w-none has-[[data-wide-review]]:px-0 has-[[data-wide-review]]:py-4";

/**
 * The step's card. While the review is on screen it stops being a card — no
 * border, fill, shadow or inset — so the review's own frame is the surface and
 * its three panes get the width the card's padding used to take.
 */
export const SETUP_CARD_CLASS =
  "rounded-[28px] border border-white/[0.08] bg-[color:var(--ink-3)] px-5 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.30)] sm:px-8 sm:py-8 " +
  "has-[[data-wide-review]]:border-transparent has-[[data-wide-review]]:bg-transparent has-[[data-wide-review]]:shadow-none has-[[data-wide-review]]:px-0 has-[[data-wide-review]]:py-0";

/**
 * The workbook's two columns: section list beside the open section on a wide
 * screen, stacked on a phone. Stacked, the open section must STRETCH to the
 * column — `items-start` there sized it to its widest register (about 2,000px)
 * and pushed the whole page sideways instead of scrolling the grid inside it.
 */
export const WORKBOOK_COLUMNS_CLASS = "flex flex-col lg:flex-row gap-6 lg:items-start";

/** Save, Download, Add documents, Import, Continue: wraps on a phone rather than widening the page. */
export const WORKBOOK_TOOLBAR_CLASS = "flex flex-wrap items-center gap-2";

export type InformationRequestView = "start" | "workbook" | "score" | "picker";

/** Which view the page is showing, from the same facts the page branches on. */
export function informationRequestView(facts: {
  isCreateScorecardFlow: boolean;
  picked: boolean;
  isSummaryStep: boolean;
  isEstimateStep: boolean;
}): InformationRequestView {
  if (!facts.picked) return facts.isCreateScorecardFlow ? "start" : "picker";
  return facts.isSummaryStep || facts.isEstimateStep ? "score" : "workbook";
}

/**
 * The page's `<main>` for each view. The start step has no cap of its own (its
 * shell sets the width); the workbook is a spreadsheet and takes the screen;
 * the score pages and the legacy picker read best at 1400px.
 */
export function informationRequestMainClass(view: InformationRequestView): string {
  switch (view) {
    case "start":
      return "mx-auto px-4 sm:px-6 py-8";
    case "workbook":
      return "mx-auto px-4 sm:px-6 py-10";
    default:
      return "max-w-[1400px] mx-auto px-4 sm:px-6 py-10 has-[[data-wide-review]]:max-w-none";
  }
}
