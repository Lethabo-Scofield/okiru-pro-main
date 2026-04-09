/**
 * Management Control Form - DocumentProcessor Integration
 * 
 * Wraps management control data entry for use in DocumentProcessor Build flow.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Users,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  Upload,
  Download
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@toolkit/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@toolkit/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@toolkit/components/ui/tabs";
import { v4 as uuidv4 } from "uuid";
import { cn } from "@toolkit/lib/utils";
import type { Employee, ManagementData } from "@toolkit/lib/types";
import type { CalculatorConfig } from "@shared/schema";
import { calculateManagementScore } from "@toolkit/lib/calculators/management";
import { useBbeeStore } from "@toolkit/lib/store";

// ============================================================================
// Types & Constants
// ============================================================================

interface ManagementFormProps {
  data: ManagementData;
  onChange: (data: ManagementData) => void;
  /** EAP province for Senior/Middle/Junior targets (defaults to National). */
  eapProvince?: string;
  className?: string;
}

// Issue 1: Added new designation levels 'Skilled Technical', 'Semi-skilled', 'Unskilled'
interface EmployeeFormState {
  id?: string;
  name: string;
  idNumber: string;
  gender: 'Male' | 'Female';
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  designation: 'Board' | 'Executive' | 'Executive Director' | 'Other Executive Management' | 'Senior' | 'Middle' | 'Junior' | 'Skilled Technical' | 'Semi-skilled' | 'Unskilled';
  isDisabled: boolean;
  isForeign: boolean;
  province?: 'Gauteng' | 'Western Cape' | 'KZN' | 'Eastern Cape' | 'Free State' | 'Limpopo' | 'Mpumalanga' | 'North West' | 'Northern Cape' | 'National';
  hireDate?: string;
  terminationDate?: string;
}

const RACE_OPTIONS: { value: EmployeeFormState['race']; label: string }[] = [
  { value: 'African', label: 'African' },
  { value: 'Coloured', label: 'Coloured' },
  { value: 'Indian', label: 'Indian/Asian' },
  { value: 'White', label: 'White' },
];

const GENDER_OPTIONS: { value: EmployeeFormState['gender']; label: string }[] = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
];

// Issue 1: Added new designation levels
const DESIGNATION_OPTIONS: { value: EmployeeFormState['designation']; label: string }[] = [
  { value: 'Board', label: 'Board Member' },
  { value: 'Executive', label: 'Executive (Combined)' },
  { value: 'Executive Director', label: 'Executive Director' },
  { value: 'Other Executive Management', label: 'Other Executive Management' },
  { value: 'Senior', label: 'Senior Management' },
  { value: 'Middle', label: 'Middle Management' },
  { value: 'Skilled Technical', label: 'Skilled Technical' },
  { value: 'Junior', label: 'Junior Management' },
  { value: 'Semi-skilled', label: 'Semi-skilled' },
  { value: 'Unskilled', label: 'Unskilled' },
];

const PROVINCE_OPTIONS: EmployeeFormState['province'][] = [
  'Eastern Cape', 'Free State', 'Gauteng', 'KZN', 'Limpopo',
  'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape', 'National'
];

const emptyEmployeeForm: EmployeeFormState = {
  name: '',
  idNumber: '',
  gender: 'Male',
  race: 'African',
  designation: 'Junior',
  isDisabled: false,
  isForeign: false,
  province: 'National',
};

const BLACK_RACES = ['African', 'Coloured', 'Indian'];

// ============================================================================
// Component
// ============================================================================

