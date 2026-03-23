import { useState, useRef, useCallback } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { calculateManagementScore } from "@toolkit/lib/calculators/management";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Plus, Filter, Trash2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";
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
import { cn } from "@toolkit/lib/utils";
import type { Employee } from "@toolkit/lib/types";
import * as XLSX from "xlsx";

type BulkStep = 'upload' | 'mapping' | 'preview';

interface ParsedRow {
  [key: string]: string | number | boolean | undefined;
}

interface MappedEmployee {
  name: string;
  gender: string;
  race: string;
  designation: string;
  isDisabled: boolean;
  valid: boolean;
  errors: string[];
}

const VALID_GENDERS = ['Male', 'Female'];
const VALID_RACES = ['African', 'Coloured', 'Indian', 'White'];
const VALID_DESIGNATIONS = ['Board', 'Executive', 'Executive Director', 'Other Executive Management', 'Senior', 'Middle', 'Junior'];

const GENDER_MAP: Record<string, string> = {
  'm': 'Male', 'male': 'Male', 'f': 'Female', 'female': 'Female',
};

const RACE_MAP: Record<string, string> = {
  'african': 'African', 'black': 'African', 'a': 'African',
  'coloured': 'Coloured', 'c': 'Coloured',
  'indian': 'Indian', 'i': 'Indian', 'asian': 'Indian',
  'white': 'White', 'w': 'White',
};

const DESIGNATION_MAP: Record<string, string> = {
  'board': 'Board', 'director': 'Board', 'b': 'Board',
  'executive': 'Executive', 'exec': 'Executive', 'e': 'Executive', 'c-suite': 'Executive',
  'senior': 'Senior', 'senior management': 'Senior', 'sm': 'Senior', 's': 'Senior',
  'middle': 'Middle', 'middle management': 'Middle', 'mm': 'Middle',
  'junior': 'Junior', 'junior management': 'Junior', 'jm': 'Junior', 'j': 'Junior',
};

function normalizeGender(val: string): string {
  const clean = val.trim().toLowerCase();
  return GENDER_MAP[clean] || val.trim();
}

function normalizeRace(val: string): string {
  const clean = val.trim().toLowerCase();
  return RACE_MAP[clean] || val.trim();
}

function normalizeDesignation(val: string): string {
  const clean = val.trim().toLowerCase();
  return DESIGNATION_MAP[clean] || val.trim();
}

function normalizeDisabled(val: string | number | boolean | undefined): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') {
    const clean = val.trim().toLowerCase();
    return ['yes', 'true', '1', 'y'].includes(clean);
  }
  return false;
}

function validateMappedEmployee(emp: MappedEmployee): MappedEmployee {
  const errors: string[] = [];
  if (!emp.name || emp.name.trim().length === 0) errors.push('Name is required');
  if (!VALID_GENDERS.includes(emp.gender)) errors.push(`Invalid gender: "${emp.gender}"`);
  if (!VALID_RACES.includes(emp.race)) errors.push(`Invalid race: "${emp.race}"`);
  if (!VALID_DESIGNATIONS.includes(emp.designation)) errors.push(`Invalid designation: "${emp.designation}"`);
  return { ...emp, valid: errors.length === 0, errors };
}

