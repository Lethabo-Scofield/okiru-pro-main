import React, { useState, useMemo } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { PillarBulkImport } from "@toolkit/components/bulk/PillarBulkImport";
import { BULK_IMPORT_SPECS } from "@toolkit/components/bulk/bulkImportSpecs";
import { calculateManagementScore } from "@toolkit/lib/calculators/management";
import {
  calculateTransportLargeManagementControl,
  calculateTransportQseManagement,
  isTransportQseSector,
  isTransportLargeSector,
} from "@toolkit/lib/calculators/transport";
import type { EAPGroupBreakdown } from "@toolkit/lib/calculators/management";
import { getProvinces } from "@toolkit/lib/calculators/eapTargets";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { NumberInput } from "@toolkit/components/ui/number-input";
import { Label } from "@toolkit/components/ui/label";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@toolkit/components/ui/tabs";
import { Plus, Pencil, Trash2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Globe, Calendar, MapPin, UserX, ChevronDown, ChevronRight, Wallet, Vote } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@toolkit/components/ui/dialog";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@toolkit/hooks/use-toast";
import { cn, formatRand } from "@toolkit/lib/utils";
import { activeSectorDisplayLabel, pillarBreakdownSubtitle, summarizeSubLines } from "@toolkit/lib/sectors/sector-labels";
import type { Employee } from "@toolkit/lib/types";
import { CalculatorConfigGate } from "@toolkit/components/layout/CalculatorConfigGate";

// Heading shown for each designation group. Using an explicit map avoids the
// "{level} Management" concatenation that produced "Board Management",
// "Other Executive Management Management", "Unskilled Management", etc.
const LEVEL_HEADINGS: Record<string, string> = {
  'Board': 'Board',
  'Executive Director': 'Executive Directors',
  'Other Executive Management': 'Other Executive Management',
  'Executive': 'Executive Management',
  'Senior': 'Senior Management',
  'Middle': 'Middle Management',
  'Skilled Technical': 'Skilled Technical',
  'Junior': 'Junior Management',
  'Semi-skilled': 'Semi-skilled',
  'Unskilled': 'Unskilled',
};

// Helper to check if employee is active during measurement period
function isActiveDuringPeriod(emp: Employee, periodStart?: string, periodEnd?: string): boolean {
  if (!periodStart || !periodEnd) return true; // Assume active if no period set

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const hire = emp.hireDate ? new Date(emp.hireDate) : null;
  const term = emp.terminationDate ? new Date(emp.terminationDate) : null;

  // If hired after period end, not active
  if (hire && hire > end) return false;

  // If terminated before period start, not active
  if (term && term < start) return false;

  return true;
}

interface EmployeeFormState {
  name: string;
  idNumber: string;
  gender: 'Male' | 'Female';
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  // Issue 1: Added new designation levels
  designation: 'Board' | 'Executive' | 'Executive Director' | 'Other Executive Management' | 'Senior' | 'Middle' | 'Junior' | 'Skilled Technical' | 'Semi-skilled' | 'Unskilled';
  isDisabled: boolean;
  isForeign: boolean;
  province?: 'Gauteng' | 'Western Cape' | 'KZN' | 'Eastern Cape' | 'Free State' | 'Limpopo' | 'Mpumalanga' | 'North West' | 'Northern Cape' | 'National';
  hireDate: string;
  terminationDate: string;
  annualSalary: number;
  votingRightsPercent: number;
}

const defaultFormState: EmployeeFormState = {
  name: '',
  idNumber: '',
  gender: 'Female',
  race: 'African',
  designation: 'Senior',
  isDisabled: false,
  isForeign: false,
  province: 'Gauteng',
  hireDate: '',
  terminationDate: '',
  annualSalary: 0,
  votingRightsPercent: 0,
};

