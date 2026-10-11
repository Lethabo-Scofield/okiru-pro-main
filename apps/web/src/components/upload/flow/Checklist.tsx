/**
 * "Checklist: what to include" — the pillar (B-BBEE) or element (ESG) groups,
 * folded into one closed disclosure.
 *
 * The groups used to be always open: six (or fifteen) cards with three buttons
 * each, 18 to 45 buttons on the screen before a single document had been read.
 * The checklist is guidance, never a gate — any document can go in through the
 * main drop zone — so it now sits closed under it, and says so.
 *
 * Inside, nothing is lost: each group still takes files or a folder, opens to
 * its document types with found / not yet and a per-type Add, and still
 * accepts a drop. The group a file is added to still travels with it (the
 * ESG reader uses it as a hint where its own classifier is unsure).
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, FilePlus2, FileQuestion, FolderOpen } from "lucide-react";
import { Disclosure } from "./Disclosure";
import { outlineButton, textButton } from "./buttonStyles";

export interface ChecklistItem {
  id: string;
  name: string;
  hint?: string;
}

export interface ChecklistGroup {
  id: string;
  label: string;
  blurb: string;
  documentCount: number;
  covered: number;
  items: ChecklistItem[];
  /** Whole packs and workbooks: not a single pillar or element. */
  holistic: boolean;
}

export interface ChecklistOrigin {
  batchId: string;
  batchLabel: string;
  documentTypeId?: string;
  documentTypeName?: string;
  fromFolder?: boolean;
}

export interface ChecklistProps {
  testIdPrefix: "" | "esg-";
  /** The disclosure's own test id (pillar-upload-batches / esg-upload-batches). */
  testId: string;
  groups: ChecklistGroup[];
  satisfied: ReadonlySet<string>;
  /** Something has been read, so "found" counts mean something. */
  anyRead: boolean;
  /** filename → the group it was added to. */
  filedBatchByFile: Record<string, string>;
  /** Staged files added outside any group. */
  unfiledCount: number;
  onPick: (files: File[], origin: ChecklistOrigin) => void;
  disabled?: boolean;
  /** The catalogue failed to load: said inside, uploads still work. */
  notice?: ReactNode;
  /** Shown for a group whose document list is empty. */
  emptyGroupText?: (catalogueLoaded: boolean) => string;
  catalogueLoaded: boolean;
}

function groupCountText(group: ChecklistGroup, anyRead: boolean): string {
  if (group.holistic) return `${group.documentCount} kinds of upload`;
  if (group.documentCount === 0) return "Document list unavailable — uploads still work";
  if (anyRead) return `${group.covered} of ${group.documentCount} found`;
  return `${group.documentCount} kind${group.documentCount === 1 ? "" : "s"} of document`;
}

