import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { FileText, FileSpreadsheet, Presentation } from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import ExportResults from "@toolkit/components/ExportResults";

export default function Reports() {
  const state = useBbeeStore();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Reports & Exports</h1>
        <p className="text-muted-foreground mt-1">
          Generate professional scorecards, evidence packs, and presentation decks.
        </p>
      </div>

      <ExportResults />

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Recent Exports</CardTitle>
          <CardDescription>History of generated reports for this client.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border bg-card/50 shadow-sm overflow-hidden">
            <div className="grid grid-cols-4 p-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground border-b bg-muted/50">
              <div className="col-span-2">Report Name</div>
              <div>Type</div>
              <div className="text-right">Date</div>
            </div>
            <div className="grid grid-cols-4 p-4 items-center text-sm border-b hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="col-span-2 font-medium flex items-center gap-3">
                <div className="bg-red-50 dark:bg-red-900/30 p-1.5 rounded-lg border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400">
                  <FileText className="h-4 w-4" />
                </div>
                Final_BEE_Report_{state.client.name.replace(/\s+/g, '_')}.pdf
              </div>
              <div className="text-muted-foreground">Certificate PDF</div>
              <div className="text-right text-muted-foreground font-mono text-xs">Today, 10:24 AM</div>
            </div>
            <div className="grid grid-cols-4 p-4 items-center text-sm border-b hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="col-span-2 font-medium flex items-center gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-900/30 p-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900 text-emerald-600 dark:text-emerald-400">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                Auditor_Pack_{state.client.name.replace(/\s+/g, '_')}.xlsx
              </div>
              <div className="text-muted-foreground">Auditor Excel</div>
              <div className="text-right text-muted-foreground font-mono text-xs">Yesterday</div>
            </div>
            <div className="grid grid-cols-4 p-4 items-center text-sm hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="col-span-2 font-medium flex items-center gap-3">
                <div className="bg-orange-50 dark:bg-orange-900/30 p-1.5 rounded-lg border border-orange-100 dark:border-orange-900 text-orange-600 dark:text-orange-400">
                  <Presentation className="h-4 w-4" />
                </div>
                Strategy_Pack_{state.client.name.replace(/\s+/g, '_')}.pptx
              </div>
              <div className="text-muted-foreground">Strategy Pack</div>
              <div className="text-right text-muted-foreground font-mono text-xs">Last Week</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