export default function ManagementControl() {
  const { management, client, addEmployee, removeEmployee, addEmployeesBulk, updateEmployee, calculatorConfig, updateSettings } = useBbeeStore();
  const { toast } = useToast();
  const { employees } = management;
  const [expandedMcRows, setExpandedMcRows] = useState<Set<number>>(new Set());

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [formState, setFormState] = useState<EmployeeFormState>({ ...defaultFormState });
  const [nameError, setNameError] = useState(false);

  const [showForeignOnly, setShowForeignOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Group employees by designation
  const groupedEmployees = useMemo(() => {
    const filtered = employees.filter(emp => {
      if (showForeignOnly && !emp.isForeign) return false;
      if (!showInactive && emp.terminationDate) {
        // Check if terminated before measurement period
        const isActive = isActiveDuringPeriod(emp, client.measurementPeriodStart, client.measurementPeriodEnd);
        if (!isActive) return false;
      }
      return true;
    });

    return filtered.reduce((acc, emp) => {
      if (!acc[emp.designation]) {
        acc[emp.designation] = [];
      }
      acc[emp.designation].push(emp);
      return acc;
    }, {} as Record<string, typeof employees>);
  }, [employees, showForeignOnly, showInactive, client.measurementPeriodStart, client.measurementPeriodEnd]);

  // Issue 1: Added new designation levels
  const designations = ['Board', 'Executive Director', 'Other Executive Management', 'Executive', 'Senior', 'Middle', 'Skilled Technical', 'Junior', 'Semi-skilled', 'Unskilled'];

  const getRaceColor = (race: string) => {
    switch(race) {
      case 'African': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Coloured': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'Indian': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const handleAdd = () => {
    if (!formState.name.trim()) {
      setNameError(true);
      setActiveTab("basic");
      toast({ title: "Invalid input", description: "Name is required.", variant: "destructive" });
      return;
    }
    
    const newEmployee: Employee = {
      id: uuidv4(),
      name: formState.name,
      idNumber: formState.idNumber || undefined,
      gender: formState.gender,
      race: formState.race,
      designation: formState.designation,
      isDisabled: formState.isDisabled,
      isForeign: formState.isForeign,
      province: formState.province,
      hireDate: formState.hireDate || undefined,
      terminationDate: formState.terminationDate || undefined,
      annualSalary: formState.annualSalary || undefined,
      votingRightsPercent: formState.votingRightsPercent || undefined,
    };
    
    addEmployee(newEmployee);
    
    setFormState({ ...defaultFormState });
    setActiveTab("basic");
    setIsAddOpen(false);
    toast({ 
      title: "Employee Added", 
      description: `${formState.name} has been added.${formState.isForeign ? ' (Foreign national - excluded from BEE calculations)' : ''}` 
    });
  };

  const handleEditOpen = (emp: Employee) => {
    setEditingId(emp.id);
    setFormState({
      name: emp.name,
      idNumber: emp.idNumber || '',
      gender: emp.gender,
      race: emp.race,
      designation: emp.designation,
      isDisabled: emp.isDisabled,
      isForeign: emp.isForeign || false,
      province: emp.province || 'Gauteng',
      hireDate: emp.hireDate || '',
      terminationDate: emp.terminationDate || '',
      annualSalary: emp.annualSalary || 0,
      votingRightsPercent: emp.votingRightsPercent || 0,
    });
    setNameError(false);
    setIsEditOpen(true);
  };

  const handleEditSave = () => {
    if (!editingId || !formState.name.trim()) {
      setNameError(true);
      setActiveTab("basic");
      toast({ title: "Invalid input", description: "Name is required.", variant: "destructive" });
      return;
    }

    updateEmployee(editingId, {
      name: formState.name,
      idNumber: formState.idNumber || undefined,
      gender: formState.gender,
      race: formState.race,
      designation: formState.designation,
      isDisabled: formState.isDisabled,
      isForeign: formState.isForeign,
      province: formState.province,
      hireDate: formState.hireDate || undefined,
      terminationDate: formState.terminationDate || undefined,
      annualSalary: formState.annualSalary || undefined,
      votingRightsPercent: formState.votingRightsPercent || undefined,
    });

    setIsEditOpen(false);
    setEditingId(null);
    setFormState({ ...defaultFormState });
    toast({ title: "Employee Updated", description: `${formState.name} has been updated.` });
  };


  if (!calculatorConfig) return <CalculatorConfigGate>{null}</CalculatorConfigGate>;
  const isQse = String(calculatorConfig.scorecardType ?? '').toUpperCase() === 'QSE';
  const mcCfg = calculatorConfig.managementControl;
  const mcMax =
    calculatorConfig.pillarConfigs?.managementControl?.maxPoints ??
    mcCfg?.maxPoints ??
    19;
  const boardMaxPts =
    (mcCfg?.boardBlackMaxPts ?? 2) + (mcCfg?.boardBWMaxPts ?? 1);
  const execMgmtMaxPts =
    (mcCfg?.execBlackMaxPts ?? 2) +
    (mcCfg?.execBWMaxPts ?? 1) +
    (mcCfg?.otherExecBlackMaxPts ?? 2) +
    (mcCfg?.otherExecBWMaxPts ?? 1);
  const smjNotAvailable =
    (mcCfg?.seniorMaxPts ?? 0) === 0 &&
    (mcCfg?.middleMaxPts ?? 0) === 0 &&
    (mcCfg?.juniorMaxPts ?? 0) === 0;
  // eapYear MUST be passed exactly as the store passes it (store.ts calculateScorecard).
  // EAP targets are year-dependent, so omitting it made this page compute the
  // management score against a DIFFERENT year's EAP table than the scorecard —
  // the same client, two different Management Control scores depending on which
  // screen you opened. The store is the source of truth; this page mirrors it.
  const mcScore = calculateManagementScore(management, calculatorConfig, client.eapProvince, client.eapYear);

  // Transport clients are SCORED by the Transport calculators (store routing),
  // so the breakdown must come from the SAME calculators — this page used to
  // show RCOGP-shaped sub-lines and a 19-pt weighting for a client whose real
  // MC score is the 27-pt (QSE) / 11-pt (Large) Transport scorecard
  // ("breakdowns don't link to the system").
  const transportMc = isTransportQseSector(client.sectorCode, calculatorConfig?.scorecardType)
    ? calculateTransportQseManagement(management, calculatorConfig)
    : isTransportLargeSector(client.sectorCode, calculatorConfig?.scorecardType)
      ? calculateTransportLargeManagementControl(management, calculatorConfig)
      : null;
  const displaySubLines = transportMc?.subLines ?? mcScore.subLines;
  const displayTotal = transportMc ? transportMc.score : mcScore.total;
  const displayMax = transportMc ? transportMc.maxPoints : mcMax;
  const mcTotalWeighting = displaySubLines.reduce((sum, sl) => sum + sl.weighting, 0);
  // Base vs bonus, derived from the sub-lines actually being displayed — so the
  // footer reports the element's weighting rather than the bonus-inflated cap.
  const mcWeightingSplit = (() => {
    const { basePoints, bonusPoints } = summarizeSubLines(displaySubLines);
    return { base: basePoints, bonus: bonusPoints };
  })();

  const eapLevelMap: Record<number, string> = {};
  if (!smjNotAvailable && !transportMc) {
    mcScore.subLines.forEach((sl, idx) => {
      if (sl.weighting <= 0 || !sl.target.includes('(EAP)')) return;
      const name = sl.name.toLowerCase();
      if (name.includes('senior management')) eapLevelMap[idx] = 'senior';
      else if (name.includes('middle management')) eapLevelMap[idx] = 'middle';
      else if (name.includes('junior management')) eapLevelMap[idx] = 'junior';
    });
  }

  // Foreign employee count (for display)
  const foreignCount = employees.filter(e => e.isForeign).length;
  const totalCount = employees.length;
  const totalAnnualSalary = employees.reduce((acc, e) => acc + (e.annualSalary || 0), 0);

  const employeeFormFields = () => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="employment">Employment Details</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="emp-name" className="text-right">Name</Label>
          <div className="col-span-3 space-y-1">
            <Input
              id="emp-name"
              value={formState.name}
              onChange={e => { setFormState({...formState, name: e.target.value}); if (nameError) setNameError(false); }}
              aria-invalid={nameError}
              aria-describedby={nameError ? "emp-name-error" : undefined}
              className={cn(nameError && "border-destructive focus-visible:ring-destructive")}
            />
            {nameError && <p id="emp-name-error" className="text-xs text-destructive">Name is required.</p>}
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="emp-id" className="text-right">ID Number</Label>
          <Input 
            id="emp-id" 
            value={formState.idNumber} 
            onChange={e => setFormState({...formState, idNumber: e.target.value})} 
            className="col-span-3" 
            placeholder="SA ID or Passport (optional)"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">Level</Label>
          <Select value={formState.designation} onValueChange={(v) => setFormState({...formState, designation: v as typeof formState.designation})}>
            <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Board">Board</SelectItem>
              <SelectItem value="Executive Director">Executive Director</SelectItem>
              <SelectItem value="Other Executive Management">Other Executive Management</SelectItem>
              <SelectItem value="Executive">Executive</SelectItem>
              <SelectItem value="Senior">Senior Management</SelectItem>
              <SelectItem value="Middle">Middle Management</SelectItem>
              <SelectItem value="Skilled Technical">Skilled Technical</SelectItem>
              <SelectItem value="Junior">Junior Management</SelectItem>
              <SelectItem value="Semi-skilled">Semi-skilled</SelectItem>
              <SelectItem value="Unskilled">Unskilled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">Race</Label>
          <Select value={formState.race} onValueChange={(v) => setFormState({...formState, race: v as typeof formState.race})}>
            <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="African">African</SelectItem>
              <SelectItem value="Coloured">Coloured</SelectItem>
              <SelectItem value="Indian">Indian</SelectItem>
              <SelectItem value="White">White</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">Gender</Label>
          <Select value={formState.gender} onValueChange={(v) => setFormState({...formState, gender: v as typeof formState.gender})}>
            <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Male">Male</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">Disabled</Label>
          <Select value={formState.isDisabled ? "yes" : "no"} onValueChange={(v) => setFormState({...formState, isDisabled: v === "yes"})}>
            <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </TabsContent>

      <TabsContent value="employment" className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-start gap-4">
          <Label className="text-right pt-2">Status</Label>
          <div className="col-span-3 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="is-foreign" 
                checked={formState.isForeign}
                onCheckedChange={(checked) => setFormState({ ...formState, isForeign: checked === true })}
              />
              <Label htmlFor="is-foreign" className="text-sm cursor-pointer flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Foreign National
                {formState.isForeign && (
                  <span className="text-amber-600 text-xs ml-1">(excluded from BEE calculations)</span>
                )}
              </Label>
            </div>
            {formState.isForeign && (
              <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Foreign nationals are excluded from all Management Control BEE calculations
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Province
            </div>
          </Label>
          <Select 
            value={formState.province} 
            onValueChange={(v) => setFormState({...formState, province: v as typeof formState.province})}
          >
            <SelectTrigger className="col-span-3"><SelectValue placeholder="Select province" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Gauteng">Gauteng</SelectItem>
              <SelectItem value="Western Cape">Western Cape</SelectItem>
              <SelectItem value="KZN">KwaZulu-Natal</SelectItem>
              <SelectItem value="Eastern Cape">Eastern Cape</SelectItem>
              <SelectItem value="Free State">Free State</SelectItem>
              <SelectItem value="Limpopo">Limpopo</SelectItem>
              <SelectItem value="Mpumalanga">Mpumalanga</SelectItem>
              <SelectItem value="North West">North West</SelectItem>
              <SelectItem value="Northern Cape">Northern Cape</SelectItem>
              <SelectItem value="National">National (Head Office)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="hire-date" className="text-right">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Hire Date
            </div>
          </Label>
          <Input 
            id="hire-date"
            type="date"
            value={formState.hireDate} 
            onChange={e => setFormState({...formState, hireDate: e.target.value})} 
            className="col-span-3" 
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="term-date" className="text-right">
            <div className="flex items-center gap-1">
              <UserX className="h-3 w-3" />
              Termination
            </div>
          </Label>
          <Input 
            id="term-date"
            type="date"
            value={formState.terminationDate} 
            onChange={e => setFormState({...formState, terminationDate: e.target.value})} 
            className="col-span-3" 
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="annual-salary" className="text-right">
            <div className="flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              Annual Salary (R)
            </div>
          </Label>
          <NumberInput
            id="annual-salary"
            min={0}
            value={formState.annualSalary}
            onValueChange={v => setFormState({...formState, annualSalary: v})}
            className="col-span-3"
            placeholder="Total annual salary / cost to company"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="voting-rights" className="text-right">
            <div className="flex items-center gap-1">
              <Vote className="h-3 w-3" />
              Voting Rights %
            </div>
          </Label>
          <NumberInput
            id="voting-rights"
            min={0}
            max={100}
            value={formState.votingRightsPercent}
            onValueChange={v => setFormState({...formState, votingRightsPercent: v})}
            className="col-span-3"
            placeholder="% of voting rights held (0-100)"
          />
        </div>
      </TabsContent>
    </Tabs>
  );

  // Issue 1: Updated page heading to reflect MC+EE combined pillar
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Management Control & Employment Equity</h1>
          <p className="text-muted-foreground mt-1">
            Track workforce demographics with employment dates, foreign national exclusion, and Employment Equity levels.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isQse && (
            <div className="flex items-center gap-2 mr-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">EAP Province:</Label>
              <Select
                value={client.eapProvince || 'National'}
                onValueChange={(v) => updateSettings(v, client.industrySector || '', client.measurementPeriodStart, client.measurementPeriodEnd)}
              >
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getProvinces().map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button 
            variant="outline" 
            className={cn("gap-2", showForeignOnly && "bg-amber-100 border-amber-300")}
            onClick={() => setShowForeignOnly(!showForeignOnly)}
          >
            <Globe className="h-4 w-4" />
            {showForeignOnly ? 'Show All' : `Foreign (${foreignCount})`}
          </Button>

          <Button 
            variant="outline" 
            className={cn("gap-2", showInactive && "bg-slate-100")}
            onClick={() => setShowInactive(!showInactive)}
          >
            <UserX className="h-4 w-4" />
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </Button>

          <PillarBulkImport
            spec={BULK_IMPORT_SPECS["management-control"]}
            existing={employees}
            onImport={(rows, mode) => {
              if (mode === "replace") employees.forEach((e) => removeEmployee(e.id));
              addEmployeesBulk(rows);
            }}
          />

          <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) { setFormState({ ...defaultFormState }); setActiveTab("basic"); setNameError(false); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add Employee</DialogTitle>
                <DialogDescription>
                  Enter employee details. Foreign nationals are excluded from BEE calculations.
                </DialogDescription>
              </DialogHeader>
              {employeeFormFields()}
              <DialogFooter>
                <Button type="submit" onClick={handleAdd}>Save Employee</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/*
        Gated on `!transportMc` and labelled from the live config.
        `smjNotAvailable` is a STRUCTURAL test (Senior/Middle/Junior all zero), and
        it is true for eight configs — the four FSC ones, Transport QSE and all
        three Construction. Hardcoding "FSC" therefore told every Transport and
        Construction client they were being measured under the Financial Sector
        Code. Transport is excluded outright: it does not use this page's generic
        MC calculator at all (see `transportMc`), so the banner described a
        scorecard that was not being applied.
        The Other-Exec targets are read from the config rather than the old
        literal "75% / 38%", which is FSC Others' shape and not every sector's.
      */}
      {smjNotAvailable && !transportMc && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <strong>{activeSectorDisplayLabel(client, calculatorConfig)} Management Control:</strong>{" "}
          Senior, Middle, and Junior bands are <strong>NOT AVAILABLE</strong> (0 pts each) on this
          scorecard. Scoring applies to Board, Executive Directors, Other Executive Management
          {typeof mcCfg?.otherExecBlackTarget === "number" && typeof mcCfg?.otherExecBWTarget === "number"
            ? ` (${(mcCfg.otherExecBlackTarget * 100).toFixed(0)}% / ${(mcCfg.otherExecBWTarget * 100).toFixed(0)}% targets)`
            : ""}
          , and Employees with Disabilities only.
        </div>
      )}

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingId(null); setFormState({ ...defaultFormState }); setActiveTab("basic"); setNameError(false); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>
              Update employee details.
            </DialogDescription>
          </DialogHeader>
          {employeeFormFields()}
          <DialogFooter>
            <Button type="submit" onClick={handleEditSave}>Update Employee</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-primary text-primary-foreground shadow-md">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs font-medium uppercase tracking-wider mb-1 opacity-80">Total MC Score</p>
            <p className="text-2xl font-bold font-mono">{displayTotal.toFixed(2)}</p>
            <p className="text-[10px] mt-0.5 opacity-70">of {displayMax}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20" data-testid="card-total-annual-salary">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1 flex items-center gap-1">
              <Wallet className="h-3 w-3" /> Total Annual Salary
            </p>
            <p className="text-2xl font-bold font-mono text-primary" data-testid="text-total-annual-salary">
              {formatRand(totalAnnualSalary)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">across {totalCount} employees</p>
          </CardContent>
        </Card>
        {!transportMc && (<Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Board</p>
            <p className="text-2xl font-bold font-mono text-primary">{(mcScore.boardVotingBlack + mcScore.boardVotingBWO).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">of {boardMaxPts}</p>
          </CardContent>
        </Card>)}
        {!transportMc && (<Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Exec Mgmt</p>
            <p className="text-2xl font-bold font-mono text-primary">{(mcScore.execDirectorsBlack + mcScore.execDirectorsBWO + mcScore.otherExecBlack + mcScore.otherExecBWO).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">of {execMgmtMaxPts}</p>
          </CardContent>
        </Card>)}
        {!transportMc && (<Card className="border-border/50">
          <CardContent className="p-4 grid grid-cols-2 gap-2 text-center">
            {smjNotAvailable ? (
              <>
                <div>
                  <p className="text-[10px] text-muted-foreground">Senior</p>
                  <p className="text-sm font-bold font-mono text-muted-foreground">N/A</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Middle</p>
                  <p className="text-sm font-bold font-mono text-muted-foreground">N/A</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Junior</p>
                  <p className="text-sm font-bold font-mono text-muted-foreground">N/A</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Disabled</p>
                  <p className="text-sm font-bold font-mono">{mcScore.disabled.toFixed(2)}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[10px] text-muted-foreground">Senior</p>
                  <p className="text-sm font-bold font-mono">{(mcScore.seniorBlack + mcScore.seniorBWO).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Middle</p>
                  <p className="text-sm font-bold font-mono">{(mcScore.middleBlack + mcScore.middleBWO).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Junior</p>
                  <p className="text-sm font-bold font-mono">{(mcScore.juniorBlack + mcScore.juniorBWO).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Disabled</p>
                  <p className="text-sm font-bold font-mono">{mcScore.disabled.toFixed(2)}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>)}
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle>Detailed Scorecard Breakdown</CardTitle>
              <CardDescription>
                {pillarBreakdownSubtitle(
                  displaySubLines,
                  client,
                  calculatorConfig,
                  transportMc ? 'Transport sector scorecard — same calculator as the score' : 'click EAP rows to see per-demographic breakdown',
                )}
              </CardDescription>
            </div>
            {!transportMc && (<Badge variant="outline" className="text-xs">
              <Globe className="h-3 w-3 mr-1" />
              EAP: {mcScore.eapProvince || 'National'}
            </Badge>)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Indicator</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Target</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Weighting</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Actual %</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displaySubLines.map((sl, idx) => {
                  const isNotAvailable = sl.weighting === 0 && sl.name.includes('NOT AVAILABLE');
                  const statsKeyByName: Record<string, keyof typeof mcScore.rawStats> = {
                    'Exercisable voting rights of black board members': 'boardBlackPct',
                    'Exercisable voting rights of black female board members': 'boardBWOPct',
                    'Black executive directors': 'execBlackPct',
                    'Black female executive directors': 'execBWOPct',
                    'Black other executive management': 'otherExecBlackPct',
                    'Black female other executive management': 'otherExecBWOPct',
                    'Black employees in senior management': 'seniorBlackPct',
                    'Black female employees in senior management': 'seniorBWOPct',
                    'Black employees in middle management': 'middleBlackPct',
                    'Black female employees in middle management': 'middleBWOPct',
                    'Black employees in junior management (incl. Semi-skilled & Unskilled)': 'juniorBlackPct',
                    'Black female employees in junior management (incl. Semi-skilled & Unskilled)': 'juniorBWOPct',
                    'Black employees with disabilities': 'disabledBlackPct',
                  };
                  const statsKey = statsKeyByName[sl.name];
                  const actualPct = statsKey ? mcScore.rawStats[statsKey] : undefined;
                  const eapLevel = eapLevelMap[idx];
                  const hasBreakdown = !!eapLevel;
                  const isExpanded = expandedMcRows.has(idx);
                  const breakdown = eapLevel ? mcScore.eapBreakdowns[eapLevel] : undefined;

                  return (
                    <React.Fragment key={idx}>
                      <tr
                        className={cn(
                          isNotAvailable ? "bg-muted/20 text-muted-foreground" : "hover:bg-muted/30",
                          hasBreakdown && "cursor-pointer",
                          sl.isBonus && "bg-amber-50/50 dark:bg-amber-950/20",
                        )}
                        onClick={() => {
                          if (!hasBreakdown) return;
                          setExpandedMcRows(prev => {
                            const next = new Set(prev);
                            next.has(idx) ? next.delete(idx) : next.add(idx);
                            return next;
                          });
                        }}
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {hasBreakdown && (isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />)}
                            {sl.isBonus && <Badge variant="outline" className="text-[9px] bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">Bonus</Badge>}
                            {sl.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{sl.target}</td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          {isNotAvailable ? '—' : sl.weighting.toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                          {isNotAvailable ? '—' : actualPct !== undefined ? `${(actualPct * 100).toFixed(2)}%` : '—'}
                        </td>
                        <td className={cn(
                          "px-4 py-3 text-right font-mono font-bold whitespace-nowrap",
                          isNotAvailable ? "text-muted-foreground" : "text-primary",
                        )}>
                          {isNotAvailable ? '—' : sl.score.toFixed(2)}
                        </td>
                      </tr>
                      {isExpanded && breakdown && (
                        <tr className="bg-muted/10">
                          <td colSpan={5} className="px-6 py-2">
                            <div className="grid grid-cols-4 gap-2 text-xs sm:grid-cols-8">
                              {breakdown.map((bg) => {
                                const groupLabels: Record<string, string> = {
                                  AM: 'African M', CM: 'Coloured M', IM: 'Indian M', WM: 'White M',
                                  AF: 'African F', CF: 'Coloured F', IF: 'Indian F', WF: 'White F',
                                };
                                const isBlackGroup = !bg.group.startsWith('W');
                                return (
                                  <div key={bg.group} className={cn("text-center p-2 rounded border", isBlackGroup ? "bg-card/50" : "bg-muted/30")}>
                                    <div className="font-semibold text-foreground text-[10px]">{groupLabels[bg.group] ?? bg.group}</div>
                                    {isBlackGroup && bg.eapTarget > 0 && (
                                      <div className="text-muted-foreground mt-0.5">EAP: {(bg.eapTarget * 100).toFixed(1)}%</div>
                                    )}
                                    <div className={cn("font-mono mt-0.5", isBlackGroup && bg.eapTarget > 0 ? (bg.actual >= bg.eapTarget ? "text-emerald-600" : "text-amber-600") : "text-muted-foreground")}>
                                      {(bg.actual * 100).toFixed(1)}%
                                    </div>
                                    <div className="text-muted-foreground/60">{bg.count}/{bg.totalInLevel}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-primary/5 font-bold border-t-2 border-primary/20">
                <tr>
                  <td className="px-4 py-4 text-primary font-medium uppercase tracking-wider" colSpan={2}>Total Management Control Score</td>
                  {/* Element weighting and bonus stated separately, as the Codes
                      state them — Transport QSE MC is 25 + 2, not a merged 27. */}
                  <td className="px-4 py-4 text-right font-mono whitespace-nowrap">
                    {mcWeightingSplit.base.toFixed(2)}
                    {mcWeightingSplit.bonus > 0 && (
                      <span className="block text-[10px] font-normal text-amber-600 dark:text-amber-400">
                        + {mcWeightingSplit.bonus.toFixed(2)} bonus
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4"></td>
                  <td className="px-4 py-4 text-right font-mono text-lg text-primary whitespace-nowrap">{mcScore.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        {designations.map((level) => {
          const levelEmployees = groupedEmployees[level] || [];
          if (levelEmployees.length === 0) return null;

          const total = levelEmployees.length;
          const blackCount = levelEmployees.filter(e => ['African', 'Coloured', 'Indian'].includes(e.race)).length;
          const femaleCount = levelEmployees.filter(e => e.gender === 'Female').length;
          const foreignCount = levelEmployees.filter(e => e.isForeign).length;

          return (
            <Card key={level} className="glass-panel">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {LEVEL_HEADINGS[level] ?? level}
                    <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-xs font-normal">
                      {total} Total
                    </Badge>
                    {foreignCount > 0 && (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                        <Globe className="h-3 w-3 mr-1" />
                        {foreignCount} Foreign
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <div>Black: <span className="font-semibold text-foreground">{(blackCount/total*100).toFixed(0)}%</span></div>
                    <div>Female: <span className="font-semibold text-foreground">{(femaleCount/total*100).toFixed(0)}%</span></div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {levelEmployees.map(emp => (
                    <div key={emp.id} className="flex items-center p-3 rounded-lg border bg-card/50 hover:bg-card hover-elevate transition-all group">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold mr-3 shrink-0">
                        {emp.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{emp.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-sm font-medium", getRaceColor(emp.race))}>
                            {emp.race.charAt(0)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {emp.gender.charAt(0)}
                            {emp.isDisabled ? ' • D' : ''}
                            {emp.isForeign ? ' • F' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditOpen(emp)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => removeEmployee(emp.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

    </div>
  );
}