export function ManagementForm({ data, onChange, eapProvince, className }: ManagementFormProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<EmployeeFormState>(emptyEmployeeForm);
  const [activeTab, setActiveTab] = useState('employees');
  const [showForeignOnly, setShowForeignOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Calculate metrics
  const metrics = useMemo(() => {
    const employees = data.employees || [];
    const nonForeignEmployees = employees.filter(e => !e.isForeign);
    
    const byDesignation = (designation: string) => 
      nonForeignEmployees.filter(e => e.designation === designation);
    
    const calculateBlackPct = (group: Employee[]) => {
      if (group.length === 0) return 0;
      return (group.filter(e => BLACK_RACES.includes(e.race)).length / group.length) * 100;
    };
    
    const board = byDesignation('Board');
    const exec = byDesignation('Executive Director');
    const otherExec = byDesignation('Other Executive Management');
    const senior = byDesignation('Senior');
    const middle = byDesignation('Middle');
    const junior = byDesignation('Junior');
    
    return {
      totalEmployees: employees.length,
      nonForeignCount: nonForeignEmployees.length,
      foreignCount: employees.filter(e => e.isForeign).length,
      disabledCount: employees.filter(e => e.isDisabled).length,
      board: { count: board.length, blackPct: calculateBlackPct(board) },
      exec: { count: exec.length, blackPct: calculateBlackPct(exec) },
      otherExec: { count: otherExec.length, blackPct: calculateBlackPct(otherExec) },
      senior: { count: senior.length, blackPct: calculateBlackPct(senior) },
      middle: { count: middle.length, blackPct: calculateBlackPct(middle) },
      junior: { count: junior.length, blackPct: calculateBlackPct(junior) },
    };
  }, [data.employees]);

  // Calculate score
  const calculatorConfig = useBbeeStore(state => state.calculatorConfig);
  const scoreResult = useMemo(() => {
    if (!calculatorConfig) return { total: 0, subMinimumMet: false, subLines: [], disabled: 0, rawStats: {} as any };
    return calculateManagementScore(data, calculatorConfig, eapProvince);
  }, [data, eapProvince, calculatorConfig]);

  // Filter employees
  const filteredEmployees = useMemo(() => {
    let filtered = data.employees || [];
    if (showForeignOnly) {
      filtered = filtered.filter(e => e.isForeign);
    }
    return filtered;
  }, [data.employees, showForeignOnly]);

  // Add/edit employee
  const handleSaveEmployee = useCallback(() => {
    const employeeData: Employee = {
      id: editingId || uuidv4(),
      name: formState.name,
      idNumber: formState.idNumber,
      gender: formState.gender,
      race: formState.race,
      designation: formState.designation,
      isDisabled: formState.isDisabled,
      isForeign: formState.isForeign,
      province: formState.province,
      hireDate: formState.hireDate,
      terminationDate: formState.terminationDate,
    };

    let newEmployees: Employee[];
    if (editingId) {
      newEmployees = data.employees.map(e => 
        e.id === editingId ? employeeData : e
      );
    } else {
      newEmployees = [...data.employees, employeeData];
    }

    onChange({
      ...data,
      employees: newEmployees,
    });

    setIsDialogOpen(false);
    setEditingId(null);
    setFormState(emptyEmployeeForm);
  }, [formState, editingId, data, onChange]);

  // Remove employee
  const handleRemoveEmployee = useCallback((id: string) => {
    onChange({
      ...data,
      employees: data.employees.filter(e => e.id !== id),
    });
  }, [data, onChange]);

  // Edit employee
  const handleEditEmployee = useCallback((employee: Employee) => {
    setFormState({
      id: employee.id,
      name: employee.name,
      idNumber: employee.idNumber || '',
      gender: employee.gender,
      race: employee.race,
      designation: employee.designation,
      isDisabled: employee.isDisabled || false,
      isForeign: employee.isForeign || false,
      province: employee.province,
      hireDate: employee.hireDate,
      terminationDate: employee.terminationDate,
    });
    setEditingId(employee.id);
    setIsDialogOpen(true);
  }, []);

  // Bulk upload handler (placeholder)
  const handleBulkUpload = useCallback(() => {
    // This would open a file picker and process CSV/Excel
    alert('Bulk upload would open here - implement CSV/Excel parsing');
  }, []);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Score Overview - Issue 1: Updated header name */}
      <Card className="border-border/80 bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
                <Briefcase className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">Management Control & Employment Equity Score</div>
                <div className="text-sm text-muted-foreground">
                  Based on Board, Executive, EAP targets, and Employment Equity levels
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{scoreResult.total.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground">of 19 points</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Board', metric: metrics.board, target: '50-60%' },
          { label: 'Executive', metric: metrics.exec, target: '60%' },
          { label: 'Other Exec', metric: metrics.otherExec, target: '50%' },
          { label: 'Senior', metric: metrics.senior, target: '60%' },
          { label: 'Middle', metric: metrics.middle, target: '75%' },
          { label: 'Junior', metric: metrics.junior, target: '88%' },
        ].map(({ label, metric, target }) => (
          <Card key={label} className="p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-lg font-bold">{metric.blackPct.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">
              {metric.count} employees • Target: {target}
            </div>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="summary">Summary & Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Employees</h3>
              <Badge variant="outline">{metrics.totalEmployees} total</Badge>
              {metrics.foreignCount > 0 && (
                <Badge variant="secondary">{metrics.foreignCount} foreign</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showForeign"
                  checked={showForeignOnly}
                  onCheckedChange={(checked) => setShowForeignOnly(checked as boolean)}
                />
                <Label htmlFor="showForeign" className="text-sm">Foreign Only</Label>
              </div>
              <Button variant="outline" size="sm" onClick={handleBulkUpload} className="gap-2">
                <Upload className="h-4 w-4" />
                Bulk Upload
              </Button>
              <Button size="sm" onClick={() => {
                setFormState(emptyEmployeeForm);
                setEditingId(null);
                setIsDialogOpen(true);
              }} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Employee
              </Button>
            </div>
          </div>

          {/* Employee List */}
          {filteredEmployees.length === 0 ? (
            <Card className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-medium mb-2">No employees added</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add employees to calculate management control scores
              </p>
              <Button onClick={() => {
                setFormState(emptyEmployeeForm);
                setEditingId(null);
                setIsDialogOpen(true);
              }} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add First Employee
              </Button>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredEmployees.map((employee) => (
                <Card key={employee.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{employee.name}</span>
                        {employee.isForeign && (
                          <Badge variant="outline" className="text-amber-600">Foreign</Badge>
                        )}
                        {employee.isDisabled && (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1 text-sm text-muted-foreground">
                        <span>{employee.designation}</span>
                        <span>•</span>
                        <span>{employee.race}</span>
                        <span>•</span>
                        <span>{employee.gender}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditEmployee(employee)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveEmployee(employee.id)}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>EAP Target Analysis</CardTitle>
              <CardDescription>
                Comparison against Economically Active Population targets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This section would show EAP target achievement per occupational level.
                  Requires province-specific EAP data.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Employee Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Employee' : 'Add Employee'}
            </DialogTitle>
            <DialogDescription>
              Enter employee details for management control scoring
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="details">Employment Details</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="empName">Full Name *</Label>
                <Input
                  id="empName"
                  value={formState.name}
                  onChange={(e) => setFormState(s => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Thandi Mokoena"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="empIdNumber">ID Number / Passport</Label>
                <Input
                  id="empIdNumber"
                  value={formState.idNumber}
                  onChange={(e) => setFormState(s => ({ ...s, idNumber: e.target.value }))}
                  placeholder="e.g. 850101 1234 087"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="empRace">Race</Label>
                  <Select
                    value={formState.race}
                    onValueChange={(v) => setFormState(s => ({ ...s, race: v as any }))}
                  >
                    <SelectTrigger id="empRace">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RACE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empGender">Gender</Label>
                  <Select
                    value={formState.gender}
                    onValueChange={(v) => setFormState(s => ({ ...s, gender: v as any }))}
                  >
                    <SelectTrigger id="empGender">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="empDesignation">Designation / Level</Label>
                <Select
                  value={formState.designation}
                  onValueChange={(v) => setFormState(s => ({ ...s, designation: v as any }))}
                >
                  <SelectTrigger id="empDesignation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESIGNATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="empDisabled"
                  checked={formState.isDisabled}
                  onCheckedChange={(checked) => 
                    setFormState(s => ({ ...s, isDisabled: checked as boolean }))
                  }
                />
                <Label htmlFor="empDisabled">Person with Disability</Label>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="empProvince">Province</Label>
                <Select
                  value={formState.province}
                  onValueChange={(v) => setFormState(s => ({ ...s, province: v as EmployeeFormState['province'] }))}
                >
                  <SelectTrigger id="empProvince">
                    <SelectValue placeholder="Select province..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(PROVINCE_OPTIONS.filter(Boolean) as string[]).map((province) => (
                      <SelectItem key={province} value={province}>{province}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="empHireDate">Hire Date</Label>
                  <Input
                    id="empHireDate"
                    type="date"
                    value={formState.hireDate || ''}
                    onChange={(e) => setFormState(s => ({ ...s, hireDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empTermination">Termination Date (if applicable)</Label>
                  <Input
                    id="empTermination"
                    type="date"
                    value={formState.terminationDate || ''}
                    onChange={(e) => setFormState(s => ({ ...s, terminationDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="empForeign"
                    checked={formState.isForeign}
                    onCheckedChange={(checked) => 
                      setFormState(s => ({ ...s, isForeign: checked as boolean }))
                    }
                  />
                  <Label htmlFor="empForeign" className="text-amber-800">
                    Foreign National (excluded from B-BBEE calculations)
                  </Label>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEmployee}
              disabled={!formState.name.trim()}
            >
              {editingId ? 'Save Changes' : 'Add Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ManagementForm;
