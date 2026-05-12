import { useCallback, useEffect, useState } from "react";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Loader2, History, RotateCcw } from "lucide-react";

export interface SnapshotMeta {
  snapshotId: string;
  label?: string;
  createdAt: string;
  createdBy: string;
}

export interface AssessmentSnapshotsPanelProps {
  assessmentId: string | null;
  canSave: boolean;
  canRestore: boolean;
  onRestored: () => Promise<void>;
}

export function AssessmentSnapshotsPanel({
  assessmentId,
  canSave,
  canRestore,
  onRestored,
}: AssessmentSnapshotsPanelProps) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assessmentId?.startsWith("assessment-")) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/assessments/${encodeURIComponent(assessmentId)}/snapshots`, {
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof j?.error === "string" ? j.error : "Could not load versions");
        setSnapshots([]);
        return;
      }
      if (j.success && Array.isArray(j.snapshots)) setSnapshots(j.snapshots);
      else setSnapshots([]);
    } catch {
      setError("Could not load versions");
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSnapshot() {
    if (!assessmentId || !canSave) return;
    setBusyId("__save__");
    setError(null);
    try {
      const r = await fetch(`/api/assessments/${encodeURIComponent(assessmentId)}/snapshots`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof j?.error === "string" ? j.error : "Save failed");
        return;
      }
      setLabel("");
      await load();
    } catch {
      setError("Save failed");
    } finally {
      setBusyId(null);
    }
  }

  async function restoreSnapshot(snapshotId: string) {
    if (!assessmentId || !canRestore) return;
    if (!confirm("Restore this version? Current pillar data and scorecard will be replaced.")) return;
    setBusyId(snapshotId);
    setError(null);
    try {
      const r = await fetch(
        `/api/assessments/${encodeURIComponent(assessmentId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
        { method: "POST", credentials: "include" },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof j?.error === "string" ? j.error : "Restore failed");
        return;
      }
      await onRestored();
      await load();
    } catch {
      setError("Restore failed");
    } finally {
      setBusyId(null);
    }
  }

  if (!assessmentId?.startsWith("assessment-")) return null;

  return (
    <div
      className="bg-[#1c1c1e] rounded-2xl border border-[#2c2c2e] overflow-hidden"
      data-testid="assessment-snapshots-panel"
    >
      <div className="px-6 py-4 border-b border-[#2c2c2e] flex items-center gap-2">
        <History className="w-4 h-4 text-[#8e8e93]" />
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Scorecard versions</h3>
      </div>

      <div className="px-6 py-4 space-y-4">
        {error && <p className="text-xs text-amber-400">{error}</p>}

        {canSave && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[10px] uppercase tracking-wider text-[#8e8e93] block mb-1">
                Label (optional)
              </label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Before procurement review"
                className="bg-[#0d0d0d] border-[#2c2c2e] text-white text-sm h-9"
                disabled={busyId !== null}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busyId !== null}
              onClick={() => void saveSnapshot()}
              data-testid="btn-save-snapshot"
            >
              {busyId === "__save__" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save current version"}
            </Button>
          </div>
        )}

        {!canRestore && (
          <p className="text-[11px] text-[#8e8e93]">
            Only the team owner or an unrestricted editor can restore a saved version.
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[#8e8e93] text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading versions…
          </div>
        ) : snapshots.length === 0 ? (
          <p className="text-[13px] text-[#8e8e93]">No saved versions yet.</p>
        ) : (
          <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {snapshots.map((s) => (
              <li
                key={s.snapshotId}
                className="flex items-center justify-between gap-3 rounded-lg bg-[#141414] border border-[#252528] px-3 py-2"
                data-testid={`snapshot-row-${s.snapshotId}`}
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-white truncate">{s.label || "Untitled snapshot"}</p>
                  <p className="text-[10px] text-[#636366] tabular-nums">
                    {new Date(s.createdAt).toLocaleString()} · {s.createdBy}
                  </p>
                </div>
                {canRestore && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-[#48484a] text-white hover:bg-white/10"
                    disabled={busyId !== null}
                    onClick={() => void restoreSnapshot(s.snapshotId)}
                    data-testid={`btn-restore-${s.snapshotId}`}
                  >
                    {busyId === s.snapshotId ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                        Restore
                      </>
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