export function Checklist({
  testIdPrefix: p,
  testId,
  groups,
  satisfied,
  anyRead,
  filedBatchByFile,
  unfiledCount,
  onPick,
  disabled = false,
  notice,
  emptyGroupText,
  catalogueLoaded,
}: ChecklistProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  // One pair of inputs for every group; the pending origin says which group
  // (and optionally which document type) the pick belongs to.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const pendingOrigin = useRef<ChecklistOrigin | null>(null);

  const filedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const batchId of Object.values(filedBatchByFile)) counts[batchId] = (counts[batchId] ?? 0) + 1;
    return counts;
  }, [filedBatchByFile]);
  const filedTotal = Object.keys(filedBatchByFile).length;

  const totalTypes = groups.reduce((sum, g) => sum + (g.holistic ? 0 : g.documentCount), 0);
  const totalCovered = groups.reduce((sum, g) => sum + g.covered, 0);
  const meta =
    anyRead && totalTypes > 0
      ? `${totalCovered} of ${totalTypes} found`
      : filedTotal > 0
        ? `${filedTotal} file${filedTotal === 1 ? "" : "s"} added`
        : "a guide, not a requirement";

  const openPicker = (origin: ChecklistOrigin, kind: "files" | "folder") => {
    if (disabled) return;
    pendingOrigin.current = { ...origin, fromFolder: kind === "folder" };
    (kind === "folder" ? folderInputRef : fileInputRef).current?.click();
  };

  const handlePicked = (list: FileList | null) => {
    const origin = pendingOrigin.current;
    pendingOrigin.current = null;
    if (!origin || !list?.length) return;
    onPick(Array.from(list), origin);
  };

  return (
    <Disclosure
      summary="Checklist: what to include"
      meta={meta}
      className="mt-3 rounded-[18px] border border-white/[0.07] bg-[color:var(--ink-2)] px-4 py-3"
      summaryClassName="text-[13px]"
      testId={testId}
      summaryTestId={`${p}checklist-summary`}
    >
      {/* No `accept`: any file can be picked, and what cannot be opened is set
          aside by name after the pick. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handlePicked(e.target.files);
          e.currentTarget.value = "";
        }}
        data-testid={`${p}batch-file-input`}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(e) => {
          handlePicked(e.target.files);
          e.currentTarget.value = "";
        }}
        data-testid={`${p}batch-folder-input`}
      />

      <p className="text-[12px] leading-5 text-[color:var(--body)]">
        What usually goes into a full pack, by group. Add whatever you have, from here or the drop zone above — we read
        every document and file it where it belongs, whichever group it lands in.
        {unfiledCount > 0 && ` ${unfiledCount} file${unfiledCount === 1 ? "" : "s"} added outside a group.`}
      </p>
      {notice}

      <ul className="mt-2.5 divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.06]">
        {groups.map((group) => {
          const isOpen = openGroup === group.id;
          const filed = filedCounts[group.id] ?? 0;
          const origin: ChecklistOrigin = { batchId: group.id, batchLabel: group.label };
          return (
            <li
              key={group.id}
              className={`transition-colors duration-200 ${dragGroup === group.id ? "bg-white/[0.05]" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!disabled) setDragGroup(group.id);
              }}
              onDragLeave={() => setDragGroup((current) => (current === group.id ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragGroup(null);
                if (!disabled && e.dataTransfer.files?.length) onPick(Array.from(e.dataTransfer.files), origin);
              }}
              data-testid={`${p}batch-${group.id}`}
            >
              <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  aria-expanded={isOpen}
                  data-testid={`${p}batch-toggle-${group.id}`}
                >
                  <ChevronDown
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--muted)] transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-white">{group.label}</span>
                    {group.blurb && <span className="block text-[11.5px] leading-5 text-[color:var(--body)]">{group.blurb}</span>}
                    <span className="block text-[11px] text-[color:var(--body)]" data-testid={`${p}batch-count-${group.id}`}>
                      {groupCountText(group, anyRead)}
                      {filed > 0 && ` · ${filed} file${filed === 1 ? "" : "s"} added`}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1 pl-5 sm:pl-0">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openPicker(origin, "files")}
                    className={outlineButton("sm")}
                    data-testid={`${p}batch-upload-files-${group.id}`}
                  >
                    <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
                    Add files
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openPicker(origin, "folder")}
                    className={textButton("sm")}
                    aria-label={`Add a folder to ${group.label}`}
                    data-testid={`${p}batch-upload-folder-${group.id}`}
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                    Folder
                  </button>
                </div>
              </div>

              {isOpen && (
                <ul className="divide-y divide-white/[0.04] border-t border-white/[0.05] bg-white/[0.015]">
                  {group.items.map((item) => {
                    const have = satisfied.has(item.id);
                    return (
                      <li key={item.id} className="flex items-start gap-2.5 px-3 py-2 pl-8">
                        <span className="mt-0.5 shrink-0" aria-hidden>
                          {have ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <FileQuestion className="h-3.5 w-3.5 text-[color:var(--muted)]" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] leading-5 text-[color:var(--hi)]">
                            {item.name}
                            {/* Never colour alone — the state is spelled out. */}
                            <span className="ml-2 text-[10.5px] text-[color:var(--body)]">{have ? "found" : "not yet"}</span>
                          </span>
                          {item.hint && <span className="block text-[11.5px] leading-[1.45] text-[color:var(--body)]">{item.hint}</span>}
                        </span>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => openPicker({ ...origin, documentTypeId: item.id, documentTypeName: item.name }, "files")}
                          className={textButton("sm")}
                          aria-label={`Add ${item.name}`}
                          data-testid={`${p}upload-doc-${item.id}`}
                        >
                          <FilePlus2 className="h-3 w-3" aria-hidden />
                          Add
                        </button>
                      </li>
                    );
                  })}
                  {group.items.length === 0 && (
                    <li className="px-3 py-2 pl-8 text-[12px] text-[color:var(--muted)]">
                      {emptyGroupText ? emptyGroupText(catalogueLoaded) : "Loading the document list…"}
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Disclosure>
  );
}

export default Checklist;
