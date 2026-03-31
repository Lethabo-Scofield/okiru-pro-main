/**
 * Ownership Form - DocumentProcessor Integration
 * 
 * Wraps the Toolkit Ownership page for use in DocumentProcessor Build flow.
 * Provides a self-contained ownership data entry form.
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
  Info, 
  Award, 
  Clock, 
  Vote, 
  Wallet,
  Building2,
  TrendingUp,
  AlertCircle,
  CheckCircle2
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
import { cn, formatRand } from "@toolkit/lib/utils";
import type { Shareholder, OwnershipData } from "@toolkit/lib/types";
import { calculateOwnershipScore } from "@toolkit/lib/calculators/ownership";

// ============================================================================
// Types
// ============================================================================

interface OwnershipFormProps {
  data: OwnershipData;
  onChange: (data: OwnershipData) => void;
  className?: string;
}

interface ShareholderFormState {
  id?: string;
  name: string;
  shareholderId: string;
  ownershipType: Shareholder['ownershipType'];
  shares: number;
  shareValue: number;
  blackOwnership: number;
  blackWomenOwnership: number;
  votingRightsPercent: number;
  economicInterestPercent: number;
  isDesignatedGroup: boolean;
  designatedGroupType?: 'youth' | 'orphan' | 'disabled' | 'military';
  blackNewEntrant: boolean;
  yearsHeld: number;
}

// ============================================================================
// Constants
// ============================================================================

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

function calculateGraduationFactor(years: number): number {
  if (years <= 1) return 1.0;
  if (years <= 3) return 0.9;
  if (years <= 5) return 0.8;
  if (years <= 10) return 0.7;
  return 0.6;
}

const emptyShareholderForm: ShareholderFormState = {
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

// ============================================================================
// Component
// ============================================================================

export function OwnershipForm({ data, onChange, className }: OwnershipFormProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ShareholderFormState>(emptyShareholderForm);
  const [activeTab, setActiveTab] = useState('shareholders');

  // Calculate ownership metrics
  const metrics = useMemo(() => {
    const shareholders = data.shareholders || [];
    const totalShares = shareholders.reduce((sum, sh) => sum + (sh.shares || 0), 0);
    const totalValue = shareholders.reduce((sum, sh) => sum + ((sh.shares || 0) * (sh.shareValue || 0)), 0);
    
    const blackShares = shareholders.reduce((sum, sh) => 
      sum + ((sh.shares || 0) * (sh.blackOwnership || 0)), 0);
    const blackWomenShares = shareholders.reduce((sum, sh) => 
      sum + ((sh.shares || 0) * (sh.blackWomenOwnership || 0)), 0);
    
    const blackPercentage = totalShares > 0 ? (blackShares / totalShares) * 100 : 0;
    const blackWomenPercentage = totalShares > 0 ? (blackWomenShares / totalShares) * 100 : 0;
    
    // Voting rights
    const totalVotingRights = shareholders.reduce((sum, sh) => 
      sum + ((sh.shares || 0) * (sh.votingRightsPercent !== undefined ? sh.votingRightsPercent : (sh.blackOwnership || 0))), 0);
    const votingRightsPct = totalShares > 0 ? (totalVotingRights / totalShares) * 100 : 0;
    
    // Economic interest
    const totalEconomicInterest = shareholders.reduce((sum, sh) => 
      sum + ((sh.shares || 0) * (sh.economicInterestPercent !== undefined ? sh.economicInterestPercent : (sh.blackOwnership || 0))), 0);
    const economicInterestPct = totalShares > 0 ? (totalEconomicInterest / totalShares) * 100 : 0;
    
    return {
      totalShares,
      totalValue,
      blackShares,
      blackWomenShares,
      blackPercentage,
      blackWomenPercentage,
      votingRightsPct,
      economicInterestPct,
      shareholderCount: shareholders.length,
    };
  }, [data.shareholders]);

  // Calculate score
  const scoreResult = useMemo(() => {
    return calculateOwnershipScore(data);
  }, [data]);

  // Update company value
  const handleCompanyValueChange = useCallback((field: 'companyValue' | 'outstandingDebt', value: number) => {
    onChange({
      ...data,
      [field]: value,
    });
  }, [data, onChange]);

  // Add/edit shareholder
  const handleSaveShareholder = useCallback(() => {
    const shareholderData: Shareholder = {
      id: editingId || uuidv4(),
      name: formState.name,
      shareholderId: formState.shareholderId,
      ownershipType: formState.ownershipType,
      shares: formState.shares,
      shareValue: formState.shareValue,
      blackOwnership: formState.blackOwnership / 100, // Convert from percentage
      blackWomenOwnership: formState.blackWomenOwnership / 100,
      votingRightsPercent: formState.votingRightsPercent / 100,
      economicInterestPercent: formState.economicInterestPercent / 100,
      isDesignatedGroup: formState.isDesignatedGroup,
      designatedGroupType: formState.designatedGroupType,
      blackNewEntrant: formState.blackNewEntrant,
      yearsHeld: formState.yearsHeld,
    };

    let newShareholders: Shareholder[];
    if (editingId) {
      newShareholders = data.shareholders.map(sh => 
        sh.id === editingId ? shareholderData : sh
      );
    } else {
      newShareholders = [...data.shareholders, shareholderData];
    }

    onChange({
      ...data,
      shareholders: newShareholders,
    });

    setIsDialogOpen(false);
    setEditingId(null);
    setFormState(emptyShareholderForm);
  }, [formState, editingId, data, onChange]);

  // Remove shareholder
  const handleRemoveShareholder = useCallback((id: string) => {
    onChange({
      ...data,
      shareholders: data.shareholders.filter(sh => sh.id !== id),
    });
  }, [data, onChange]);

  // Edit shareholder
  const handleEditShareholder = useCallback((shareholder: Shareholder) => {
    setFormState({
      id: shareholder.id,
      name: shareholder.name,
      shareholderId: shareholder.shareholderId || '',
      ownershipType: shareholder.ownershipType,
      shares: shareholder.shares || 0,
      shareValue: shareholder.shareValue || 0,
      blackOwnership: (shareholder.blackOwnership || 0) * 100,
      blackWomenOwnership: (shareholder.blackWomenOwnership || 0) * 100,
      votingRightsPercent: (shareholder.votingRightsPercent !== undefined ? shareholder.votingRightsPercent : (shareholder.blackOwnership || 0)) * 100,
      economicInterestPercent: (shareholder.economicInterestPercent !== undefined ? shareholder.economicInterestPercent : (shareholder.blackOwnership || 0)) * 100,
      isDesignatedGroup: shareholder.isDesignatedGroup || false,
      designatedGroupType: shareholder.designatedGroupType,
      blackNewEntrant: shareholder.blackNewEntrant || false,
      yearsHeld: shareholder.yearsHeld || 0,
    });
    setEditingId(shareholder.id);
    setIsDialogOpen(true);
  }, []);

  // Add new shareholder
  const handleAddShareholder = useCallback(() => {
    setFormState(emptyShareholderForm);
    setEditingId(null);
    setIsDialogOpen(true);
  }, []);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Score Overview */}
      <Card className={cn(
        scoreResult.subMinimumMet ? "bg-green-50/50 border-green-200" : "bg-amber-50/50 border-amber-200"
      )}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                scoreResult.subMinimumMet ? "bg-green-100" : "bg-amber-100"
              )}>
                <Award className={cn(
                  "h-5 w-5",
                  scoreResult.subMinimumMet ? "text-green-600" : "text-amber-600"
                )} />
              </div>
              <div>
                <div className="font-semibold">Ownership Score</div>
                <div className="text-sm text-muted-foreground">
                  {scoreResult.subMinimumMet ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Sub-minimum met
                    </span>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Sub-minimum not met (need 40% = 10 pts)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{scoreResult.total.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground">of 25 points</div>
            </div>
          </div>
          
          {/* Score Breakdown */}
          <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Voting Rights (Black)</span>
              <div className="font-semibold">{scoreResult.votingRightsBlack.toFixed(1)}/4</div>
            </div>
            <div>
              <span className="text-muted-foreground">Voting Rights (BWO)</span>
              <div className="font-semibold">{scoreResult.votingRightsBWO.toFixed(1)}/2</div>
            </div>
            <div>
              <span className="text-muted-foreground">Economic Interest</span>
              <div className="font-semibold">{scoreResult.economicInterestBlack.toFixed(1)}/4</div>
            </div>
            <div>
              <span className="text-muted-foreground">Net Value</span>
              <div className="font-semibold">{scoreResult.netValue.toFixed(1)}/7</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="shareholders">Shareholders</TabsTrigger>
          <TabsTrigger value="valuation">Company Valuation</TabsTrigger>
        </TabsList>

        <TabsContent value="shareholders" className="space-y-4">
          {/* Shareholders List */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Shareholders</h3>
              <p className="text-sm text-muted-foreground">
                {metrics.shareholderCount} shareholder{metrics.shareholderCount !== 1 ? 's' : ''} • 
                {metrics.blackPercentage.toFixed(1)}% Black Owned
              </p>
            </div>
            <Button onClick={handleAddShareholder} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Shareholder
            </Button>
          </div>

          {data.shareholders.length === 0 ? (
            <Card className="p-8 text-center">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="font-medium mb-2">No shareholders added</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add shareholders to calculate ownership scores
              </p>
              <Button onClick={handleAddShareholder} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add First Shareholder
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.shareholders.map((shareholder) => (
                <Card key={shareholder.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{shareholder.name}</span>
                        {shareholder.isDesignatedGroup && (
                          <Badge variant="secondary">Designated Group</Badge>
                        )}
                        {shareholder.blackNewEntrant && (
                          <Badge variant="outline">New Entrant</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {shareholder.shares?.toLocaleString()} shares @ {formatRand(shareholder.shareValue || 0)}
                      </div>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span>Black: {(shareholder.blackOwnership * 100).toFixed(0)}%</span>
                        <span>Black Women: {(shareholder.blackWomenOwnership * 100).toFixed(0)}%</span>
                        <span>Voting: {((shareholder.votingRightsPercent !== undefined ? shareholder.votingRightsPercent : shareholder.blackOwnership) * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditShareholder(shareholder)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveShareholder(shareholder.id)}
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

        <TabsContent value="valuation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Company Valuation
              </CardTitle>
              <CardDescription>
                Required for net value calculation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyValue">Company Value (R)</Label>
                  <Input
                    id="companyValue"
                    type="number"
                    value={data.companyValue || ''}
                    onChange={(e) => handleCompanyValueChange('companyValue', Number(e.target.value))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outstandingDebt">Outstanding Debt (R)</Label>
                  <Input
                    id="outstandingDebt"
                    type="number"
                    value={data.outstandingDebt || ''}
                    onChange={(e) => handleCompanyValueChange('outstandingDebt', Number(e.target.value))}
                    placeholder="0"
                  />
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <span>Net Value:</span>
                  <span className="text-xl font-bold">
                    {formatRand((data.companyValue || 0) - (data.outstandingDebt || 0))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Shareholder Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Shareholder' : 'Add Shareholder'}
            </DialogTitle>
            <DialogDescription>
              Enter shareholder details for ownership scoring
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="rights">Rights & Interest</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="shName">Shareholder Name *</Label>
                <Input
                  id="shName"
                  value={formState.name}
                  onChange={(e) => setFormState(s => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Nkosi Investments (Pty) Ltd"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shId">Shareholder ID / Registration</Label>
                <Input
                  id="shId"
                  value={formState.shareholderId}
                  onChange={(e) => setFormState(s => ({ ...s, shareholderId: e.target.value }))}
                  placeholder="e.g. 2015/123456/07"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shType">Ownership Type</Label>
                  <Select
                    value={formState.ownershipType}
                  onValueChange={(v) => setFormState(s => ({ ...s, ownershipType: v as Shareholder['ownershipType'] }))}
                  >
                    <SelectTrigger id="shType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(OWNERSHIP_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shShares">Number of Shares</Label>
                  <Input
                    id="shShares"
                    type="number"
                    value={formState.shares || ''}
                    onChange={(e) => setFormState(s => ({ ...s, shares: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shValue">Value per Share (R)</Label>
                  <Input
                    id="shValue"
                    type="number"
                    value={formState.shareValue || ''}
                    onChange={(e) => setFormState(s => ({ ...s, shareValue: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shBlack">Black Ownership (%)</Label>
                  <Input
                    id="shBlack"
                    type="number"
                    min="0"
                    max="100"
                    value={formState.blackOwnership || ''}
                    onChange={(e) => setFormState(s => ({ ...s, blackOwnership: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shBlackWomen">Black Women Ownership (%)</Label>
                  <Input
                    id="shBlackWomen"
                    type="number"
                    min="0"
                    max="100"
                    value={formState.blackWomenOwnership || ''}
                    onChange={(e) => setFormState(s => ({ ...s, blackWomenOwnership: Number(e.target.value) }))}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rights" className="space-y-4 mt-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <Info className="h-4 w-4 inline mr-2" />
                Voting rights and economic interest may differ from ownership percentage. 
                Leave blank to use ownership percentage.
              </div>

              <div className="space-y-2">
                <Label htmlFor="shVoting">Voting Rights (%)</Label>
                <Input
                  id="shVoting"
                  type="number"
                  min="0"
                  max="100"
                  value={formState.votingRightsPercent || ''}
                  onChange={(e) => setFormState(s => ({ ...s, votingRightsPercent: Number(e.target.value) }))}
                  placeholder={formState.blackOwnership.toString()}
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to Black Ownership % if not specified
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="shEconomic">Economic Interest (%)</Label>
                <Input
                  id="shEconomic"
                  type="number"
                  min="0"
                  max="100"
                  value={formState.economicInterestPercent || ''}
                  onChange={(e) => setFormState(s => ({ ...s, economicInterestPercent: Number(e.target.value) }))}
                  placeholder={formState.blackOwnership.toString()}
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to Black Ownership % if not specified
                </p>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shDesignated"
                    checked={formState.isDesignatedGroup}
                    onCheckedChange={(checked) => 
                      setFormState(s => ({ ...s, isDesignatedGroup: checked as boolean }))
                    }
                  />
                  <Label htmlFor="shDesignated">Designated Group Member</Label>
                </div>

                {formState.isDesignatedGroup && (
                  <div className="space-y-2 pl-6">
                    <Label htmlFor="shDesignatedType">Designated Group Type</Label>
                    <Select
                      value={formState.designatedGroupType}
                      onValueChange={(v) => setFormState(s => ({ ...s, designatedGroupType: v as any }))}
                    >
                      <SelectTrigger id="shDesignatedType">
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {DESIGNATED_GROUP_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="shNewEntrant"
                    checked={formState.blackNewEntrant}
                    onCheckedChange={(checked) => 
                      setFormState(s => ({ ...s, blackNewEntrant: checked as boolean }))
                    }
                  />
                  <Label htmlFor="shNewEntrant">Black New Entrant</Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shYearsHeld">Years Held</Label>
                  <Input
                    id="shYearsHeld"
                    type="number"
                    min="0"
                    value={formState.yearsHeld || ''}
                    onChange={(e) => setFormState(s => ({ ...s, yearsHeld: Number(e.target.value) }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Affects graduation factor: {calculateGraduationFactor(formState.yearsHeld).toFixed(1)}x
                    {formState.yearsHeld <= 1 && ' (Full value)'}
                    {formState.yearsHeld > 1 && formState.yearsHeld <= 3 && ' (-10%)'}
                    {formState.yearsHeld > 3 && formState.yearsHeld <= 5 && ' (-20%)'}
                    {formState.yearsHeld > 5 && formState.yearsHeld <= 10 && ' (-30%)'}
                    {formState.yearsHeld > 10 && ' (-40%)'}
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveShareholder}
              disabled={!formState.name.trim()}
            >
              {editingId ? 'Save Changes' : 'Add Shareholder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OwnershipForm;
