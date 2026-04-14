import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Download } from "lucide-react";
import ExportResults from "@toolkit/components/ExportResults";

export default function Reports() {
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
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted/50 p-4 mb-4">
              <Download className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No exports yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
              Use the export options above to generate your first report. Downloads will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
