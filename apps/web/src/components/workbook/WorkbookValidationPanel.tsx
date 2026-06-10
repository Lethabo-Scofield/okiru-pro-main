import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  aggregateWorkbookValidation,
  formatValidationIssueLine,
  isCriticalWorkbookIssue,
  type WorkbookSectionsInput,
} from "./workbookValidation";

interface Props {
  sections: WorkbookSectionsInput;
  activeSectionKey?: string;
  onSelectSection?: (sectionKey: string) => void;
}

export function WorkbookValidationPanel({
  sections,
  activeSectionKey,
  onSelectSection,
}: Props) {
  const aggregate = useMemo(() => aggregateWorkbookValidation(sections), [sections]);
  const [expanded, setExpanded] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");

  const filterNorm = filter.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!filterNorm) return aggregate.sections;
    return aggregate.sections
      .map((section) => ({
        ...section,
        issues: section.issues.filter((issue) =>
          formatValidationIssueLine(issue).toLowerCase().includes(filterNorm),
        ),
      }))
      .filter((s) => s.issues.length > 0);
  }, [aggregate.sections, filterNorm]);

  if (aggregate.totalIssues === 0) {
    return (
      <div
        className="rounded-xl border border-white/[0.06] bg-[#141416] px-3 py-2.5 text-[12px] text-status-success"
        data-testid="workbook-validation-panel-empty"
      >
        All sections pass validation checks.
      </div>
    );
  }

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] overflow-hidden"
      data-testid="workbook-validation-panel"
    >
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03] smooth"
        aria-expanded={expanded}
        data-testid="workbook-validation-panel-toggle"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-amber-200">
              {aggregate.totalIssues} validation issue{aggregate.totalIssues === 1 ? "" : "s"}
            </div>
            <div className="text-[10px] text-[#8e8e93] truncate">
              {aggregate.criticalCount > 0
                ? `${aggregate.criticalCount} required · ${aggregate.advisoryCount} advisory`
                : `${aggregate.advisoryCount} advisory across ${aggregate.sections.length} section(s)`}
              {" · "}
              Summary & scorecard stay available
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[#636366] shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[#636366] shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-amber-500/10">
          <div className="px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#636366]" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by row, field, message…"
                className="w-full bg-[#0e0e10] border border-[#2c2c2e] rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-white placeholder-[#48484a] outline-none focus:border-[#48484a]"
                data-testid="workbook-validation-filter"
              />
            </div>
          </div>
          <div className="max-h-[min(480px,55vh)] overflow-y-auto">
            {filteredSections.map((section) => {
              const isOpen =
                expandedSections.has(section.sectionKey) ||
                section.sectionKey === activeSectionKey ||
                Boolean(filterNorm);
              return (
                <div
                  key={section.sectionKey}
                  className="border-b border-white/[0.04] last:border-b-0"
                  data-testid={`validation-section-${section.sectionKey}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      toggleSection(section.sectionKey);
                      onSelectSection?.(section.sectionKey);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.03] smooth"
                  >
                    <span className="text-[11px] font-semibold text-[#d1d1d6] truncate">
                      {section.sectionLabel}
                    </span>
                    <span className="text-[10px] tabular-nums text-amber-300 shrink-0">
                      {section.issueCount}
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="px-3 pb-2 space-y-1 max-h-56 overflow-y-auto">
                      {section.issues.map((issue, idx) => (
                        <li
                          key={`${issue.sectionKey}-${issue.rowId ?? "meta"}-${issue.field ?? idx}`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectSection?.(issue.sectionKey)}
                            className={`w-full text-left text-[11px] leading-snug hover:text-white smooth ${
                              isCriticalWorkbookIssue(issue) ? "text-amber-200" : "text-[#8e8e93]"
                            }`}
                          >
                            {formatValidationIssueLine(issue)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
