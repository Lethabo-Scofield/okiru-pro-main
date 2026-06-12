import { ExternalLink } from "lucide-react";
import { EsgAppLink } from "@/components/EsgAppLink";
import { EsgWorkbookSectionEditor } from "@/components/esg-workbook/EsgWorkbookSectionEditor";
import { esgCreateSectionHref } from "@/lib/esgRoutes";
import { useEsgStore } from "../lib/esgStore";
import { EsgToolkitValidationStrip } from "./EsgToolkitValidationStrip";

type Props = {
  sectionKey: string;
  title?: string;
  subtabId?: string;
  visibleSubtabs?: string[];
};

export function EsgToolkitInlineEditor({
  sectionKey,
  title,
  subtabId,
  visibleSubtabs,
}: Props) {
  const companyId = useEsgStore((s) => s.companyId);
  const saving = useEsgStore((s) => s.saving);

  return (
    <div className="space-y-3" data-testid={`esg-toolkit-editor-${sectionKey}`}>
      <div className="flex flex-wrap items-center gap-2">
        {companyId ? (
          <EsgAppLink
            href={esgCreateSectionHref(companyId, sectionKey)}
            className="ml-auto inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[var(--esg-glass-border)] text-[var(--esg-text2)] hover:text-[var(--esg-text)]"
            data-testid="esg-open-full-workbook"
          >
            Open full workbook editor
            <ExternalLink className="h-3 w-3" />
          </EsgAppLink>
        ) : null}
        {saving === sectionKey ? (
          <span className="text-[10px] text-[var(--esg-text3)]">Saving…</span>
        ) : null}
      </div>

      <div className="esg-glass overflow-hidden">
        <EsgWorkbookSectionEditor
          sectionId={sectionKey}
          title={title}
          autosave
          toolkitMode
          initialSubtab={subtabId}
          visibleSubtabs={visibleSubtabs}
        />
      </div>

      <EsgToolkitValidationStrip sectionKey={sectionKey} />
    </div>
  );
}
