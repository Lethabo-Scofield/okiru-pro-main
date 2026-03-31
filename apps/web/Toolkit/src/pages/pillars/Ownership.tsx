import { useState } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { Plus, Edit, Trash2, Info, Award, Clock, Vote, Wallet } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useToast } from "@toolkit/hooks/use-toast";
import { cn, formatRand } from "@toolkit/lib/utils";
import type { Shareholder } from "@toolkit/lib/types";

const OWNERSHIP_TYPE_LABELS: Record<string, string> = {
  shareholder: "Shareholder",
  sale_of_assets: "Sale of Assets",
  equity_equivalent: "Equity Equivalent",
};

const DESIGNATED_GROUP_TYPES = [
  { value: 'youth', label: 'Youth (under 35)' },
  { value: 'orphan', label: 'Orphan / Child-headed household' },
  { value: 'disabled', label: 'Person with Disability' },
  { value: 'military', label: 'Military Veteran' },
];

// Graduation factor based on years held
function calculateGraduationFactor(years: number): number {
  if (years <= 1) return 1.0;
  if (years <= 3) return 0.9;
  if (years <= 5) return 0.8;
  if (years <= 10) return 0.7;
  return 0.6; // 10+ years
}

interface ShareholderFormState {
  // Basic info
  name: string;
  shareholderId: string;
  ownershipType: Shareholder['ownershipType'];
  shares: number;
  shareValue: number;

  // Ownership percentages
  blackOwnership: number;  // Stored as 0-1, input as 0-100
  blackWomenOwnership: number;  // Stored as 0-1, input as 0-100

  // Voting and Economic Interest (can differ from ownership)
  votingRightsPercent: number;  // Stored as 0-1, input as 0-100
  economicInterestPercent: number;  // Stored as 0-1, input as 0-100

  // Designated group
  isDesignatedGroup: boolean;
  designatedGroupType?: 'youth' | 'orphan' | 'disabled' | 'military';

  // New entrant / graduation
  blackNewEntrant: boolean;
  yearsHeld: number;
}

const emptyForm: ShareholderFormState = {
  name: '',
  shareholderId: '',
  ownershipType: 'shareholder',
  shares: 0,
  shareValue: 0,
  blackOwnership: 0,
  blackWomenOwnership: 0,
  votingRightsPercent: 0,
  economicInterestPercent: 0,
  isDesignatedGroup: false,
  designatedGroupType: undefined,
  blackNewEntrant: false,
  yearsHeld: 0,
};

