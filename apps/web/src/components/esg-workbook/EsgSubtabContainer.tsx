import type { ReactNode } from "react";

export type EsgSubtab = { id: string; label: string; content: ReactNode };

type Props = {
  tabs: EsgSubtab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
};

export function EsgSubtabContainer({ tabs, activeTab, onTabChange }: Props) {
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" data-testid="esg-subtabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-[12px] ${
              activeTab === tab.id
                ? "bg-white/[0.08] text-[var(--esg-text)]"
                : "text-[var(--esg-text2)] hover:bg-white/[0.04]"
            }`}
            data-testid={`esg-subtab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div data-testid={`esg-subtab-panel-${active?.id}`}>{active?.content}</div>
    </div>
  );
}