export default function ManagementControl() {
  const { management, addEmployee, removeEmployee, addEmployeesBulk } = useBbeeStore();
  const { toast } = useToast();
  const { employees } = management;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEmp, setNewEmp] = useState({
    name: '',
    gender: 'Female',
    race: 'African',
    designation: 'Senior',
    isDisabled: false
  });

  // Group employees by designation
  const groupedEmployees = employees.reduce((acc, emp) => {
    if (!acc[emp.designation]) {
      acc[emp.designation] = [];
    }
    acc[emp.designation].push(emp);
    return acc;
  }, {} as Record<string, typeof employees>);

  const designations = ['Board', 'Executive Director', 'Other Executive Management', 'Executive', 'Senior', 'Middle', 'Junior'];

  const getRaceColor = (race: string) => {
    switch(race) {
      case 'African': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Coloured': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'Indian': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const handleAdd = () => {
    if (!newEmp.name) {
      toast({ title: "Invalid input", description: "Name is required.", variant: "destructive" });
      return;
    }
    
    addEmployee({
      id: uuidv4(),
      name: newEmp.name,
      gender: newEmp.gender as any,
      race: newEmp.race as any,
      designation: newEmp.designation as any,
      isDisabled: newEmp.isDisabled
    });
    
    setNewEmp({ name: '', gender: 'Female', race: 'African', designation: 'Senior', isDisabled: false });
    setIsAddOpen(false);
    toast({ title: "Employee Added", description: `${newEmp.name} has been added.` });
  };

  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<BulkStep>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileColumns, setFileColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    name: '', gender: '', race: '', designation: '', isDisabled: '',
  });
  const [previewEmployees, setPreviewEmployees] = useState<MappedEmployee[]>([]);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetBulkState = useCallback(() => {
    setBulkStep('upload');
    setParsedRows([]);
    setFileColumns([]);
    setColumnMapping({ name: '', gender: '', race: '', designation: '', isDisabled: '' });
    setPreviewEmployees([]);
    setFileName('');
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(firstSheet, { defval: '' });

        if (jsonData.length === 0) {
          toast({ title: "Empty file", description: "No data rows found in the file.", variant: "destructive" });
          return;
        }

        const cols = Object.keys(jsonData[0]);
        setParsedRows(jsonData);
        setFileColumns(cols);

        const autoMap: Record<string, string> = { name: '', gender: '', race: '', designation: '', isDisabled: '' };
        for (const col of cols) {
          const lower = col.toLowerCase().trim();
          if (['name', 'employee name', 'full name', 'employee', 'fullname'].includes(lower)) autoMap.name = col;
          else if (['gender', 'sex'].includes(lower)) autoMap.gender = col;
          else if (['race', 'ethnicity', 'race group'].includes(lower)) autoMap.race = col;
          else if (['designation', 'level', 'occupational level', 'position', 'management level', 'role'].includes(lower)) autoMap.designation = col;
          else if (['disabled', 'is disabled', 'isdisabled', 'disability', 'pwd'].includes(lower)) autoMap.isDisabled = col;
        }
        setColumnMapping(autoMap);
        setBulkStep('mapping');
      } catch (err) {
        toast({ title: "Parse error", description: "Failed to parse the file. Ensure it is a valid CSV or Excel file.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (e.target) e.target.value = '';
  }, [toast]);

  const handleApplyMapping = useCallback(() => {
    if (!columnMapping.name) {
      toast({ title: "Missing mapping", description: "Name column mapping is required.", variant: "destructive" });
      return;
    }

    const mapped: MappedEmployee[] = parsedRows.map(row => {
      const raw = {
        name: String(row[columnMapping.name] || '').trim(),
        gender: normalizeGender(String(row[columnMapping.gender] || 'Female')),
        race: normalizeRace(String(row[columnMapping.race] || 'African')),
        designation: normalizeDesignation(String(row[columnMapping.designation] || 'Junior')),
        isDisabled: normalizeDisabled(columnMapping.isDisabled ? row[columnMapping.isDisabled] : false),
        valid: true,
        errors: [] as string[],
      };
      return validateMappedEmployee(raw);
    });

    setPreviewEmployees(mapped);
    setBulkStep('preview');
  }, [parsedRows, columnMapping, toast]);

  const handleBulkSave = useCallback(() => {
    const validEmployees: Employee[] = previewEmployees
      .filter(e => e.valid)
      .map(e => ({
        id: uuidv4(),
        name: e.name,
        gender: e.gender as Employee['gender'],
        race: e.race as Employee['race'],
        designation: e.designation as Employee['designation'],
        isDisabled: e.isDisabled,
      }));

    if (validEmployees.length === 0) {
      toast({ title: "No valid records", description: "No valid employee records to import.", variant: "destructive" });
      return;
    }

    addEmployeesBulk(validEmployees);
    toast({ title: "Bulk Import Complete", description: `${validEmployees.length} employees imported successfully.` });
    setIsBulkOpen(false);
    resetBulkState();
  }, [previewEmployees, addEmployeesBulk, toast, resetBulkState]);

  const validCount = previewEmployees.filter(e => e.valid).length;
  const invalidCount = previewEmployees.filter(e => !e.valid).length;

  const mcScore = calculateManagementScore(management);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Management Control</h1>
          <p className="text-muted-foreground mt-1">
            Track workforce demographics across occupational levels (combined MC + EE).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" data-testid="btn-filter-employees">
            <Filter className="h-4 w-4" />
            Filter
          </Button>

          <Button variant="outline" className="gap-2" data-testid="btn-bulk-upload"
            onClick={() => { resetBulkState(); setIsBulkOpen(true); }}>
            <Upload className="h-4 w-4" />
            Bulk Upload
          </Button>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="btn-add-employee">
                <Plus className="h-4 w-4" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Employee</DialogTitle>
                <DialogDescription>
                  Enter the details for the new employee to see the impact on demographics.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Name</Label>
                  <Input id="name" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Level</Label>
                  <Select value={newEmp.designation} onValueChange={(v) => setNewEmp({...newEmp, designation: v})}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Board">Board</SelectItem>
                      <SelectItem value="Executive Director">Executive Director</SelectItem>
                      <SelectItem value="Other Executive Management">Other Executive Management</SelectItem>
                      <SelectItem value="Senior">Senior Management</SelectItem>
                      <SelectItem value="Middle">Middle Management</SelectItem>
                      <SelectItem value="Junior">Junior Management</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Race</Label>
                  <Select value={newEmp.race} onValueChange={(v) => setNewEmp({...newEmp, race: v})}>
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
                  <Select value={newEmp.gender} onValueChange={(v) => setNewEmp({...newEmp, gender: v})}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Disabled</Label>
                  <Select value={newEmp.isDisabled ? "yes" : "no"} onValueChange={(v) => setNewEmp({...newEmp, isDisabled: v === "yes"})}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" onClick={handleAdd}>Save Employee</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-primary text-primary-foreground shadow-md">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs font-medium uppercase tracking-wider mb-1 opacity-80">Total MC Score</p>
            <p className="text-2xl font-bold font-mono">{mcScore.total.toFixed(2)}</p>
            <p className="text-[10px] mt-0.5 opacity-70">of 19</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Board</p>
            <p className="text-2xl font-bold font-mono text-primary">{(mcScore.boardVotingBlack + mcScore.boardVotingBWO).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">of 3</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Exec Mgmt</p>
            <p className="text-2xl font-bold font-mono text-primary">{(mcScore.execDirectorsBlack + mcScore.execDirectorsBWO + mcScore.otherExecBlack + mcScore.otherExecBWO).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">of 6</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 grid grid-cols-2 gap-2 text-center">
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
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel mt-8 mb-8" data-testid="card-mc-detailed-scorecard">
        <CardHeader>
          <CardTitle>Detailed Scorecard Breakdown</CardTitle>
          <CardDescription>Direct translation of GP Excel toolkit calculations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Indicator</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Target</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Weighting</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actual %</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mcScore.subLines.map((sl, idx) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{sl.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{sl.target}</td>
                    <td className="px-4 py-3 text-right font-mono">{sl.weighting.toFixed(0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-primary">
                      {(() => {
                        const statsKey = [
                          'boardBlackPct', 'boardBWOPct',
                          'execBlackPct', 'execBWOPct',
                          'otherExecBlackPct', 'otherExecBWOPct',
                          'seniorBlackPct', 'seniorBWOPct',
                          'middleBlackPct', 'middleBWOPct',
                          'juniorBlackPct', 'juniorBWOPct',
                          'disabledBlackPct',
                        ][idx] as keyof typeof mcScore.rawStats;
                        const val = mcScore.rawStats[statsKey];
                        return val !== undefined ? `${(val * 100).toFixed(2)}%` : '—';
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-primary">{sl.score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-primary/5 font-bold border-t-2 border-primary/20">
                <tr>
                  <td className="px-4 py-4 text-primary font-medium uppercase tracking-wider" colSpan={2}>Total Management Control Score</td>
                  <td className="px-4 py-4 text-right font-mono">19.00</td>
                  <td className="px-4 py-4"></td>
                  <td className="px-4 py-4 text-right font-mono text-lg text-primary">{mcScore.total.toFixed(2)}</td>
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

          return (
            <Card key={level} className="glass-panel" data-testid={`card-level-${level.toLowerCase()}`}>
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {level} Management
                    <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-xs font-normal">
                      {total} Total
                    </Badge>
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
                            {emp.gender.charAt(0)} {emp.isDisabled ? '• Disabled' : ''}
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive shrink-0" onClick={() => removeEmployee(emp.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isBulkOpen} onOpenChange={(open) => { setIsBulkOpen(open); if (!open) resetBulkState(); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Bulk Upload Employees
            </DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file with employee data. Map columns and review before importing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 mb-4">
            {(['upload', 'mapping', 'preview'] as BulkStep[]).map((step, idx) => (
              <div key={step} className="flex items-center gap-2">
                {idx > 0 && <div className={cn("h-px w-6", bulkStep === step || (['mapping', 'preview'].indexOf(bulkStep) >= idx) ? 'bg-primary' : 'bg-border')} />}
                <div className={cn(
                  "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md",
                  bulkStep === step ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                )} data-testid={`bulk-step-${step}`}>
                  <span className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                    bulkStep === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>{idx + 1}</span>
                  {step === 'upload' ? 'Upload' : step === 'mapping' ? 'Map Columns' : 'Preview'}
                </div>
              </div>
            ))}
          </div>

          {bulkStep === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="input-bulk-file"
              />
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover-elevate transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-bulk-upload"
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium">Click to select a file</p>
                <p className="text-xs text-muted-foreground mt-1">Supports CSV, XLSX, XLS formats</p>
              </div>
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <p className="text-xs font-medium mb-2 text-muted-foreground">Expected columns:</p>
                  <div className="flex flex-wrap gap-2">
                    {['Name', 'Gender', 'Race', 'Designation', 'Disabled'].map(col => (
                      <Badge key={col} variant="secondary" className="text-[10px]">{col}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {bulkStep === 'mapping' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <FileSpreadsheet className="h-4 w-4" />
                <span>{fileName}</span>
                <Badge variant="secondary" className="text-[10px]">{parsedRows.length} rows</Badge>
              </div>

              <div className="grid gap-3">
                {[
                  { key: 'name', label: 'Name', required: true },
                  { key: 'gender', label: 'Gender', required: false },
                  { key: 'race', label: 'Race', required: false },
                  { key: 'designation', label: 'Designation / Level', required: false },
                  { key: 'isDisabled', label: 'Disabled', required: false },
                ].map(field => (
                  <div key={field.key} className="grid grid-cols-2 items-center gap-4">
                    <Label className="text-right text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Select
                      value={columnMapping[field.key] || '__none__'}
                      onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [field.key]: v === '__none__' ? '' : v }))}
                    >
                      <SelectTrigger data-testid={`select-map-${field.key}`}><SelectValue placeholder="Select column" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Not mapped --</SelectItem>
                        {fileColumns.map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setBulkStep('upload')} data-testid="btn-bulk-back-upload">Back</Button>
                <Button onClick={handleApplyMapping} data-testid="btn-bulk-apply-mapping">
                  Preview Data
                </Button>
              </DialogFooter>
            </div>
          )}

          {bulkStep === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="font-medium">{validCount}</span>
                  <span className="text-muted-foreground">valid</span>
                </div>
                {invalidCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="font-medium">{invalidCount}</span>
                    <span className="text-muted-foreground">invalid (will be skipped)</span>
                  </div>
                )}
              </div>

              <div className="rounded-md border overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 border-b sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-medium text-muted-foreground w-8"></th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Gender</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Race</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Level</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Disabled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewEmployees.map((emp, idx) => (
                      <tr key={idx} className={cn(
                        "hover:bg-muted/30",
                        !emp.valid && "bg-destructive/5"
                      )} data-testid={`preview-row-${idx}`}>
                        <td className="px-3 py-2">
                          {emp.valid ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium">{emp.name || '—'}</td>
                        <td className="px-3 py-2">{emp.gender}</td>
                        <td className="px-3 py-2">{emp.race}</td>
                        <td className="px-3 py-2">{emp.designation}</td>
                        <td className="px-3 py-2">{emp.isDisabled ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invalidCount > 0 && (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-destructive mb-1">Validation Errors:</p>
                    <div className="space-y-1 max-h-[100px] overflow-y-auto">
                      {previewEmployees.filter(e => !e.valid).slice(0, 10).map((emp, idx) => (
                        <p key={idx} className="text-[11px] text-destructive/80">
                          Row {previewEmployees.indexOf(emp) + 1} ({emp.name || 'unnamed'}): {emp.errors.join(', ')}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setBulkStep('mapping')} data-testid="btn-bulk-back-mapping">Back</Button>
                <Button onClick={handleBulkSave} disabled={validCount === 0} data-testid="btn-bulk-import">
                  Import {validCount} Employee{validCount !== 1 ? 's' : ''}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}