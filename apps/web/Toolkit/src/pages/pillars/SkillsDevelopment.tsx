import { useState } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { calculateSkillsScore } from "@toolkit/lib/calculators/skills";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@toolkit/components/ui/tabs";
import { Plus, GraduationCap, Trash2, Pencil, Upload, UserCheck, Calendar, DollarSign, BookOpen, Bus, Home, Utensils, PenTool, Building, Wallet, FileText, AlertCircle } from "lucide-react";
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
import type { TrainingProgram, TrainingCategoryCode } from "@toolkit/lib/types";

const CATEGORY_OPTIONS = [
  { value: "A", label: "Cat A — Bursaries (University / TVET)", cap: null, examples: "University degrees, diplomas, certificates" },
  { value: "B", label: "Cat B — Internships & Learnerships", cap: null, examples: "Learnerships, apprenticeships, internships" },
  { value: "C", label: "Cat C — Short Courses (Accredited)", cap: null, examples: "Accredited short courses, workshops" },
  { value: "D", label: "Cat D — Other Accredited Training", cap: null, examples: "Professional certifications, trade tests" },
  { value: "E", label: "Cat E — Non-accredited / Informal", cap: "25%", examples: "Induction, on-the-job training, shadowing" },
  { value: "F", label: "Cat F — Other Costs", cap: "15%", examples: "Travel, accommodation, catering, venues" },
  { value: "G", label: "Cat G — Informal Training (Non-black)", cap: null, examples: "Non-black employee training (no points)" },
];

const RACE_OPTIONS = [
  { value: "African", label: "African" },
  { value: "Coloured", label: "Coloured" },
  { value: "Indian", label: "Indian" },
  { value: "White", label: "White" },
];

const GENDER_OPTIONS = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];

const EMPLOYMENT_OPTIONS = [
  { value: "Permanent", label: "Permanent Employee" },
  { value: "Fixed-Term", label: "Fixed-Term Contract" },
  { value: "Unemployed", label: "Unemployed Learner" },
];

interface InterventionFormState {
  // Program details
  programName: string;
  trainingProvider: string;
  categoryCode: TrainingCategoryCode;

  // Learner details
  learnerName: string;
  learnerIdNumber: string;
  gender: 'Male' | 'Female';
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  isDisabled: boolean;
  isForeign: boolean;
  employmentStatus: 'Permanent' | 'Fixed-Term' | 'Unemployed';

  // YES/Completion status
  isYesEmployee: boolean;
  isCompleted: boolean;
  isAbsorbed: boolean;

  // Dates
  transactionDate: string;
  startDate: string;
  endDate: string;

  // Cost breakdown
  courseCost: number;
  travelCost: number;
  accommodationCost: number;
  cateringCost: number;
  stationeryCost: number;
  facilityCost: number;
  salaryCost: number;
  otherCosts: number;

  // Flags
  isAbet: boolean;
  isMandatory: boolean;
}

const defaultFormState: InterventionFormState = {
  programName: '',
  trainingProvider: '',
  categoryCode: 'C',
  learnerName: '',
  learnerIdNumber: '',
  gender: 'Male',
  race: 'African',
  isDisabled: false,
  isForeign: false,
  employmentStatus: 'Permanent',
  isYesEmployee: false,
  isCompleted: false,
  isAbsorbed: false,
  transactionDate: new Date().toISOString().split('T')[0],
  startDate: '',
  endDate: '',
  courseCost: 0,
  travelCost: 0,
  accommodationCost: 0,
  cateringCost: 0,
  stationeryCost: 0,
  facilityCost: 0,
  salaryCost: 0,
  otherCosts: 0,
  isAbet: false,
  isMandatory: false,
};

// Helper to check if race is Black for BEE purposes
function isBlackRace(race: string): boolean {
  return ['African', 'Coloured', 'Indian'].includes(race);
}

// Calculate total cost
function calculateTotalCost(costs: Pick<InterventionFormState, 
  'courseCost' | 'travelCost' | 'accommodationCost' | 'cateringCost' | 
  'stationeryCost' | 'facilityCost' | 'salaryCost' | 'otherCosts'
>): number {
  return costs.courseCost + costs.travelCost + costs.accommodationCost + 
         costs.cateringCost + costs.stationeryCost + costs.facilityCost + 
         costs.salaryCost + costs.otherCosts;
}

