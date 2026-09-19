import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Download, Loader2, AlertTriangle } from "lucide-react";
import ExportResults from "@toolkit/components/ExportResults";
import { CalculatorConfigGate } from "@toolkit/components/layout/CalculatorConfigGate";
import { useBbeeStore } from "@toolkit/lib/store";
import { api } from "@toolkit/lib/api";

interface ExportLogEntry {
  id: string;
  clientId: string;
  exportType: string;
  fileName: string | null;
  createdAt: string;
}

const EXPORT_TYPE_LABELS: Record<string, string> = {
  "verification-report": "Verification Report",
  certificate: "Certificate PDF",
  "audit-excel": "Auditor Excel Pack",
  "strategy-pack": "Strategy Pack",
  all: "All reports",
};

function formatTimestamp(raw: string): string {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString();
}

/**
 * Recent Exports.
 *
 * This panel used to be a hardcoded empty state that promised "Downloads will
 * appear here" — a promise nothing could keep: `getExportLogs` had no callers,
 * its route was mounted at a path it did not define, and the prefix was absent
 * from the API proxy allow-list. All three are fixed; this reads the real log.
 */
function RecentExports() {
  const activeClientId = useBbeeStore((s) => s.activeClientId);
  const clientId = useBbeeStore((s) => s.client.id);
  const id = activeClientId || clientId;

  const [logs, setLogs] = useState<ExportLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLogs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await api.getExportLogs(id);
      const list: ExportLogEntry[] = Array.isArray(rows) ? rows : [];
      list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      setLogs(list);
    } catch (err) {
      // Surface it. An export history that silently shows "none" is worse than
      // one that admits it could not be read — the first reads as "you have
      // never exported anything".
      setError(err instanceof Error ? err.message : "Could not load export history.");
      setLogs(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="glass-panel">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Recent Exports</CardTitle>
          <CardDescription>History of generated reports for this client.</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          data-testid="refresh-export-logs"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <div
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
            data-testid="export-logs-error"
          >
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Couldn’t load export history</p>
              <p className="text-muted-foreground text-xs mt-0.5">{error}</p>
            </div>
          </div>
        ) : loading && logs === null ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading export history…
          </div>
        ) : logs && logs.length > 0 ? (
          <ul className="divide-y divide-border/40" data-testid="export-logs-list">
            {logs.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {EXPORT_TYPE_LABELS[entry.exportType] || entry.exportType}
                  </p>
                  {entry.fileName && (
                    <p className="text-xs text-muted-foreground truncate font-mono">{entry.fileName}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTimestamp(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted/50 p-4 mb-4">
              <Download className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No exports yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
              Use the export options above to generate your first report. Downloads will appear here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReportsContent() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Reports &amp; Exports</h1>
        <p className="text-muted-foreground mt-1">
          Generate professional scorecards, evidence packs, and presentation decks.
        </p>
      </div>

      <ExportResults />

      <RecentExports />
    </div>
  );
}

export default function Reports() {
  return (
    <CalculatorConfigGate>
      <ReportsContent />
    </CalculatorConfigGate>
  );
}