export default function Ownership() {
  const { ownership, addShareholder, updateShareholder, removeShareholder, updateCompanyValue } = useBbeeStore();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("basic");
  const [newSh, setNewSh] = useState<ShareholderFormState>({ ...emptyForm });
  const [editSh, setEditSh] = useState<ShareholderFormState>({ ...emptyForm });

  const [companyVal, setCompanyVal] = useState(ownership.companyValue);
  const [debtVal, setDebtVal] = useState(ownership.outstandingDebt);
  const [valuationDate, setValuationDate] = useState(ownership.valuationDate || '');
  const [valuationMethod, setValuationMethod] = useState(ownership.valuationMethod || 'last_financial');

  const score = calculateOwnershipScore(ownership);

  const chartData = ownership.shareholders.map(sh => ({
    name: sh.name,
    value: sh.shares,
    blackOwnership: sh.blackOwnership
  }));

  const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

  const handleAdd = () => {
    if (!newSh.name || newSh.shares <= 0) {
      toast({ title: "Invalid input", description: "Name and shares are required.", variant: "destructive" });
      return;
    }

    // If voting/economic not set, default to ownership %
    const votingRights = newSh.votingRightsPercent > 0 ? newSh.votingRightsPercent : newSh.blackOwnership;
    const economicInterest = newSh.economicInterestPercent > 0 ? newSh.economicInterestPercent : newSh.blackOwnership;

    addShareholder({
      id: uuidv4(),
      name: newSh.name,
      shareholderId: newSh.shareholderId,
      ownershipType: newSh.ownershipType,
      shares: Number(newSh.shares),
      shareValue: Number(newSh.shareValue),
      blackOwnership: Number(newSh.blackOwnership) / 100,
      blackWomenOwnership: Number(newSh.blackWomenOwnership) / 100,
      votingRightsPercent: Number(votingRights) / 100,
      economicInterestPercent: Number(economicInterest) / 100,
      isDesignatedGroup: newSh.isDesignatedGroup,
      designatedGroupType: newSh.isDesignatedGroup ? newSh.designatedGroupType : undefined,
      blackNewEntrant: newSh.blackNewEntrant,
      yearsHeld: Number(newSh.yearsHeld),
      graduationFactor: calculateGraduationFactor(Number(newSh.yearsHeld)),
    });

    setNewSh({ ...emptyForm });
    setIsAddOpen(false);
    setActiveTab("basic");
    toast({ title: "Shareholder Added", description: `${newSh.name} has been added to the cap table.` });
  };

  const handleEditOpen = (sh: Shareholder) => {
    setEditingId(sh.id);
    setEditSh({
      name: sh.name,
      shareholderId: sh.shareholderId || '',
      ownershipType: sh.ownershipType,
      shares: sh.shares,
      shareValue: sh.shareValue,
      blackOwnership: sh.blackOwnership * 100,
      blackWomenOwnership: sh.blackWomenOwnership * 100,
      votingRightsPercent: (sh.votingRightsPercent || sh.blackOwnership) * 100,
      economicInterestPercent: (sh.economicInterestPercent || sh.blackOwnership) * 100,
      isDesignatedGroup: sh.isDesignatedGroup || false,
      designatedGroupType: sh.designatedGroupType,
      blackNewEntrant: sh.blackNewEntrant || false,
      yearsHeld: sh.yearsHeld || 0,
    });
    setIsEditOpen(true);
  };

  const handleEditSave = () => {
    if (!editingId || !editSh.name || editSh.shares <= 0) {
      toast({ title: "Invalid input", description: "Name and shares are required.", variant: "destructive" });
      return;
    }

    // If voting/economic not set, default to ownership %
    const votingRights = editSh.votingRightsPercent > 0 ? editSh.votingRightsPercent : editSh.blackOwnership;
    const economicInterest = editSh.economicInterestPercent > 0 ? editSh.economicInterestPercent : editSh.blackOwnership;

    updateShareholder(editingId, {
      name: editSh.name,
      shareholderId: editSh.shareholderId,
      ownershipType: editSh.ownershipType,
      shares: Number(editSh.shares),
      shareValue: Number(editSh.shareValue),
      blackOwnership: Number(editSh.blackOwnership) / 100,
      blackWomenOwnership: Number(editSh.blackWomenOwnership) / 100,
      votingRightsPercent: Number(votingRights) / 100,
      economicInterestPercent: Number(economicInterest) / 100,
      isDesignatedGroup: editSh.isDesignatedGroup,
      designatedGroupType: editSh.isDesignatedGroup ? editSh.designatedGroupType : undefined,
      blackNewEntrant: editSh.blackNewEntrant,
      yearsHeld: Number(editSh.yearsHeld),
      graduationFactor: calculateGraduationFactor(Number(editSh.yearsHeld)),
    });

    setIsEditOpen(false);
    setEditingId(null);
    setActiveTab("basic");
    toast({ title: "Shareholder Updated", description: `${editSh.name} has been updated.` });
  };

  const handleUpdateValuation = () => {
    // Also update the ownership data with valuation details
    const updatedOwnership = {
      ...ownership,
      companyValue: Number(companyVal),
      outstandingDebt: Number(debtVal),
      valuationDate: valuationDate || undefined,
      valuationMethod: valuationMethod as Shareholder['ownershipType'],
    };
    updateCompanyValue(Number(companyVal), Number(debtVal));
    toast({ title: "Valuation Updated", description: "Company value, debt, and valuation details have been saved." });
  };

  const shareholderFormFields = (
    formState: ShareholderFormState,
    setFormState: (val: ShareholderFormState) => void,
    prefix: string,
  ) => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="basic">Basic</TabsTrigger>
        <TabsTrigger value="rights">Rights</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-name`} className="text-right">Name</Label>
          <Input
            id={`${prefix}-name`}
            value={formState.name}
            onChange={e => setFormState({ ...formState, name: e.target.value })}
            className="col-span-3"
            placeholder="Entity or individual name"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-id`} className="text-right">ID/Reg No</Label>
          <Input
            id={`${prefix}-id`}
            value={formState.shareholderId}
            onChange={e => setFormState({ ...formState, shareholderId: e.target.value })}
            className="col-span-3"
            placeholder="SA ID or Company Registration"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-type`} className="text-right">Type</Label>
          <div className="col-span-3">
            <Select
              value={formState.ownershipType}
              onValueChange={(val) => setFormState({ ...formState, ownershipType: val as Shareholder['ownershipType'] })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shareholder">Shareholder</SelectItem>
                <SelectItem value="sale_of_assets">Sale of Assets</SelectItem>
                <SelectItem value="equity_equivalent">Equity Equivalent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-shares`} className="text-right">Shares</Label>
          <Input
            id={`${prefix}-shares`}
            type="number"
            value={formState.shares}
            onChange={e => setFormState({ ...formState, shares: Number(e.target.value) })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-shareValue`} className="text-right">Share Value</Label>
          <Input
            id={`${prefix}-shareValue`}
            type="number"
            value={formState.shareValue}
            onChange={e => setFormState({ ...formState, shareValue: Number(e.target.value) })}
            className="col-span-3"
            placeholder="R"
          />
        </div>
      </TabsContent>

      <TabsContent value="rights" className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-blackOwnership`} className="text-right">Black Ownership %</Label>
          <Input
            id={`${prefix}-blackOwnership`}
            type="number"
            min="0"
            max="100"
            value={formState.blackOwnership}
            onChange={e => setFormState({ ...formState, blackOwnership: Number(e.target.value) })}
            className="col-span-3"
            placeholder="0-100"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-blackWomenOwnership`} className="text-right">Black Women %</Label>
          <Input
            id={`${prefix}-blackWomenOwnership`}
            type="number"
            min="0"
            max="100"
            value={formState.blackWomenOwnership}
            onChange={e => setFormState({ ...formState, blackWomenOwnership: Number(e.target.value) })}
            className="col-span-3"
            placeholder="0-100"
          />
        </div>
        <div className="col-span-4 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded">
            <Info className="h-4 w-4" />
            <span>Voting rights and economic interest default to Black Ownership % if not specified.</span>
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-votingRights`} className="text-right">
            <div className="flex items-center gap-1">
              <Vote className="h-3 w-3" />
              Voting Rights %
            </div>
          </Label>
          <Input
            id={`${prefix}-votingRights`}
            type="number"
            min="0"
            max="100"
            value={formState.votingRightsPercent || formState.blackOwnership}
            onChange={e => setFormState({ ...formState, votingRightsPercent: Number(e.target.value) })}
            className="col-span-3"
            placeholder="Defaults to Black Ownership %"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-economicInterest`} className="text-right">
            <div className="flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              Economic Interest %
            </div>
          </Label>
          <Input
            id={`${prefix}-economicInterest`}
            type="number"
            min="0"
            max="100"
            value={formState.economicInterestPercent || formState.blackOwnership}
            onChange={e => setFormState({ ...formState, economicInterestPercent: Number(e.target.value) })}
            className="col-span-3"
            placeholder="Defaults to Black Ownership %"
          />
        </div>
      </TabsContent>

      <TabsContent value="advanced" className="space-y-4 py-4">
        <div className="grid grid-cols-4 items-start gap-4">
          <Label className="text-right pt-2">Designated Group</Label>
          <div className="col-span-3 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${prefix}-designated`}
                checked={formState.isDesignatedGroup}
                onCheckedChange={(checked) => setFormState({ ...formState, isDesignatedGroup: checked === true })}
              />
              <Label htmlFor={`${prefix}-designated`} className="text-sm cursor-pointer">
                <div className="flex items-center gap-1">
                  <Award className="h-3 w-3" />
                  Part of Designated Group (orphan, youth, disabled, military veteran)
                </div>
              </Label>
            </div>
            {formState.isDesignatedGroup && (
              <Select
                value={formState.designatedGroupType || 'youth'}
                onValueChange={(val) => setFormState({ ...formState, designatedGroupType: val as typeof formState.designatedGroupType })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select designated group type" />
                </SelectTrigger>
                <SelectContent>
                  {DESIGNATED_GROUP_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right">New Entrant</Label>
          <div className="col-span-3">
            <Select
              value={formState.blackNewEntrant ? "yes" : "no"}
              onValueChange={(val) => setFormState({ ...formState, blackNewEntrant: val === "yes" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Black New Entrant?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="yes">Yes — Black New Entrant</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={`${prefix}-yearsHeld`} className="text-right">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Years Held
            </div>
          </Label>
          <Input
            id={`${prefix}-yearsHeld`}
            type="number"
            min="0"
            max="50"
            value={formState.yearsHeld}
            onChange={e => setFormState({ ...formState, yearsHeld: Number(e.target.value) })}
            className="col-span-3"
          />
        </div>
        {formState.yearsHeld > 0 && (
          <div className="col-span-4">
            <div className="bg-muted/50 p-3 rounded text-sm">
              <span className="text-muted-foreground">Graduation Factor: </span>
              <span className="font-bold">{calculateGraduationFactor(formState.yearsHeld).toFixed(1)}x</span>
              <span className="text-muted-foreground ml-2">
                ({formState.yearsHeld <= 1 ? '0-1 years: full recognition' : 
                  formState.yearsHeld <= 3 ? '2-3 years: 90% recognition' : 
                  formState.yearsHeld <= 5 ? '4-5 years: 80% recognition' : 
                  formState.yearsHeld <= 10 ? '6-10 years: 70% recognition' : 
                  '10+ years: 60% recognition'})
              </span>
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-3xl font-heading font-bold">Ownership</h1>
          <p className="text-muted-foreground mt-1">
            Manage shareholding structure with voting rights, economic interest, and graduation factors.
          </p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) { setNewSh({ ...emptyForm }); setActiveTab("basic"); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Shareholder
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Shareholder</DialogTitle>
              <DialogDescription>
                Enter shareholder details. Black ownership, voting rights, and economic interest can differ.
              </DialogDescription>
            </DialogHeader>
            {shareholderFormFields(newSh, setNewSh, "add")}
            <DialogFooter>
              <Button type="submit" onClick={handleAdd}>Save Shareholder</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setEditingId(null); setEditSh({ ...emptyForm }); setActiveTab("basic"); } }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Shareholder</DialogTitle>
            <DialogDescription>
              Update shareholder details.
            </DialogDescription>
          </DialogHeader>
          {shareholderFormFields(editSh, setEditSh, "edit")}
          <DialogFooter>
            <Button type="submit" onClick={handleEditSave}>Update Shareholder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Voting</p>
            <p className="text-2xl font-bold font-mono text-primary">{score.votingRightsBlack.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Economic Int.</p>
            <p className="text-2xl font-bold font-mono text-primary">{score.economicInterestBlack.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Net Value</p>
            <p className="text-2xl font-bold font-mono text-primary">{score.netValue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className={score.subMinimumMet ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800" : "bg-destructive/10 border-destructive/20"}>
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Sub-minimum</p>
            <p className={`text-sm font-bold mt-1 ${score.subMinimumMet ? 'text-emerald-600' : 'text-destructive'}`}>
              {score.subMinimumMet ? 'PASSED' : 'FAILED (<3.2)'}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground shadow-md">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <p className="text-xs font-medium uppercase tracking-wider mb-1 opacity-80">Total Score</p>
            <p className="text-3xl font-bold font-mono">{score.total.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Detailed Scorecard Breakdown</CardTitle>
          <CardDescription>7 sub-line indicators per RCOGP Generic Codes</CardDescription>
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
              </tbody>
              <tfoot className="bg-primary/5 font-bold border-t-2 border-primary/20">
                <tr>
                  <td className="px-4 py-4 text-primary font-medium uppercase tracking-wider" colSpan={2}>Total Ownership Score</td>
                  <td className="px-4 py-4 text-right font-mono">25.00</td>
                  <td className="px-4 py-4 text-right font-mono text-lg text-primary">{score.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {score.fullOwnershipAwarded && (
            <div className="mt-3 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md text-sm text-emerald-700 dark:text-emerald-300">
              Full Ownership Awarded — Black voting ≥ 25%, all indicators receive full points.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="glass-panel md:col-span-2">
          <CardHeader>
            <CardTitle>Shareholders</CardTitle>
            <CardDescription>Cap table with B-BBEE recognition details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Entity</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Type</th>
                    <th className="h-10 px-4 text-right font-medium text-muted-foreground">Shares</th>
                    <th className="h-10 px-4 text-center font-medium text-muted-foreground">Black</th>
                    <th className="h-10 px-4 text-center font-medium text-muted-foreground">Voting</th>
                    <th className="h-10 px-4 text-center font-medium text-muted-foreground">Economic</th>
                    <th className="h-10 px-4 text-center font-medium text-muted-foreground">Flags</th>
                    <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ownership.shareholders.map((sh) => (
                    <tr key={sh.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="font-medium">{sh.name}</div>
                        <div className="text-xs text-muted-foreground">{sh.shareholderId}</div>
                      </td>
                      <td className="p-4">
                        <Badge variant="secondary">
                          {OWNERSHIP_TYPE_LABELS[sh.ownershipType] || sh.ownershipType}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-mono">{sh.shares.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <Badge variant={sh.blackOwnership > 0 ? "default" : "secondary"}>
                          {(sh.blackOwnership * 100).toFixed(0)}%
                        </Badge>
                      </td>
                      <td className="p-4 text-center">
                        <span className="text-sm">{((sh.votingRightsPercent || sh.blackOwnership) * 100).toFixed(0)}%</span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="text-sm">{((sh.economicInterestPercent || sh.blackOwnership) * 100).toFixed(0)}%</span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          {sh.blackNewEntrant && (
                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700">New</Badge>
                          )}
                          {sh.isDesignatedGroup && (
                            <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700">
                              {sh.designatedGroupType?.slice(0, 3)}
                            </Badge>
                          )}
                          {sh.yearsHeld !== undefined && sh.yearsHeld > 1 && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700">
                              {(sh.graduationFactor || calculateGraduationFactor(sh.yearsHeld)).toFixed(1)}x
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditOpen(sh)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => removeShareholder(sh.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {ownership.shareholders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        No shareholders added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Company Valuation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Company Value (ZAR)</Label>
                <Input
                  type="number"
                  value={companyVal}
                  onChange={e => setCompanyVal(Number(e.target.value))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Outstanding Debt (ZAR)</Label>
                <Input
                  type="number"
                  value={debtVal}
                  onChange={e => setDebtVal(Number(e.target.value))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Valuation Date</Label>
                <Input
                  type="date"
                  value={valuationDate}
                  onChange={e => setValuationDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Valuation Method</Label>
                <Select value={valuationMethod} onValueChange={setValuationMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last_financial">Last Financial Year</SelectItem>
                    <SelectItem value="independent">Independent Valuation</SelectItem>
                    <SelectItem value="internal">Internal Valuation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" className="w-full" onClick={handleUpdateValuation}>Update Valuation</Button>

              <div className="space-y-2 pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross Value</span>
                  <span className="font-mono">{formatRand(ownership.companyValue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Less: Debt</span>
                  <span className="font-mono text-red-600">-{formatRand(ownership.outstandingDebt)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>Net Value</span>
                  <span className="text-emerald-600">{formatRand(ownership.companyValue - ownership.outstandingDebt)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Share Split</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value}`, 'Shares']}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
