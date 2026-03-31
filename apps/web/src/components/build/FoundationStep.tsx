import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@toolkit/components/ui/tabs";
import { Badge } from "@toolkit/components/ui/badge";
import { Switch } from "@toolkit/components/ui/switch";
import { Label } from "@toolkit/components/ui/label";
import { ClientInformationForm, ClientInformationData, EMPTY_CLIENT_INFO } from './ClientInformationForm';
import { FinancialsForm, FinancialsData, EMPTY_FINANCIALS } from './FinancialsForm';
import { AutoFillButton } from '@/components/AutoFillButton';
import { 
  Building2, 
  DollarSign, 
  Upload, 
  Pencil, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  FileText,
  Sparkles
} from "lucide-react";
import { cn } from "@toolkit/lib/utils";

export interface FoundationData {
  clientInfo: ClientInformationData;
  financials: FinancialsData;
}

interface FoundationStepProps {
  data: FoundationData;
  onChange: (data: FoundationData) => void;
  onNext: () => void;
  onBack: () => void;
  className?: string;
}

type InputMode = 'manual' | 'upload' | 'extracted';

interface SectionState {
  clientInfo: {
    mode: InputMode;
    isComplete: boolean;
    isValid: boolean;
  };
  financials: {
    mode: InputMode;
    isComplete: boolean;
    isValid: boolean;
  };
}

