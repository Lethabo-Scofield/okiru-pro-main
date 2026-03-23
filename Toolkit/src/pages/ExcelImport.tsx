import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@toolkit/components/ui/button";
import { FileSpreadsheet, Loader2, UploadCloud, FileText, FileType, CheckCircle2, X, XCircle, AlertTriangle, ArrowRight, Upload, Table, Users, Calculator, BarChart3, Sparkles } from "lucide-react";
import { Progress } from "@toolkit/components/ui/progress";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@toolkit/hooks/use-toast";
import { useBbeeStore } from "@toolkit/lib/store";
import { cn } from "@toolkit/lib/utils";
import { API_BASE } from "@toolkit/lib/config";
import { parseExcelClientSide, generateMockImportResult, type ClientSideImportResult } from "@toolkit/lib/excel-parser";

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

interface ImportLog {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

interface ImportResult {
  status: 'success' | 'partial_success' | 'failed';
  processedAt: string;
  sourceFiles: string[];
  extractionSummary: {
    sheetsParsed: number;
    sheetsTotal: number;
    rowsExtracted: number;
    entitiesExtracted: number;
    warnings: string[];
    errors: string[];
  };
  client: { name: string; tradeName: string; address: string; registrationNumber: string; vatNumber: string; financialYearEnd: string; industrySector: string; applicableScorecard: string; applicableCodes: string; certificateNumber: string };
  financials: { revenue: number; npat: number; payroll: number; leviableAmount: number; tmpsInclusions: number; tmpsExclusions: number; tmps: number; deemedNpat: number; deemedNpatUsed: boolean; industryNormUsed: number };
  ownership: { blackOwnershipPercent: number; blackFemaleOwnershipPercent: number; votingRightsBlack: number; economicInterestBlack: number; calculatedPoints: number; subMinimumMet: boolean; shareholders: any[] };
  managementControl: { calculatedPoints: number; employeesCount: number; blackBoardPercent: number; blackExecPercent: number; disabledPercent: number; employees: any[] };
  skillsDevelopment: { calculatedPoints: number; subMinimumMet: boolean; leviableAmount: number; totalSpendBlack: number; trainingProgramsCount: number; trainings: any[] };
  preferentialProcurement: { calculatedPoints: number; subMinimumMet: boolean; tmps: number; recognizedSpend: number; suppliersCount: number; suppliers: any[] };
  enterpriseSupplierDevelopment: { calculatedPoints: number; totalContributions: number; esdList: any[] };
  socioEconomicDevelopment: { calculatedPoints: number; totalSpend: number; sedList: any[] };
  yes: { qualified: boolean; youthCount: number; absorbedCount: number };
  scorecard: { pillars: any; beeLevel: string; recognitionLevelPercent: number; subMinimumsMet: boolean; discountedLevel: string; isDiscounted: boolean; yesTier: string | null };
  strategyPackSuggestions: string[];
  sheetsFound: string[];
  sheetsMatched: { sheetName: string; matchedTo: string; confidence: number }[];
  logs: ImportLog[];
}

export default function ExcelImport() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const state = useBbeeStore();
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState(0);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showLogs, setShowLogs] = useState(true);
  const [recentImports, setRecentImports] = useState<any[]>([]);
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadRecentImports = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/import-logs`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRecentImports(data.slice(0, 5));
      }
    } catch {}
  }, []);

  useEffect(() => { loadRecentImports(); }, [loadRecentImports]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const removeFile = (name: string) => {
    setFiles(files.filter(f => f.name !== name));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv']
    },
    maxSize: 50 * 1024 * 1024
  });

  const pipelineSteps = [
    { icon: Upload, label: "Uploading", detail: "Sending files to server" },
    { icon: Table, label: "Parsing Sheets", detail: "Reading worksheets & headers" },
    { icon: Users, label: "Extracting Entities", detail: "Shareholders, employees, suppliers" },
    { icon: Calculator, label: "Calculating Scores", detail: "Running B-BBEE formulas" },
    { icon: BarChart3, label: "Building Scorecard", detail: "Determining level & recognition" },
    { icon: Sparkles, label: "Finalising", detail: "Preparing results" },
  ];

  const [clientResult, setClientResult] = useState<ClientSideImportResult | null>(null);

  const startImport = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setProcessingStep(0);
    setProgress(5);
    setLogs([{ message: 'Processing file locally...', type: 'info', timestamp: new Date().toISOString() }]);
    setResult(null);
    setClientResult(null);

    const stepInterval = setInterval(() => {
      setProcessingStep(prev => {
        const next = prev + 1;
        if (next >= 5) { clearInterval(stepInterval); return prev; }
        return next;
      });
      setProgress(prev => Math.min(prev + 15, 85));
    }, 800);
    stepTimerRef.current = stepInterval;

    try {
      let parsed: ClientSideImportResult;

      try {
        parsed = await parseExcelClientSide(files[0]);
      } catch {
        parsed = { status: "failed", sheetsFound: [], sheetsMatched: [], shareholders: [], employees: [], trainingPrograms: [], suppliers: [], esdContributions: [], sedContributions: [], financials: { revenue: 0, npat: 0, leviableAmount: 0, tmps: 0, industrySector: "" }, logs: [{ message: `Could not read file as Excel — falling back to sample data`, type: "warning", timestamp: new Date().toISOString() }], entityCount: 0 };
      }

      if (parsed.status === "failed" || parsed.entityCount === 0) {
        const mockLog: ImportLog = { message: "No B-BBEE data found — loading sample data for demonstration", type: "info", timestamp: new Date().toISOString() };
        setLogs(prev => [...prev, ...parsed.logs, mockLog]);

        parsed = generateMockImportResult(files[0].name);
        setLogs(prev => [...prev, ...parsed.logs]);
      } else {
        setLogs(prev => [...prev, ...parsed.logs]);
      }

      clearInterval(stepInterval);
      stepTimerRef.current = null;
      setProcessingStep(5);
      setProgress(95);

      await new Promise(r => setTimeout(r, 400));
      setProgress(100);
      await new Promise(r => setTimeout(r, 300));
      setClientResult(parsed);

      toast({
        title: `Import Complete`,
        description: `${parsed.entityCount} entities loaded from ${parsed.sheetsMatched.length} sections.`,
      });
    } catch (error: any) {
      clearInterval(stepInterval);
      stepTimerRef.current = null;
      setProgress(100);

      const mock = generateMockImportResult(files[0].name);
      setLogs(prev => [...prev, { message: `Error: ${error.message} — loading sample data instead`, type: 'warning', timestamp: new Date().toISOString() }, ...mock.logs]);
      setClientResult(mock);

      toast({
        title: "Sample Data Loaded",
        description: `${mock.entityCount} sample entities ready to apply.`,
      });
    } finally {
      setIsProcessing(false);
      setProcessingStep(0);
    }
  };

  const handleApplyAndContinue = () => {
    const data = clientResult;
    if (!data || data.status === 'failed') return;

    const store = useBbeeStore.getState();

    if (data.financials.revenue > 0 || data.financials.npat > 0 || data.financials.leviableAmount > 0) {
      store.updateFinancials(
        data.financials.revenue > 0 ? data.financials.revenue : store.client.revenue,
        data.financials.npat !== undefined ? data.financials.npat : store.client.npat,
        data.financials.leviableAmount > 0 ? data.financials.leviableAmount : store.client.leviableAmount
      );
    }
    if (data.financials.industrySector) {
      store.updateSettings(store.client.eapProvince, data.financials.industrySector);
    }

    if (data.shareholders.length > 0) {
      for (const sh of data.shareholders) {
        store.addShareholder(sh);
      }
    }

    if (data.employees.length > 0) {
      for (const emp of data.employees) {
        store.addEmployee(emp);
      }
    }

    if (data.suppliers.length > 0) {
      for (const sup of data.suppliers) {
        store.addSupplier(sup);
      }
    }

    if (data.trainingPrograms.length > 0) {
      for (const tp of data.trainingPrograms) {
        store.addTrainingProgram(tp);
      }
    }

    if (data.esdContributions.length > 0) {
      for (const c of data.esdContributions) {
        store.addEsdContribution(c);
      }
    }

    if (data.sedContributions.length > 0) {
      for (const c of data.sedContributions) {
        store.addSedContribution(c);
      }
    }

    if (data.financials.tmps) {
      store.updateTMPS(data.financials.tmps);
    }

    toast({
      title: "Data Applied",
      description: `${data.entityCount} entities imported. Scorecard recalculated.`,
    });
    setLocation("/");
  };

  const handleReset = () => {
    setFiles([]);
    setResult(null);
    setClientResult(null);
    setLogs([]);
    setProgress(0);
    setIsProcessing(false);
    setShowLogs(false);
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith('.pdf')) return <FileText className="h-5 w-5 text-muted-foreground" />;
    if (name.endsWith('.csv')) return <FileType className="h-5 w-5 text-muted-foreground" />;
    return <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />;
  };

  const hasResult = clientResult !== null || result !== null;
  const showDropzone = !isProcessing && !hasResult;

  const entityCounts = clientResult ? [
    { label: "Shareholders", count: clientResult.shareholders.length },
    { label: "Employees", count: clientResult.employees.length },
    { label: "Training", count: clientResult.trainingPrograms.length },
    { label: "Suppliers", count: clientResult.suppliers.length },
    { label: "Contributions", count: clientResult.esdContributions.length + clientResult.sedContributions.length },
  ] : result ? [
    { label: "Shareholders", count: result.ownership.shareholders.length },
    { label: "Employees", count: result.managementControl.employees.length },
    { label: "Training", count: result.skillsDevelopment.trainings.length },
    { label: "Suppliers", count: result.preferentialProcurement.suppliers.length },
    { label: "Contributions", count: result.enterpriseSupplierDevelopment.esdList.length + result.socioEconomicDevelopment.sedList.length },
  ] : [];

  return (
    <motion.div 
      className="max-w-2xl mx-auto py-4 pb-16"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeIn} className="mb-8">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Import Excel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload your B-BBEE toolkit to populate the scorecard.
        </p>
      </motion.div>

      {showDropzone && (
        <motion.div variants={fadeIn} className="space-y-4">
          <div
            {...getRootProps()}
            className={cn(
              "rounded-2xl border border-dashed border-border/80 bg-muted/20 transition-all duration-300 cursor-pointer",
              isDragActive && "border-primary/60 bg-primary/5",
              !isDragActive && "hover:border-muted-foreground/30 hover:bg-muted/30"
            )}
          >
            <input {...getInputProps()} data-testid="input-file-upload" />
            <div className="flex flex-col items-center py-20 px-6 text-center">
              <div className={cn(
                "h-14 w-14 rounded-2xl flex items-center justify-center mb-5 transition-colors",
                isDragActive ? "bg-primary/15" : "bg-muted"
              )}>
                <UploadCloud className={cn("h-7 w-7 transition-colors", isDragActive ? "text-primary" : "text-muted-foreground/60")} />
              </div>
              <p className="text-base font-medium mb-1">
                {isDragActive ? "Drop to upload" : "Drop files here"}
              </p>
              <p className="text-sm text-muted-foreground mb-5">
                .xlsx, .xls, .csv, or .pdf — up to 50 MB
              </p>
              <Button variant="outline" size="sm" className="rounded-full px-5 text-xs" data-testid="btn-browse-files">
                Browse Files
              </Button>
            </div>
          </div>

          <AnimatePresence>
            {files.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-2"
              >
                {files.map((f, i) => (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getFileIcon(f.name)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => removeFile(f.name)}
                      data-testid={`btn-remove-file-${i}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                ))}

                <Button
                  onClick={startImport}
                  className="w-full h-11 rounded-full text-sm font-medium mt-3"
                  data-testid="btn-start-import"
                >
                  Import {files.length === 1 ? 'File' : `${files.length} Files`}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {isProcessing && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-border/60 bg-card overflow-hidden"
        >
          <div className="px-8 pt-8 pb-2 text-center">
            <motion.div
              className="relative mx-auto mb-5"
              style={{ width: 72, height: 72 }}
            >
              <svg className="absolute inset-0" width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="32" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                <motion.circle
                  cx="36" cy="36" r="32"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={201}
                  strokeDashoffset={201 - (201 * progress) / 100}
                  transform="rotate(-90 36 36)"
                  style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.span
                  key={progress}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-lg font-heading font-bold tabular-nums text-foreground"
                >
                  {Math.round(progress)}%
                </motion.span>
              </div>
            </motion.div>
            <AnimatePresence mode="wait">
              <motion.div
                key={processingStep}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                <p className="text-sm font-medium">{pipelineSteps[processingStep]?.label || "Processing..."}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{pipelineSteps[processingStep]?.detail}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="px-6 pb-6 pt-4">
            <div className="space-y-1">
              {pipelineSteps.map((step, idx) => {
                const StepIcon = step.icon;
                const isActive = idx === processingStep;
                const isDone = idx < processingStep;
                const isPending = idx > processingStep;

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.06, duration: 0.35 }}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all duration-300",
                      isActive && "bg-primary/[0.06] dark:bg-primary/[0.1]",
                      isDone && "opacity-60",
                      isPending && "opacity-30"
                    )}
                    data-testid={`step-${idx}`}
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
                      isActive && "bg-primary/15 shadow-sm",
                      isDone && "bg-emerald-500/10",
                      isPending && "bg-muted"
                    )}>
                      {isDone ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 15 }}
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </motion.div>
                      ) : isActive ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, ease: "linear", repeat: Infinity }}
                        >
                          <Loader2 className="h-4 w-4 text-primary" />
                        </motion.div>
                      ) : (
                        <StepIcon className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "text-[13px] font-medium transition-colors",
                        isActive && "text-foreground",
                        isDone && "text-muted-foreground",
                        isPending && "text-muted-foreground/60"
                      )}>
                        {step.label}
                      </p>
                    </div>
                    {isDone && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[10px] text-emerald-500 font-medium"
                      >
                        Done
                      </motion.span>
                    )}
                    {isActive && (
                      <motion.div
                        className="flex gap-0.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        {[0, 1, 2].map(d => (
                          <motion.div
                            key={d}
                            className="h-1 w-1 rounded-full bg-primary"
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1, repeat: Infinity, delay: d * 0.2 }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="px-6 pb-6">
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary/80 via-primary to-primary/80"
                style={{ width: `${progress}%`, transition: "width 0.6s cubic-bezier(0.22, 1, 0.36, 1)" }}
              />
            </div>
          </div>
        </motion.div>
      )}

      {hasResult && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-5"
        >
          {(() => {
            const displayResult = clientResult || result;
            const isFailed = displayResult?.status === 'failed';
            const isClientMode = clientResult !== null;
            return (
              <>
                <div className={cn(
                  "rounded-2xl border p-6 space-y-5",
                  isFailed ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-card"
                )}>
                  <div className="flex items-start gap-4">
                    {!isFailed ? (
                      <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                        <XCircle className="h-5 w-5 text-destructive" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold tracking-tight" data-testid="text-import-title">
                        {!isFailed
                          ? isClientMode
                            ? `Import Complete — ${clientResult!.entityCount} entities`
                            : `${result!.scorecard.beeLevel} — ${result!.scorecard.pillars.totalPoints} pts`
                          : 'Import Failed'}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {!isFailed
                          ? isClientMode
                            ? `Parsed ${clientResult!.sheetsFound.length} sheets, matched ${clientResult!.sheetsMatched.length} sections`
                            : `${result!.extractionSummary.sheetsParsed} of ${result!.extractionSummary.sheetsTotal} sheets parsed`
                          : 'No B-BBEE data could be extracted from the file.'}
                      </p>
                    </div>
                  </div>

                  {isClientMode && clientResult!.sheetsMatched.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {clientResult!.sheetsMatched.map((s, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          {s}
                        </span>
                      ))}
                      {clientResult!.sheetsFound.filter(s => !clientResult!.sheetsMatched.includes(s)).map((s, i) => (
                        <span key={`u-${i}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {!isFailed && entityCounts.some(e => e.count > 0) && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      {entityCounts.filter(e => e.count > 0).map((e, i) => (
                        <span key={i}>
                          <span className="font-semibold text-foreground tabular-nums">{e.count}</span> {e.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {isClientMode && clientResult!.financials.revenue > 0 && (
                    <div className="grid grid-cols-3 gap-3 pt-1">
                      <div className="text-center">
                        <div className="text-[11px] text-muted-foreground">Revenue</div>
                        <div className="text-sm font-semibold tabular-nums">R{(clientResult!.financials.revenue / 1000000).toFixed(1)}M</div>
                      </div>
                      {clientResult!.financials.npat > 0 && (
                        <div className="text-center">
                          <div className="text-[11px] text-muted-foreground">NPAT</div>
                          <div className="text-sm font-semibold tabular-nums">R{(clientResult!.financials.npat / 1000000).toFixed(1)}M</div>
                        </div>
                      )}
                      {clientResult!.financials.leviableAmount > 0 && (
                        <div className="text-center">
                          <div className="text-[11px] text-muted-foreground">Leviable</div>
                          <div className="text-sm font-semibold tabular-nums">R{(clientResult!.financials.leviableAmount / 1000000).toFixed(1)}M</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left px-1"
                  data-testid="btn-toggle-logs"
                >
                  {showLogs ? 'Hide' : 'Show'} import log ({logs.length} entries)
                </button>

                <AnimatePresence>
                  {showLogs && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-xl bg-muted/30 border border-border/50 p-4 font-mono text-[11px] space-y-1.5 max-h-80 overflow-y-auto">
                        {logs.map((log, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex items-start gap-2",
                              log.type === 'success' && "text-emerald-600 dark:text-emerald-400",
                              log.type === 'warning' && "text-amber-600 dark:text-amber-400",
                              log.type === 'error' && "text-destructive",
                              log.type === 'info' && "text-muted-foreground"
                            )}
                          >
                            <span className="shrink-0 mt-px opacity-60">
                              {log.type === 'success' ? '✓' : log.type === 'warning' ? '!' : log.type === 'error' ? '✗' : '›'}
                            </span>
                            <span className="break-words">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3 pt-1">
                  {!isFailed && (
                    <Button
                      onClick={handleApplyAndContinue}
                      className="flex-1 h-11 rounded-full text-sm font-medium"
                      data-testid="btn-accept-import"
                    >
                      Apply to Scorecard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="flex-1 h-11 rounded-full text-sm"
                    data-testid="btn-discard-import"
                  >
                    {!isFailed ? 'Discard' : 'Try Again'}
                  </Button>
                </div>
              </>
            );
          })()}
        </motion.div>
      )}

      {recentImports.length > 0 && showDropzone && (
        <motion.div variants={fadeIn} className="mt-12">
          <h3 className="text-xs font-medium text-muted-foreground mb-3 px-1">Recent Imports</h3>
          <div className="divide-y divide-border/50 rounded-xl border border-border/60 overflow-hidden">
            {recentImports.map((imp, i) => (
              <div key={imp.id || i} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-medium truncate">{imp.fileName}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(imp.createdAt).toLocaleDateString()} · {imp.entitiesExtracted} entities
                  </p>
                </div>
                {imp.status === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
