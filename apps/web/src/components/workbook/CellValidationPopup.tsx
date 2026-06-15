import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Sparkles, X } from "lucide-react";

export interface CellValidationPopupProps {
  /** The raw value the user typed. */
  rawValue: string;
  /** Deterministic/AI suggested normalized value (null = no confident suggestion). */
  suggestion: string | null;
  /** Plain-English rule explanation, e.g. "Enter EME, QSE, or Large". */
  validationMessage?: string;
  /** Short contextual hint shown below the suggestion. */
  suggestionHint?: string;
  /** Additional B-BBEE context shown in the "Learn more" section. */
  learnMore?: string;
  /** True when the suggestion came from the AI endpoint rather than deterministic logic. */
  isAiSuggestion?: boolean;
  /** True while an AI suggestion is being fetched. */
  loading?: boolean;
  /** Pixel coordinates to anchor the popup (bottom-left of the cell). */
  anchorRect: DOMRect;
  /** Called when the user accepts the suggestion. */
  onAccept: (value: string) => void;
  /** Called when the user dismisses the popup and keeps their typed value. */
  onDismiss: () => void;
}

/**
 * Non-blocking inline popup shown below a cell when validation fails or
 * normalization can suggest a better value. Never prevents the user from
 * continuing — "Keep what I typed" always dismisses without changing data.
 *
 * Keyboard: Escape to dismiss, Enter to accept the suggestion.
 */
export function CellValidationPopup({
  rawValue,
  suggestion,
  validationMessage,
  suggestionHint,
  learnMore,
  isAiSuggestion = false,
  loading = false,
  anchorRect,
  onAccept,
  onDismiss,
}: CellValidationPopupProps) {
  const [expanded, setExpanded] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Keyboard accessibility.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss();
      }
      if (e.key === "Enter" && suggestion) {
        e.stopPropagation();
        onAccept(suggestion);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [suggestion, onAccept, onDismiss]);

  // Position: appear below the cell, shift left if it would overflow the viewport.
  const style: React.CSSProperties = (() => {
    const W = typeof window !== "undefined" ? window.innerWidth : 1200;
    const popupWidth = 320;
    let left = anchorRect.left;
    if (left + popupWidth > W - 16) left = Math.max(8, W - popupWidth - 16);
    return {
      position: "fixed",
      top: anchorRect.bottom + 4,
      left,
      width: popupWidth,
      zIndex: 300,
    };
  })();

  const popup = (
    <div
      ref={popupRef}
      style={style}
      role="dialog"
      aria-label="Validation suggestion"
      aria-modal="false"
      data-testid="cell-validation-popup"
      className="rounded-xl border border-[#3a3a3c] bg-[#1c1c1e] shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[12px] font-semibold text-amber-300 truncate">
            Unexpected value
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-0.5 rounded hover:bg-white/[0.08] text-[#636366] hover:text-white smooth shrink-0"
          aria-label="Dismiss"
          data-testid="cell-validation-dismiss-x"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Validation rule */}
      {validationMessage && (
        <div className="px-3 pb-2 text-[12px] text-[#8e8e93]">{validationMessage}</div>
      )}

      {/* Suggestion block */}
      <div className="mx-3 mb-3 rounded-lg border border-[#2c2c2e] bg-[#0e0e10] px-3 py-2.5 space-y-1.5">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-[#8e8e93]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Getting AI suggestion…
          </div>
        ) : suggestion ? (
          <>
            <div className="flex items-center gap-1.5">
              {isAiSuggestion && (
                <Sparkles className="h-3 w-3 text-blue-400 shrink-0" />
              )}
              <span className="text-[11px] text-[#636366]">Suggested:</span>
              <span className="text-[13px] font-semibold text-white">{suggestion}</span>
            </div>
            {suggestionHint && (
              <div className="text-[11px] text-[#48484a] leading-snug">{suggestionHint}</div>
            )}
          </>
        ) : (
          <div className="text-[12px] text-[#636366]">
            No automatic suggestion available — type the correct value manually.
          </div>
        )}

        {/* Typed value reminder */}
        {rawValue && (
          <div className="text-[11px] text-[#48484a]">
            You typed: <span className="text-[#636366]">"{rawValue}"</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-3 pb-3">
        {suggestion && !loading && (
          <button
            type="button"
            onClick={() => onAccept(suggestion)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6b21a8] hover:bg-[#7c3aed] text-white text-[12px] font-semibold smooth press-sm"
            data-testid="cell-validation-use-suggestion"
          >
            Use "{suggestion}"
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className={`${suggestion && !loading ? "" : "flex-1"} inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-[#2c2c2e] hover:bg-white/[0.06] text-[#d1d1d6] text-[12px] smooth press-sm`}
          data-testid="cell-validation-keep"
        >
          Keep what I typed
        </button>
      </div>

      {/* "Learn more" expandable section */}
      {learnMore && (
        <div className="border-t border-[#2c2c2e]">
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-[#636366] hover:text-[#8e8e93] hover:bg-white/[0.03] smooth"
            aria-expanded={expanded}
            data-testid="cell-validation-learn-more"
          >
            <span>Learn more about this field</span>
            {expanded ? (
              <ChevronUp className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" />
            )}
          </button>
          {expanded && (
            <div className="px-3 pb-3 text-[11px] text-[#8e8e93] leading-relaxed">
              {learnMore}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(popup, document.body);
}

/** Field-specific "Learn more" context for B-BBEE fields. */
export const FIELD_LEARN_MORE: Record<string, string> = {
  currentSize:
    "Under the B-BBEE Codes, entity size determines which scorecard applies. EME (Exempted Micro Enterprise) has ≤R10m annual turnover and qualifies for automatic Level 4 (or Level 1/2 for majority Black-owned). QSE (Qualifying Small Enterprise) has R10m–R50m and uses a simplified 4-pillar scorecard. Large (Generic) has >R50m and uses the full Generic scorecard.",
  bbbeeLevel:
    "B-BBEE contributor levels run from 1 (best, ≥100 points) to 8 (worst, ≥10 points). Non-Compliant means below 10 points. Levels 1–4 qualify as Empowering Suppliers under the Codes.",
  votingRights:
    "Voting rights percentage represents the proportion of exercisable voting rights in the entity held by this shareholder. Must sum to 100% across all shareholders.",
  economicInterest:
    "Economic interest percentage represents the right to receive dividends, distributions or profits. In straightforward structures this equals shareholding, but can differ for preference shares or profit-sharing arrangements.",
  shareholding:
    "Shareholding percentage is the direct equity stake. For Ownership scoring, Black shareholding is tracked separately for Modified Flow-Through and Exclusion calculations.",
  percentBenefitingBlack:
    "The proportion of beneficiaries of this SED contribution who are Black (as defined by the Codes). Used to calculate the portion of spend that counts toward the SED target.",
  spend:
    "Procurement spend is the total rand value of goods and services purchased from this supplier during the measurement period, excluding VAT. Accurately capture all invoiced amounts including delivery charges.",
  amount:
    "The rand value of this ESD or SED contribution. For non-monetary contributions, use the fair market value or cost to the measured entity, whichever is lower.",
};