export function FoundationStep({ data, onChange, onNext, onBack, className }: FoundationStepProps) {
  const [activeTab, setActiveTab] = useState<'client' | 'financials'>('client');
  const [sectionState, setSectionState] = useState<SectionState>({
    clientInfo: { mode: 'manual', isComplete: false, isValid: false },
    financials: { mode: 'manual', isComplete: false, isValid: false },
  });

  // Validation
  const validateClientInfo = (info: ClientInformationData): boolean => {
    return !!(
      info.companyName &&
      info.registrationNumber &&
      info.physicalAddress &&
      info.contactPerson &&
      info.contactEmail &&
      info.contactPhone &&
      info.sectorCode &&
      info.industry &&
      info.annualTurnover > 0 &&
      info.numberOfEmployees > 0 &&
      info.financialYearEnd
    );
  };

  const validateFinancials = (fin: FinancialsData): boolean => {
    return !!(
      fin.totalRevenue > 0 &&
      fin.npat !== undefined && // NPAT can be negative or zero
      fin.leviableAmount >= 0 &&
      fin.tmps >= 0
    );
  };

  const clientInfoValid = validateClientInfo(data.clientInfo);
  const financialsValid = validateFinancials(data.financials);
  const allValid = clientInfoValid && financialsValid;

  const updateClientInfo = (clientInfo: ClientInformationData) => {
    // Sync industry with financials
    const updatedFinancials = { ...data.financials, industry: clientInfo.industry };
    onChange({ 
      clientInfo, 
      financials: updatedFinancials 
    });
    setSectionState(prev => ({
      ...prev,
      clientInfo: { ...prev.clientInfo, isValid: validateClientInfo(clientInfo) }
    }));
  };

  const updateFinancials = (financials: FinancialsData) => {
    onChange({ ...data, financials });
    setSectionState(prev => ({
      ...prev,
      financials: { ...prev.financials, isValid: validateFinancials(financials) }
    }));
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Foundation Layer</h2>
        <p className="text-muted-foreground">
          Enter company and financial details. These determine which B-BBEE rules apply 
          and drive all pillar calculations.
        </p>
      </div>

      {/* Progress Overview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card 
          className={cn(
            "cursor-pointer transition-colors border-border/80 bg-card",
            activeTab === 'client' ? "border-primary/60 ring-1 ring-primary/30" : ""
          )}
          onClick={() => setActiveTab('client')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg bg-muted/50 text-muted-foreground",
                  clientInfoValid && "text-foreground"
                )}>
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Client Information</h3>
                  <p className="text-sm text-muted-foreground">
                    Company details, sector, sizing
                  </p>
                </div>
              </div>
              {clientInfoValid ? (
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Badge variant={clientInfoValid ? "default" : "outline"}>
                {clientInfoValid ? 'Complete' : 'Required'}
              </Badge>
              {data.clientInfo.sectorCode && (
                <Badge variant="secondary">{data.clientInfo.sectorCode}</Badge>
              )}
              {data.clientInfo.annualTurnover > 0 && (
                <Badge variant="outline">
                  {data.clientInfo.annualTurnover < 10000000 ? 'EME' : 
                   data.clientInfo.annualTurnover <= 50000000 ? 'QSE' : 'Generic'}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-colors border-border/80 bg-card",
            activeTab === 'financials' ? "border-primary/60 ring-1 ring-primary/30" : ""
          )}
          onClick={() => setActiveTab('financials')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg bg-muted/50 text-muted-foreground",
                  financialsValid && "text-foreground"
                )}>
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Financials</h3>
                  <p className="text-sm text-muted-foreground">
                    Revenue, NPAT, TMPS, leviable amount
                  </p>
                </div>
              </div>
              {financialsValid ? (
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Badge variant={financialsValid ? "default" : "outline"}>
                {financialsValid ? 'Complete' : 'Required'}
              </Badge>
              {data.financials.totalRevenue > 0 && (
                <Badge variant="outline">
                  R {(data.financials.totalRevenue / 1000000).toFixed(1)}M Rev
                </Badge>
              )}
              {data.financials.deemedNpatUsed && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  Deemed NPAT
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Input Mode Toggle */}
      <Card className="border-border/80 bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch 
                  id="manual-mode"
                  checked={sectionState[activeTab === 'client' ? 'clientInfo' : 'financials'].mode === 'manual'}
                  onCheckedChange={(checked) => {
                    setSectionState(prev => ({
                      ...prev,
                      [activeTab === 'client' ? 'clientInfo' : 'financials']: {
                        ...prev[activeTab === 'client' ? 'clientInfo' : 'financials'],
                        mode: checked ? 'manual' : 'upload'
                      }
                    }));
                  }}
                />
                <Label htmlFor="manual-mode" className="flex items-center gap-2 cursor-pointer">
                  <Pencil className="h-4 w-4" />
                  Manual Entry
                </Label>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2 text-muted-foreground">
                <Upload className="h-4 w-4" />
                <span className="text-sm">Upload Document (Coming Soon)</span>
              </div>
            </div>
            {activeTab === 'financials' && data.financials.deemedNpatUsed && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                <Sparkles className="h-3 w-3 mr-1" />
                Auto-calculated values active
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Form Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'client' | 'financials')}>
        <TabsContent value="client" className="mt-0">
          <ClientInformationForm 
            data={data.clientInfo}
            onChange={updateClientInfo}
          />
        </TabsContent>
        <TabsContent value="financials" className="mt-0">
          <FinancialsForm 
            data={data.financials}
            onChange={updateFinancials}
          />
        </TabsContent>
      </Tabs>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button 
          onClick={onNext}
          disabled={!allValid}
          className="gap-2"
        >
          Continue to Pillars
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Validation Summary */}
      {!allValid && (
        <Card className="border-border/80 bg-muted/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <h4 className="font-semibold text-foreground">Required Fields Missing</h4>
                <ul className="text-sm text-muted-foreground mt-1 list-disc list-inside">
                  {!clientInfoValid && <li>Complete Client Information (company, contact, sector)</li>}
                  {!financialsValid && <li>Complete Financials (revenue, NPAT, TMPS)</li>}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auto-fill Button for Testing */}
      <AutoFillButton
        target="foundation"
        onFill={(foundationData) => {
          onChange(foundationData);
          setSectionState(prev => ({
            ...prev,
            clientInfo: { ...prev.clientInfo, isValid: true, mode: 'manual' as const },
            financials: { ...prev.financials, isValid: true, mode: 'manual' as const },
          }));
        }}
      />

    </div>
  );
}

export default FoundationStep;
