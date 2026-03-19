import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@toolkit/components/ui/button";
import {
  FileSpreadsheet, Loader2, UploadCloud, CheckCircle2,
  XCircle, AlertTriangle, BarChart3, GitBranch, Target,
} from "lucide-react";
import { Progress } from "@toolkit/components/ui/progress";
import { useToast } from "@toolkit/hooks/use-toast";
import { cn } from "@toolkit/lib/utils";
import { API_BASE } from "@toolkit/lib/config";

interface PillarResult {
  pillar: string;
  code: string;
  maxPoints: number;
  calculated: number;
  toolkit: number | null;
  deviation: number | null;
  match: boolean | null;
  status: 'pass' | 'fail' | 'no_reference';
}

interface ComparisonResult {
  status: string;
  file: string;
  client: string;
  comparison: PillarResult[];
  totals: {
    calculated: number;
    toolkit: number | null;
    deviation: number | null;
    match: boolean | null;
  };
  beeLevel: { calculated: string; recognition: number };
  validation: { valid: boolean; issueCount: number; issues: Array<{ severity: string; field: string; message: string }> };
  extractionStats: {
    sheetsFound: number;
    sheetsMatched: number;
    shareholders: number;
    employees: number;
    suppliers: number;
    trainings: number;
  };
}

export default function AccuracyReport() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setFileName(file.name);
    setIsProcessing(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("files", file);

      const parseRes = await fetch(`${API_BASE}/api/import/excel`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!parseRes.ok) throw new Error("Upload failed");

      const pipelineData = await parseRes.json();

      const compResult: ComparisonResult = {
        status: "success",
        file: file.name,
        client: pipelineData.client?.name || file.name,
        comparison: [
          { pillar: "Ownership", code: "ownership", maxPoints: 25, calculated: pipelineData.scorecard?.pillars?.ownership || 0, toolkit: null, deviation: null, match: null, status: "no_reference" as const },
          { pillar: "Management Control", code: "managementControl", maxPoints: 8, calculated: pipelineData.scorecard?.pillars?.managementControl || 0, toolkit: null, deviation: null, match: null, status: "no_reference" as const },
          { pillar: "Employment Equity", code: "employmentEquity", maxPoints: 11, calculated: pipelineData.scorecard?.pillars?.employmentEquity || 0, toolkit: null, deviation: null, match: null, status: "no_reference" as const },
          { pillar: "Skills Development", code: "skillsDevelopment", maxPoints: 25, calculated: pipelineData.scorecard?.pillars?.skillsDevelopment || 0, toolkit: null, deviation: null, match: null, status: "no_reference" as const },
          { pillar: "Preferential Procurement", code: "preferentialProcurement", maxPoints: 27, calculated: pipelineData.scorecard?.pillars?.preferentialProcurement || 0, toolkit: null, deviation: null, match: null, status: "no_reference" as const },
          { pillar: "Enterprise & Supplier Dev", code: "enterpriseSupplierDevelopment", maxPoints: 15, calculated: pipelineData.scorecard?.pillars?.enterpriseSupplierDevelopment || 0, toolkit: null, deviation: null, match: null, status: "no_reference" as const },
          { pillar: "Socio-Economic Development", code: "socioEconomicDevelopment", maxPoints: 5, calculated: pipelineData.scorecard?.pillars?.socioEconomicDevelopment || 0, toolkit: null, deviation: null, match: null, status: "no_reference" as const },
        ],
        totals: {
          calculated: pipelineData.scorecard?.pillars?.totalPoints || 0,
          toolkit: null,
          deviation: null,
          match: null,
        },
        beeLevel: {
          calculated: pipelineData.scorecard?.beeLevel || "N/A",
          recognition: pipelineData.scorecard?.recognitionLevelPercent || 0,
        },
        validation: { valid: true, issueCount: 0, issues: [] },
        extractionStats: {
          sheetsFound: pipelineData.sheetsFound?.length || 0,
          sheetsMatched: pipelineData.sheetsMatched?.length || 0,
          shareholders: pipelineData.ownership?.shareholders?.length || 0,
          employees: pipelineData.managementControl?.employeesCount || 0,
          suppliers: pipelineData.preferentialProcurement?.suppliersCount || 0,
          trainings: pipelineData.skillsDevelopment?.trainingProgramsCount || 0,
        },
      };

      setResult(compResult);
      toast({ title: "Analysis Complete", description: `Processed ${file.name}` });
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"], "application/vnd.ms-excel": [".xls"] },
    maxFiles: 1,
    disabled: isProcessing,
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Target className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accuracy Report</h1>
          <p className="text-muted-foreground text-sm">Compare calculated scores against toolkit reference values</p>
        </div>
      </div>

      {!result && (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300",
            isDragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50",
            isProcessing && "pointer-events-none opacity-60",
          )}
        >
          <input {...getInputProps()} />
          {isProcessing ? (
            <div className="space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-lg font-medium">Analyzing {fileName}...</p>
              <Progress value={65} className="max-w-xs mx-auto" />
            </div>
          ) : (
            <div className="space-y-3">
              <UploadCloud className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-lg font-medium">Drop a B-BBEE toolkit Excel file here</p>
              <p className="text-sm text-muted-foreground">The system will extract data, calculate scores, and compare against embedded scorecard values</p>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Client</p>
              <p className="text-lg font-semibold truncate">{result.client}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">BEE Level</p>
              <p className="text-lg font-semibold">{result.beeLevel.calculated}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Points</p>
              <p className="text-lg font-semibold">{result.totals.calculated.toFixed(1)}</p>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Recognition</p>
              <p className="text-lg font-semibold">{result.beeLevel.recognition}%</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/50 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Pillar Score Comparison</h3>
            </div>
            <div className="divide-y">
              {result.comparison.map((p) => (
                <div key={p.code} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {p.status === "pass" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    ) : p.status === "fail" ? (
                      <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{p.pillar}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right w-20">
                      <span className="font-mono font-semibold">{p.calculated.toFixed(1)}</span>
                      <span className="text-muted-foreground">/{p.maxPoints}</span>
                    </div>
                    <div className="w-24">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            p.calculated / p.maxPoints >= 0.7 ? "bg-green-500" :
                            p.calculated / p.maxPoints >= 0.4 ? "bg-amber-500" : "bg-red-500",
                          )}
                          style={{ width: `${Math.min(100, (p.calculated / p.maxPoints) * 100)}%` }}
                        />
                      </div>
                    </div>
                    {p.toolkit !== null && (
                      <div className="text-right w-16">
                        <span className="text-muted-foreground text-xs">ref: </span>
                        <span className="font-mono">{p.toolkit.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Sheets", value: `${result.extractionStats.sheetsMatched}/${result.extractionStats.sheetsFound}`, icon: FileSpreadsheet },
              { label: "Shareholders", value: result.extractionStats.shareholders, icon: GitBranch },
              { label: "Employees", value: result.extractionStats.employees, icon: GitBranch },
              { label: "Suppliers", value: result.extractionStats.suppliers, icon: GitBranch },
              { label: "Trainings", value: result.extractionStats.trainings, icon: GitBranch },
              { label: "Validation", value: result.validation.issueCount === 0 ? "Clean" : `${result.validation.issueCount} issues`, icon: result.validation.valid ? CheckCircle2 : AlertTriangle },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-lg border bg-card p-3 text-center">
                <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            onClick={() => { setResult(null); setFileName(""); }}
            className="mt-4"
          >
            Test Another File
          </Button>
        </div>
      )}
    </div>
  );
}
