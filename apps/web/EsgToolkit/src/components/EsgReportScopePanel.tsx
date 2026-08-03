/**
 * Part 4 — reporting-scope picker. Framework mode is the untouched original
 * behaviour; topic mode reveals a pillar-grouped chip picker driving
 * nav/score scoping. Persists via assumptions cells (see esgStore).
 */
import { useMemo } from "react";
import {
  ESG_SELECTED_TOPICS_CELL,
  ESG_TOPIC_PILLARS,
  parseSelectedTopics,
  topicCounterLine,
} from "@/lib/esg/esgTopicScope";
import { useEsgStore } from "../lib/esgStore";

const PILLAR_CHIP_TINTS: Record<string, { border: string; bg: string }> = {
  "--esg-acc-e": { border: "rgba(29,233,160,.35)", bg: "rgba(29,233,160,.08)" },
  "--esg-acc-s": { border: "rgba(245,166,35,.35)", bg: "rgba(245,166,35,.08)" },
  "--esg-acc-g": { border: "rgba(155,107,255,.35)", bg: "rgba(155,107,255,.08)" },
};

export function EsgReportScopePanel() {
  const reportMode = useEsgStore((s) => s.getReportMode());
  const setReportMode = useEsgStore((s) => s.setReportMode);
  const topicsCsv = useEsgStore(
    (s) => s.workbook?.sections?.assumptions?.cells?.[ESG_SELECTED_TOPICS_CELL],
  );
  const selectedTopics = useMemo(() => parseSelectedTopics(topicsCsv), [topicsCsv]);
  const toggleTopic = useEsgStore((s) => s.toggleTopic);
  const saving = useEsgStore((s) => s.saving);

  return (
    <div className="esg-glass p-5" data-testid="esg-report-scope-panel">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--esg-text3)]">
            Reporting scope
          </div>
          <p className="text-[12px] text-[var(--esg-text2)] mt-1 max-w-xl">
            Some organisations report because a named standard requires it. Others report because
            it's the right thing to do, and aren't bound to one. Pick whichever fits — you can
            change this later.
          </p>
        </div>
        <div className="flex gap-1.5 ml-auto" role="group" aria-label="Reporting scope mode">
          {(
            [
              { mode: "framework" as const, label: "By framework / standard" },
              { mode: "topic" as const, label: "By topic" },
            ] as const
          ).map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => void setReportMode(m.mode)}
              disabled={saving === "assumptions"}
              className={`text-[12px] font-medium px-3.5 py-1.5 rounded-full border transition-colors disabled:opacity-60 ${
                reportMode === m.mode
                  ? "bg-white/10 border-white/20 text-[var(--esg-text)] font-semibold"
                  : "border-[var(--esg-glass-border)] text-[var(--esg-text3)] hover:text-[var(--esg-text2)]"
              }`}
              data-testid={`esg-scope-mode-${m.mode}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {reportMode === "topic" ? (
        <div className="mt-4 space-y-4">
          {ESG_TOPIC_PILLARS.map((group) => {
            const tint = PILLAR_CHIP_TINTS[group.accentVar];
            return (
              <div key={group.pillar}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: `var(${group.accentVar})` }}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--esg-text3)]">
                    {group.label} pillar
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.topics.map((topic) => {
                    const on = selectedTopics.includes(topic.id);
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        aria-pressed={on}
                        title={topic.description}
                        onClick={() => void toggleTopic(topic.id)}
                        disabled={saving === "assumptions"}
                        className="text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-60"
                        style={
                          on
                            ? {
                                color: `var(${group.accentVar})`,
                                borderColor: tint.border,
                                background: tint.bg,
                              }
                            : {
                                color: "var(--esg-text3)",
                                borderColor: "var(--esg-glass-border)",
                              }
                        }
                        data-testid={`esg-scope-topic-${topic.id}`}
                      >
                        {topic.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-[var(--esg-text2)]" data-testid="esg-scope-counter">
            {topicCounterLine(selectedTopics)}
          </p>
          <p className="text-[10px] text-[var(--esg-text3)]">
            Deselected topics disappear from navigation and scoring. The B-BBEE Bridge is hidden in
            topic mode — it exists to map onto a named standard, which this scope opts out of. Your
            underlying data is never deleted.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-[var(--esg-text3)]">
          Reporting against the full framework-aligned workbook — every section is in scope.
        </p>
      )}
    </div>
  );
}
