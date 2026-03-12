import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Switch } from "@toolkit/components/ui/switch";
import { Textarea } from "@toolkit/components/ui/textarea";
import { Skeleton } from "@toolkit/components/ui/skeleton";
import {
  Download, Loader2,
  CheckCircle2, Package, Settings2, ChevronDown, ChevronUp
} from "lucide-react";
import { BsFileEarmarkPdfFill, BsFileEarmarkExcelFill, BsFileEarmarkPptFill } from "react-icons/bs";
import { useBbeeStore } from "@toolkit/lib/store";
import { useToast } from "@toolkit/hooks/use-toast";
import { useAuth } from "@toolkit/lib/auth";
import { exportCertificatePdf } from "@toolkit/lib/exportPdf";
import { exportAuditorExcel } from "@toolkit/lib/exportExcel";
import { exportStrategyPptx } from "@toolkit/lib/exportPptx";
import { api } from "@toolkit/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@toolkit/lib/utils";

interface ExportResultsProps {
  className?: string;
}

function ExportCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card/50 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-8 w-full rounded-md" />
    </div>
  );
}

export default function ExportResults({ className }: ExportResultsProps) {
  const { toast } = useToast();
  const state = useBbeeStore();
  const { user } = useAuth();

  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [completedExports, setCompletedExports] = useState<string[]>([]);

  const [analystName, setAnalystName] = useState(user?.fullName || "");
  const [reportNotes, setReportNotes] = useState("");
  const [includeDraft2026, setIncludeDraft2026] = useState(false);

  const isLoaded = state.isLoaded;

  const currentLevel = state.scorecard.isDiscounted
    ? state.scorecard.discountedLevel
    : state.scorecard.achievedLevel;

  const exportOptions = {
    analystName: analystName || undefined,
    reportNotes: reportNotes || undefined,
    includeDraft2026,
  };

  const handleExport = async (type: 'certificate' | 'audit-excel' | 'strategy-pack') => {
    setIsExporting(type);
    try {
      let fileName = '';
      if (type === 'certificate') {
        fileName = exportCertificatePdf(state, exportOptions);
      } else if (type === 'audit-excel') {
        fileName = exportAuditorExcel(state, exportOptions);
      } else if (type === 'strategy-pack') {
        fileName = await exportStrategyPptx(state, exportOptions);
      }

      setCompletedExports(prev => [...prev, type]);

      try {
        await api.logExport({
          clientId: state.client.id,
          exportType: type,
          fileName,
        });
      } catch {}

      toast({
        title: "Export Complete",
        description: `Your ${type === 'certificate' ? 'Certificate PDF' : type === 'audit-excel' ? 'Auditor Excel Pack' : 'Strategy Pack'} has been downloaded.`,
      });
    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error.message || "There was an error generating your file.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportAll = async () => {
    setIsExporting('all');
    try {
      exportCertificatePdf(state, exportOptions);
      exportAuditorExcel(state, exportOptions);
      await exportStrategyPptx(state, exportOptions);
      setCompletedExports(['certificate', 'audit-excel', 'strategy-pack']);

      try {
        await api.logExport({
          clientId: state.client.id,
          exportType: 'all',
          fileName: 'Multiple exports',
        });
      } catch {}

      toast({
        title: "All Exports Complete",
        description: "Certificate PDF, Auditor Excel, and Strategy Pack have been downloaded.",
      });
    } catch (error: any) {
      console.error('Export all error:', error);
      toast({
        title: "Export Failed",
        description: error.message || "There was an error generating files.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(null);
    }
  };

  const exports = [
    {
      id: 'certificate' as const,
      title: 'Certificate PDF',
      description: 'Verification report with entity details, scorecard, ownership breakdown, and disclaimers',
      icon: BsFileEarmarkPdfFill,
      iconColor: 'text-red-600 dark:text-red-500',
      iconBg: 'bg-red-500/10',
      pages: '7 pages',
    },
    {
      id: 'audit-excel' as const,
      title: 'Auditor Excel Pack',
      description: 'Comprehensive workbook with financials, ownership, management, skills, procurement, ESD/SED',
      icon: BsFileEarmarkExcelFill,
      iconColor: 'text-green-600 dark:text-green-500',
      iconBg: 'bg-green-500/10',
      pages: '10 sheets',
    },
    {
      id: 'strategy-pack' as const,
      title: 'Strategy Pack (PPTX)',
      description: 'Board-ready presentation with scorecard overview, pillar details, gaps analysis',
      icon: BsFileEarmarkPptFill,
      iconColor: 'text-orange-600 dark:text-orange-500',
      iconBg: 'bg-orange-500/10',
      pages: '14 slides',
    },
  ];

  return (
    <Card className={cn("glass-panel", className)} data-testid="card-export-results">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4 text-primary" />
              Export Results
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Generate professional reports. {currentLevel >= 9 ? 'Non-Compliant' : `Level ${currentLevel}`} ({state.scorecard.recognitionLevel}).
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground text-xs h-8"
            onClick={() => setShowCustomize(!showCustomize)}
            data-testid="btn-toggle-customize"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Customize
            {showCustomize ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <AnimatePresence>
          {showCustomize && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="analyst-name" className="text-xs">Analyst Name</Label>
                    <Input
                      id="analyst-name"
                      value={analystName}
                      onChange={(e) => setAnalystName(e.target.value)}
                      placeholder="Enter analyst name"
                      className="h-9"
                      data-testid="input-analyst-name"
                    />
                  </div>
                  <div className="space-y-1.5 flex items-end">
                    <div className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-card w-full">
                      <Switch
                        id="draft-2026"
                        checked={includeDraft2026}
                        onCheckedChange={setIncludeDraft2026}
                        data-testid="switch-draft-2026"
                      />
                      <Label htmlFor="draft-2026" className="cursor-pointer text-xs">
                        Include Draft 2026 Rules
                      </Label>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="report-notes" className="text-xs">Report Notes</Label>
                  <Textarea
                    id="report-notes"
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                    placeholder="Add notes for the reports..."
                    rows={2}
                    data-testid="input-report-notes"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isLoaded ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ExportCardSkeleton />
            <ExportCardSkeleton />
            <ExportCardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {exports.map((exp) => {
              const Icon = exp.icon;
              const isComplete = completedExports.includes(exp.id);
              const isLoading = isExporting === exp.id || isExporting === 'all';

              return (
                <motion.div
                  key={exp.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                  className={cn(
                    "rounded-xl border p-4 space-y-3 transition-all",
                    isComplete ? "border-emerald-300/60 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-900/5" : "bg-card/50"
                  )}
                  data-testid={`card-export-${exp.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className={cn("p-2.5 rounded-xl", exp.iconBg)}>
                      <Icon className={cn("h-5 w-5", exp.iconColor)} />
                    </div>
                    {isComplete && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" data-testid={`icon-complete-${exp.id}`} />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{exp.title}</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{exp.description}</p>
                    <span className="text-[10px] text-muted-foreground/50 mt-0.5 block">{exp.pages}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 h-8 text-xs"
                    onClick={() => handleExport(exp.id)}
                    disabled={isExporting !== null}
                    data-testid={`btn-export-${exp.id}`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {isLoading ? 'Generating...' : isComplete ? 'Download Again' : 'Download'}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        )}

        <Button
          onClick={handleExportAll}
          disabled={isExporting !== null || !isLoaded}
          className="w-full gap-2 rounded-full h-10 text-sm"
          data-testid="btn-export-all"
        >
          {isExporting === 'all' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Package className="h-4 w-4" />
          )}
          {isExporting === 'all' ? 'Generating All...' : 'Download All Reports'}
        </Button>

        {completedExports.length > 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] text-muted-foreground text-center"
          >
            {completedExports.length} of 3 exports generated.
          </motion.p>
        )}
      </CardContent>
    </Card>
  );
}