export default function SkillsDevelopment() {
  const { skills, addTrainingProgram, updateTrainingProgram, removeTrainingProgram } = useBbeeStore();
  const { leviableAmount, trainingPrograms, yesCandidatesCount, yesAbsorbedCount } = skills;
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [formState, setFormState] = useState<InterventionFormState>({ ...defaultFormState });

  const targetSpend = leviableAmount * 0.06;
  const bursaryTarget = leviableAmount * 0.025;
  
  // Calculate totals from interventions
  const blackInterventions = trainingPrograms.filter(p => isBlackRace(p.race) && !p.isForeign);
  const totalSpend = blackInterventions.reduce((acc, prog) => acc + calculateTotalCost(prog), 0);
  const bursarySpend = blackInterventions
    .filter(p => p.categoryCode === 'A' || p.isBursary)
    .reduce((acc, prog) => acc + calculateTotalCost(prog), 0);
  const disabledSpend = blackInterventions
    .filter(p => p.isDisabled)
    .reduce((acc, prog) => acc + calculateTotalCost(prog), 0);

  const getCategoryColor = (code: string) => {
    switch(code) {
      case 'A': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800/50';
      case 'B': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800/50';
      case 'C': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800/50';
      case 'D': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800/50';
      case 'E': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800/50';
      case 'F': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700/50';
      case 'G': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700/50';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700/50';
    }
  };

  const formatCategoryLabel = (prog: TrainingProgram) => {
    const code = prog.categoryCode || 'C';
    const found = CATEGORY_OPTIONS.find(c => c.value === code);
    return found ? `Cat ${code}` : `Cat ${code}`;
  };

  const formatCurrency = formatRand;

  const resetForm = () => {
    setFormState({ ...defaultFormState });
    setActiveTab("details");
  };

  const handleAdd = () => {
    if (!formState.programName || !formState.learnerName) {
      toast({ title: "Invalid input", description: "Program name and learner name are required.", variant: "destructive" });
      return;
    }

    const totalCost = calculateTotalCost(formState);
    if (totalCost <= 0) {
      toast({ title: "Invalid cost", description: "At least one cost field must be greater than 0.", variant: "destructive" });
      return;
    }
    
    const newIntervention: TrainingProgram = {
      id: uuidv4(),
      programName: formState.programName,
      trainingProvider: formState.trainingProvider,
      categoryCode: formState.categoryCode,
      learnerName: formState.learnerName,
      learnerIdNumber: formState.learnerIdNumber,
      gender: formState.gender,
      race: formState.race,
      isDisabled: formState.isDisabled,
      isForeign: formState.isForeign,
      employmentStatus: formState.employmentStatus,
      isYesEmployee: formState.isYesEmployee,
      isCompleted: formState.isCompleted,
      isAbsorbed: formState.isAbsorbed,
      transactionDate: formState.transactionDate,
      startDate: formState.startDate || undefined,
      endDate: formState.endDate || undefined,
      courseCost: formState.courseCost,
      travelCost: formState.travelCost,
      accommodationCost: formState.accommodationCost,
      cateringCost: formState.cateringCost,
      stationeryCost: formState.stationeryCost,
      facilityCost: formState.facilityCost,
      salaryCost: formState.salaryCost,
      otherCosts: formState.otherCosts,
      isAbet: formState.isAbet,
      isMandatory: formState.isMandatory,
      isBursary: formState.categoryCode === 'A',
      // Legacy fields for compatibility
      name: formState.programName,
      category: formState.categoryCode === 'A' ? 'bursary' : 
                formState.categoryCode === 'B' ? 'learnership' : 'short_course',
      cost: totalCost,
      isEmployed: formState.employmentStatus !== 'Unemployed',
      isBlack: isBlackRace(formState.race),
    };
    
    addTrainingProgram(newIntervention);
    
    resetForm();
    setIsAddOpen(false);
    toast({ 
      title: "Training Intervention Added", 
      description: `${formState.programName} for ${formState.learnerName} (${formatCurrency(totalCost)})` 
    });
  };

  const openEdit = (prog: TrainingProgram) => {
    setEditingId(prog.id);
    setFormState({
      programName: prog.programName || prog.name || '',
      trainingProvider: prog.trainingProvider || '',
      categoryCode: prog.categoryCode || 'C',
      learnerName: prog.learnerName || '',
      learnerIdNumber: prog.learnerIdNumber || '',
      gender: prog.gender || 'Male',
      race: prog.race || 'African',
      isDisabled: prog.isDisabled || false,
      isForeign: prog.isForeign || false,
      employmentStatus: prog.employmentStatus || 'Permanent',
      isYesEmployee: prog.isYesEmployee || false,
      isCompleted: prog.isCompleted || false,
      isAbsorbed: prog.isAbsorbed || false,
      transactionDate: prog.transactionDate || new Date().toISOString().split('T')[0],
      startDate: prog.startDate || '',
      endDate: prog.endDate || '',
      courseCost: prog.courseCost || 0,
      travelCost: prog.travelCost || 0,
      accommodationCost: prog.accommodationCost || 0,
      cateringCost: prog.cateringCost || 0,
      stationeryCost: prog.stationeryCost || 0,
      facilityCost: prog.facilityCost || 0,
      salaryCost: prog.salaryCost || 0,
      otherCosts: prog.otherCosts || 0,
      isAbet: prog.isAbet || false,
      isMandatory: prog.isMandatory || false,
    });
    setIsEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingId) return;
    if (!formState.programName || !formState.learnerName) {
      toast({ title: "Invalid input", description: "Program name and learner name are required.", variant: "destructive" });
      return;
    }

    const totalCost = calculateTotalCost(formState);

    updateTrainingProgram(editingId, {
      programName: formState.programName,
      trainingProvider: formState.trainingProvider,
      categoryCode: formState.categoryCode,
      learnerName: formState.learnerName,
      learnerIdNumber: formState.learnerIdNumber,
      gender: formState.gender,
      race: formState.race,
      isDisabled: formState.isDisabled,
      isForeign: formState.isForeign,
      employmentStatus: formState.employmentStatus,
      isYesEmployee: formState.isYesEmployee,
      isCompleted: formState.isCompleted,
      isAbsorbed: formState.isAbsorbed,
      transactionDate: formState.transactionDate,
      startDate: formState.startDate || undefined,
      endDate: formState.endDate || undefined,
      courseCost: formState.courseCost,
      travelCost: formState.travelCost,
      accommodationCost: formState.accommodationCost,
      cateringCost: formState.cateringCost,
      stationeryCost: formState.stationeryCost,
      facilityCost: formState.facilityCost,
      salaryCost: formState.salaryCost,
      otherCosts: formState.otherCosts,
      isAbet: formState.isAbet,
      isMandatory: formState.isMandatory,
      isBursary: formState.categoryCode === 'A',
      // Legacy fields
      name: formState.programName,
      cost: totalCost,
      isEmployed: formState.employmentStatus !== 'Unemployed',
      isBlack: isBlackRace(formState.race),
    });

    setIsEditOpen(false);
    setEditingId(null);
    resetForm();
    toast({ title: "Intervention Updated", description: `${formState.programName} for ${formState.learnerName}` });
  };

  const score = calculateSkillsScore(skills);

  const totalYesCount = trainingPrograms.filter(p => p.isYesEmployee).length;
  const completedYesCount = trainingPrograms.filter(p => p.isYesEmployee && p.isCompleted).length;
  const absorbedYesCount = trainingPrograms.filter(p => p.isYesEmployee && p.isAbsorbed).length;

  const renderFormFields = () => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="details"><BookOpen className="h-4 w-4 mr-2" />Program</TabsTrigger>
        <TabsTrigger value="learner"><UserCheck className="h-4 w-4 mr-2" />Learner</TabsTrigger>
        <TabsTrigger value="costs"><DollarSign className="h-4 w-4 mr-2" />Costs</TabsTrigger>
        <TabsTrigger value="status"><Calendar className="h-4 w-4 mr-2" />Status</TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="program-name" className="text-right">Program Name</Label>
          <Input
            id="program-name"
            value={formState.programName}
            onChange={e => setFormState({ ...formState, programName: e.target.value })}
            className="col-span-3"
            placeholder="e.g., IT Support Learnership"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="training-provider" className="text-right">Provider</Label>
          <Input
            id="training-provider"
            value={formState.trainingProvider}
            onChange={e => setFormState({ ...formState, trainingProvider: e.target.value })}
            className="col-span-3"
            placeholder="e.g., UNISA, Accredited Training Provider"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">Category</Label>
          <Select value={formState.categoryCode} onValueChange={(v) => setFormState({ ...formState, categoryCode: v as TrainingCategoryCode })}>
            <SelectTrigger className="col-span-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.examples}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-start gap-4">
          <Label className="text-right pt-2">Flags</Label>
          <div className="col-span-3 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="abet"
                checked={formState.isAbet}
                onCheckedChange={(checked) => setFormState({ ...formState, isAbet: checked === true })}
              />
              <Label htmlFor="abet" className="text-sm cursor-pointer">ABET (Adult Basic Education & Training)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="mandatory"
                checked={formState.isMandatory}
                onCheckedChange={(checked) => setFormState({ ...formState, isMandatory: checked === true })}
              />
              <Label htmlFor="mandatory" className="text-sm cursor-pointer">Mandatory/Compulsory Training</Label>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="learner" className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="learner-name" className="text-right">Learner Name</Label>
          <Input
            id="learner-name"
            value={formState.learnerName}
            onChange={e => setFormState({ ...formState, learnerName: e.target.value })}
            className="col-span-3"
            placeholder="Full name of participant"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="learner-id" className="text-right">ID Number</Label>
          <Input
            id="learner-id"
            value={formState.learnerIdNumber}
            onChange={e => setFormState({ ...formState, learnerIdNumber: e.target.value })}
            className="col-span-3"
            placeholder="SA ID or Passport (optional)"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">Gender</Label>
          <Select value={formState.gender} onValueChange={(v) => setFormState({ ...formState, gender: v as 'Male' | 'Female' })}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">Race</Label>
          <Select value={formState.race} onValueChange={(v) => setFormState({ ...formState, race: v as typeof formState.race })}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Select race group" />
            </SelectTrigger>
            <SelectContent>
              {RACE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">Employment</Label>
          <Select value={formState.employmentStatus} onValueChange={(v) => setFormState({ ...formState, employmentStatus: v as typeof formState.employmentStatus })}>
            <SelectTrigger className="col-span-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-start gap-4">
          <Label className="text-right pt-2">Status</Label>
          <div className="col-span-3 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="disabled"
                checked={formState.isDisabled}
                onCheckedChange={(checked) => setFormState({ ...formState, isDisabled: checked === true })}
              />
              <Label htmlFor="disabled" className="text-sm cursor-pointer">Person with Disability</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="foreign"
                checked={formState.isForeign}
                onCheckedChange={(checked) => setFormState({ ...formState, isForeign: checked === true })}
              />
              <Label htmlFor="foreign" className="text-sm cursor-pointer flex items-center gap-1">
                Foreign National
                {formState.isForeign && (
                  <span className="text-amber-600 text-xs">(excluded from BEE calculations)</span>
                )}
              </Label>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="costs" className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="course-cost" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Course/Tuition
            </Label>
            <Input
              id="course-cost"
              type="number"
              value={formState.courseCost}
              onChange={e => setFormState({ ...formState, courseCost: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="travel-cost" className="flex items-center gap-2">
              <Bus className="h-4 w-4" /> Travel
            </Label>
            <Input
              id="travel-cost"
              type="number"
              value={formState.travelCost}
              onChange={e => setFormState({ ...formState, travelCost: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accommodation-cost" className="flex items-center gap-2">
              <Home className="h-4 w-4" /> Accommodation
            </Label>
            <Input
              id="accommodation-cost"
              type="number"
              value={formState.accommodationCost}
              onChange={e => setFormState({ ...formState, accommodationCost: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="catering-cost" className="flex items-center gap-2">
              <Utensils className="h-4 w-4" /> Catering
            </Label>
            <Input
              id="catering-cost"
              type="number"
              value={formState.cateringCost}
              onChange={e => setFormState({ ...formState, cateringCost: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stationery-cost" className="flex items-center gap-2">
              <PenTool className="h-4 w-4" /> Stationery
            </Label>
            <Input
              id="stationery-cost"
              type="number"
              value={formState.stationeryCost}
              onChange={e => setFormState({ ...formState, stationeryCost: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="facility-cost" className="flex items-center gap-2">
              <Building className="h-4 w-4" /> Facility/Venue
            </Label>
            <Input
              id="facility-cost"
              type="number"
              value={formState.facilityCost}
              onChange={e => setFormState({ ...formState, facilityCost: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salary-cost" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Salary/Stipend
            </Label>
            <Input
              id="salary-cost"
              type="number"
              value={formState.salaryCost}
              onChange={e => setFormState({ ...formState, salaryCost: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="other-cost" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Other
            </Label>
            <Input
              id="other-cost"
              type="number"
              value={formState.otherCosts}
              onChange={e => setFormState({ ...formState, otherCosts: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
        </div>
        <div className="pt-4 border-t">
          <div className="flex justify-between items-center">
            <span className="font-medium">Total Cost:</span>
            <span className="text-xl font-bold text-primary">{formatCurrency(calculateTotalCost(formState))}</span>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="status" className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="transaction-date" className="text-right">Transaction Date</Label>
          <Input
            id="transaction-date"
            type="date"
            value={formState.transactionDate}
            onChange={e => setFormState({ ...formState, transactionDate: e.target.value })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="start-date" className="text-right">Start Date</Label>
          <Input
            id="start-date"
            type="date"
            value={formState.startDate}
            onChange={e => setFormState({ ...formState, startDate: e.target.value })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="end-date" className="text-right">End Date</Label>
          <Input
            id="end-date"
            type="date"
            value={formState.endDate}
            onChange={e => setFormState({ ...formState, endDate: e.target.value })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-start gap-4 pt-4">
          <Label className="text-right pt-2">YES 4 Youth</Label>
          <div className="col-span-3 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="yes-employee"
                checked={formState.isYesEmployee}
                onCheckedChange={(checked) => setFormState({ ...formState, isYesEmployee: checked === true })}
              />
              <Label htmlFor="yes-employee" className="text-sm cursor-pointer">YES 4 Youth Candidate</Label>
            </div>
            {formState.isYesEmployee && (
              <>
                <div className="flex items-center gap-2 pl-6">
                  <Checkbox
                    id="completed"
                    checked={formState.isCompleted}
                    onCheckedChange={(checked) => setFormState({ ...formState, isCompleted: checked === true })}
                  />
                  <Label htmlFor="completed" className="text-sm cursor-pointer">Training Completed</Label>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <Checkbox
                    id="absorbed"
                    checked={formState.isAbsorbed}
                    onCheckedChange={(checked) => setFormState({ ...formState, isAbsorbed: checked === true })}
                  />
                  <Label htmlFor="absorbed" className="text-sm cursor-pointer">Absorbed into Employment</Label>
                </div>
              </>
            )}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Skills Development</h1>
          <p className="text-muted-foreground mt-1">
            Track per-learner interventions with full cost breakdown and YES linkage.
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            Bulk Upload
          </Button>
          <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Intervention
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Training Intervention</DialogTitle>
                <DialogDescription>Record a skills intervention for a specific learner with cost breakdown.</DialogDescription>
              </DialogHeader>
              {renderFormFields()}
              <DialogFooter>
                <Button type="submit" onClick={handleAdd}>Save Intervention</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingId(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Training Intervention</DialogTitle>
            <DialogDescription>Update intervention details.</DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter>
            <Button type="submit" onClick={handleEdit}>Update Intervention</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leviable Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-heading">
              R {(leviableAmount / 1000000).toFixed(2)}M
            </div>
            <p className="text-xs text-muted-foreground mt-1">Base for skills targets</p>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Black Skills Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="text-2xl font-bold font-heading">{formatCurrency(totalSpend)}</div>
              <div className="text-sm text-muted-foreground mb-1">/ {formatCurrency(targetSpend)}</div>
            </div>
            <div className="mt-2 h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-chart-3 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (totalSpend / targetSpend) * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bursary Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="text-2xl font-bold font-heading">{formatCurrency(bursarySpend)}</div>
              <div className="text-sm text-muted-foreground mb-1">/ {formatCurrency(bursaryTarget)}</div>
            </div>
            <div className="mt-2 h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-chart-1 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (bursarySpend / bursaryTarget) * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">YES 4 Youth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <div className="text-2xl font-bold font-heading text-blue-600">{absorbedYesCount}</div>
              <div className="text-sm text-muted-foreground mb-1">/ {totalYesCount} absorbed</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Linked to YES Initiative pillar</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Training Interventions ({trainingPrograms.length})
          </CardTitle>
          <CardDescription>Per-learner interventions with cost breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Program</th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">Learner</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Category</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Demographics</th>
                  <th className="h-10 px-4 text-center font-medium text-muted-foreground">Status</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground">Total Cost</th>
                  <th className="h-10 px-4 text-right font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {trainingPrograms.map((prog, idx) => {
                  const totalCost = calculateTotalCost(prog);
                  const isBlack = isBlackRace(prog.race);
                  return (
                    <tr key={prog.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors group">
                      <td className="p-4">
                        <div className="font-medium">{prog.programName || prog.name}</div>
                        <div className="text-xs text-muted-foreground">{prog.trainingProvider}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{prog.learnerName}</div>
                        <div className="text-xs text-muted-foreground">{prog.learnerIdNumber}</div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={cn("text-xs px-2 py-1 rounded-md border", getCategoryColor(prog.categoryCode || 'C'))}>
                          {formatCategoryLabel(prog)}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{prog.gender}</Badge>
                          <Badge variant="outline" className={cn("text-[10px]", isBlack && "bg-emerald-50 text-emerald-700 border-emerald-200")}>{prog.race}</Badge>
                          {prog.isDisabled && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Disabled</Badge>
                          )}
                          {prog.isForeign && (
                            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">Foreign</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            {prog.employmentStatus}
                          </Badge>
                          {prog.isYesEmployee && (
                            <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">YES</Badge>
                          )}
                          {prog.isAbsorbed && (
                            <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">Absorbed</Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right font-mono font-medium">
                        {formatCurrency(totalCost)}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100"
                            onClick={() => openEdit(prog)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 text-destructive"
                            onClick={() => removeTrainingProgram(prog.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {trainingPrograms.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No training interventions recorded yet.</p>
              <p className="text-sm">Click &quot;Add Intervention&quot; to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Detailed Scorecard Breakdown</CardTitle>
          <CardDescription>5 sub-line indicators per RCOGP Generic Codes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Indicator</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Target</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Weighting</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {score.subLines.map((sl, idx) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{sl.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{sl.target}</td>
                    <td className="px-4 py-3 text-right font-mono">{sl.weighting.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-primary">{sl.score.toFixed(2)}</td>
                  </tr>
                ))}
                {score.categoryBreakdown.filter(cb => cb.spend > 0).map((cb, idx) => (
                  <tr key={`cat-${idx}`} className="bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-xs text-muted-foreground/70">↳ Cat {cb.code}: {cb.label}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">{cb.cap ? `≤${(cb.cap * 100).toFixed(0)}% cap` : 'No cap'}</td>
                    <td className="px-4 py-2"></td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-semibold">
                      R{cb.recognisedSpend.toLocaleString()}{cb.capApplied ? ' (capped)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-primary/5 font-bold border-t-2 border-primary/20">
                <tr>
                  <td className="px-4 py-4 text-primary font-medium uppercase tracking-wider" colSpan={2}>Total Skills Development Score</td>
                  <td className="px-4 py-4 text-right font-mono">25.00</td>
                  <td className="px-4 py-4 text-right font-mono text-lg text-primary">{score.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Sub-minimum: ≥ 10 pts (40% of 25) — {score.subMinimumMet ? (
              <span className="text-emerald-600 font-bold">PASSED</span>
            ) : (
              <span className="text-destructive font-bold">FAILED</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
