import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Building2, MapPin, Phone, Mail, User, Hash, Calendar, Users, Briefcase, Loader2 } from "lucide-react";
import { cn } from "@toolkit/lib/utils";
import type { Client } from "@toolkit/lib/types";
import { API_BASE } from "@toolkit/lib/config";

// Sector option from API
export interface SectorOption {
  value: string;
  label: string;
  code: string;
  hasQSE: boolean;
  availableTypes: string[];
}

// Extended client interface matching TOOLKIT_TAB_MAP.md Sheet 1
export interface ClientInformationData {
  // Company identification
  companyName: string;
  tradingName?: string;
  registrationNumber: string;
  vatNumber?: string;
  taxNumber?: string;
  
  // Addresses
  physicalAddress: string;
  postalAddress?: string;
  
  // Contact details
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  
  // BEE specifics - now any string (validated against API)
  sectorCode: string;
  industry: string;
  /** EAP province for Management Control (Senior/Middle/Junior targets). Falls back to parsing physicalAddress. */
  eapProvince?: Client['eapProvince'];
  
  // Financials for sizing
  annualTurnover: number;
  numberOfEmployees: number;
  
  // Measurement period
  financialYearEnd: string;
  measurementPeriodStart?: string;
  measurementPeriodEnd?: string;
  
  // Verification details
  beeCertificateNumber?: string;
  beeCertificateExpiry?: string;
  beeCertificateLevel?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  verificationAgency?: string;
}

interface ClientInformationFormProps {
  data: ClientInformationData;
  onChange: (data: ClientInformationData) => void;
  className?: string;
  readOnly?: boolean;
}

// Fallback sectors if API fails
const FALLBACK_SECTOR_OPTIONS: SectorOption[] = [
  { value: 'RCOGP', label: 'Revised Codes of Good Practice (RCOGP)', code: 'RCOGP', hasQSE: true, availableTypes: ['Generic', 'QSE'] },
  { value: 'ICT', label: 'ICT Sector Code', code: 'ICT', hasQSE: true, availableTypes: ['Generic', 'QSE'] },
  { value: 'FSC', label: 'Financial Sector Code (FSC)', code: 'FSC', hasQSE: false, availableTypes: ['Generic'] },
  { value: 'AGRI', label: 'AgriBEE Sector Code', code: 'AGRI', hasQSE: false, availableTypes: ['Generic'] },
  { value: 'CONSTRUCTION', label: 'Construction Sector Code', code: 'CONSTRUCTION', hasQSE: true, availableTypes: ['Contractor', 'BEP', 'QSE'] },
];

const INDUSTRY_OPTIONS = [
  'Retail', 'Manufacturing', 'IT Services', 'Financial Services', 
  'Construction', 'Agriculture', 'Mining', 'Transport', 
  'Hospitality', 'Healthcare', 'Education', 'Professional Services',
  'Real Estate', 'Telecommunications', 'Energy', 'Other'
];

export const EMPTY_CLIENT_INFO: ClientInformationData = {
  companyName: '',
  tradingName: '',
  registrationNumber: '',
  vatNumber: '',
  taxNumber: '',
  physicalAddress: '',
  postalAddress: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  sectorCode: 'RCOGP',
  industry: 'Other',
  eapProvince: undefined,
  annualTurnover: 0,
  numberOfEmployees: 0,
  financialYearEnd: '',
  measurementPeriodStart: '',
  measurementPeriodEnd: '',
  beeCertificateNumber: '',
  beeCertificateExpiry: '',
  beeCertificateLevel: undefined,
  verificationAgency: '',
};

/**
 * Determines company size based on turnover
 */
export function determineCompanySize(turnover: number): 'EME' | 'QSE' | 'Generic' {
  if (turnover < 10000000) return 'EME'; // < R10M
  if (turnover <= 50000000) return 'QSE'; // R10M - R50M
  return 'Generic'; // > R50M
}

/**
 * Checks if QSE variant is available for this sector
 * Note: In component, use selectedSector.hasQSE instead for API-backed check
 */
export function hasQSEVariant(sectorCode: string): boolean {
  // Fallback for external usage - should validate against API
  const sector = FALLBACK_SECTOR_OPTIONS.find(s => s.code === sectorCode);
  return sector?.hasQSE ?? false;
}

export function ClientInformationForm({ data, onChange, className, readOnly }: ClientInformationFormProps) {
  const [sectorOptions, setSectorOptions] = useState<SectorOption[]>(FALLBACK_SECTOR_OPTIONS);
  const [loadingSectors, setLoadingSectors] = useState(true);
  const [sectorError, setSectorError] = useState<string | null>(null);

  // Fetch sectors from API on mount
  useEffect(() => {
    const fetchSectors = async () => {
      try {
        setLoadingSectors(true);
        const response = await fetch(`${API_BASE}/api/sectors/options`);
        if (!response.ok) {
          throw new Error(`Failed to fetch sectors: ${response.statusText}`);
        }
        const result = await response.json();
        if (result.success && result.options && result.options.length > 0) {
          setSectorOptions(result.options);
          setSectorError(null);
        } else {
          // API returned empty, use fallback but log it
          console.warn('[ClientInfo] API returned empty sectors, using fallback');
          setSectorOptions(FALLBACK_SECTOR_OPTIONS);
        }
      } catch (error) {
        console.error('[ClientInfo] Error fetching sectors:', error);
        setSectorError('Failed to load sectors from server');
        setSectorOptions(FALLBACK_SECTOR_OPTIONS);
      } finally {
        setLoadingSectors(false);
      }
    };

    fetchSectors();
  }, []);

  const updateField = <K extends keyof ClientInformationData>(field: K, value: ClientInformationData[K]) => {
    onChange({ ...data, [field]: value });
  };

  const companySize = determineCompanySize(data.annualTurnover);
  const selectedSector = sectorOptions.find(s => s.code === data.sectorCode);
  const qseAvailable = selectedSector?.hasQSE ?? false;
  const effectiveSize = (companySize === 'QSE' && !qseAvailable) ? 'Generic' : companySize;

  // Redirect to valid sector if current selection no longer exists
  useEffect(() => {
    if (!loadingSectors && sectorOptions.length > 0 && !sectorOptions.find(s => s.code === data.sectorCode)) {
      // Current sector not in available options, reset to first available
      updateField('sectorCode', sectorOptions[0].code);
    }
  }, [loadingSectors, sectorOptions, data.sectorCode]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Company Size Banner */}
      <div className="p-4 rounded-lg border border-border/80 bg-muted/20 flex items-center gap-3 text-foreground">
        <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold">
            {effectiveSize === 'EME' ? 'EME (Exempted Micro Enterprise)' : 
             effectiveSize === 'QSE' ? 'QSE (Qualifying Small Enterprise)' : 
             'Generic Enterprise'}
          </span>
          <span className="text-sm ml-2 text-muted-foreground">
            Based on R {data.annualTurnover.toLocaleString()} turnover
          </span>
        </div>
      </div>

      {/* Company Identification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5 text-primary" />
            Company Identification
          </CardTitle>
          <CardDescription>
            Legal entity details as registered with CIPC
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                value={data.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                placeholder="Legal entity name"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tradingName">Trading Name (DBA)</Label>
              <Input
                id="tradingName"
                value={data.tradingName || ''}
                onChange={(e) => updateField('tradingName', e.target.value)}
                placeholder="If different from company name"
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="registrationNumber" className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                Registration Number *
              </Label>
              <Input
                id="registrationNumber"
                value={data.registrationNumber}
                onChange={(e) => updateField('registrationNumber', e.target.value)}
                placeholder="CIPC number"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatNumber">VAT Number</Label>
              <Input
                id="vatNumber"
                value={data.vatNumber || ''}
                onChange={(e) => updateField('vatNumber', e.target.value)}
                placeholder="SARS VAT number"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxNumber">Tax Number</Label>
              <Input
                id="taxNumber"
                value={data.taxNumber || ''}
                onChange={(e) => updateField('taxNumber', e.target.value)}
                placeholder="SARS income tax"
                disabled={readOnly}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Addresses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5 text-primary" />
            Addresses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="physicalAddress">Physical Address *</Label>
            <Input
              id="physicalAddress"
              value={data.physicalAddress}
              onChange={(e) => updateField('physicalAddress', e.target.value)}
              placeholder="Street address"
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalAddress">Postal Address (if different)</Label>
            <Input
              id="postalAddress"
              value={data.postalAddress || ''}
              onChange={(e) => updateField('postalAddress', e.target.value)}
              placeholder="PO Box or alternate address"
              disabled={readOnly}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-primary" />
            Contact Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="contactPerson">Contact Person *</Label>
              <Input
                id="contactPerson"
                value={data.contactPerson}
                onChange={(e) => updateField('contactPerson', e.target.value)}
                placeholder="Primary contact name"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail" className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Email *
              </Label>
              <Input
                id="contactEmail"
                type="email"
                value={data.contactEmail}
                onChange={(e) => updateField('contactEmail', e.target.value)}
                placeholder="email@company.com"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone" className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Phone *
              </Label>
              <Input
                id="contactPhone"
                value={data.contactPhone}
                onChange={(e) => updateField('contactPhone', e.target.value)}
                placeholder="+27 ..."
                disabled={readOnly}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BEE Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5 text-primary" />
            B-BBEE Configuration
          </CardTitle>
          <CardDescription>
            Sector and company size determine which scorecard rules apply
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sectorCode" className="flex items-center gap-2">
                Sector Code *
                {loadingSectors && <Loader2 className="h-3 w-3 animate-spin" />}
                {sectorError && <span className="text-xs text-amber-500" title={sectorError}>⚠️</span>}
              </Label>
              <Select
                value={data.sectorCode}
                onValueChange={(v) => updateField('sectorCode', v)}
                disabled={readOnly || loadingSectors}
              >
                <SelectTrigger id="sectorCode">
                  <SelectValue placeholder={loadingSectors ? "Loading sectors..." : "Select sector"} />
                </SelectTrigger>
                <SelectContent>
                  {sectorOptions.map((sector) => (
                    <SelectItem key={sector.code} value={sector.code}>
                      <div className="flex flex-col">
                        <span>{sector.label}</span>
                        {sector.hasQSE && (
                          <span className="text-xs text-muted-foreground">QSE available ({sector.availableTypes?.join(', ')})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sectorError && (
                <p className="text-xs text-amber-500">{sectorError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry *</Label>
              <Select
                value={data.industry}
                onValueChange={(v) => updateField('industry', v)}
                disabled={readOnly}
              >
                <SelectTrigger id="industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map((industry) => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="annualTurnover" className="flex items-center gap-1">
                Annual Turnover (R) *
              </Label>
              <Input
                id="annualTurnover"
                type="number"
                value={data.annualTurnover || ''}
                onChange={(e) => updateField('annualTurnover', Number(e.target.value))}
                placeholder="0"
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Determines EME (&lt;R10M), QSE (R10M-R50M), or Generic (&gt;R50M)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="numberOfEmployees" className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                Number of Employees *
              </Label>
              <Input
                id="numberOfEmployees"
                type="number"
                value={data.numberOfEmployees || ''}
                onChange={(e) => updateField('numberOfEmployees', Number(e.target.value))}
                placeholder="0"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="financialYearEnd" className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Financial Year End *
              </Label>
              <Input
                id="financialYearEnd"
                type="date"
                value={data.financialYearEnd}
                onChange={(e) => updateField('financialYearEnd', e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Measurement Period */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            Measurement Period
          </CardTitle>
          <CardDescription>
            B-BBEE verification period for this assessment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="measurementPeriodStart">Period Start</Label>
              <Input
                id="measurementPeriodStart"
                type="date"
                value={data.measurementPeriodStart || ''}
                onChange={(e) => updateField('measurementPeriodStart', e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="measurementPeriodEnd">Period End</Label>
              <Input
                id="measurementPeriodEnd"
                type="date"
                value={data.measurementPeriodEnd || ''}
                onChange={(e) => updateField('measurementPeriodEnd', e.target.value)}
                disabled={readOnly}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Verification Details (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5 text-primary" />
            Verification Details (Optional)
          </CardTitle>
          <CardDescription>
            Current B-BBEE certificate information if available
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="beeCertificateNumber">Certificate Number</Label>
              <Input
                id="beeCertificateNumber"
                value={data.beeCertificateNumber || ''}
                onChange={(e) => updateField('beeCertificateNumber', e.target.value)}
                placeholder="SANAS or agency number"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="beeCertificateExpiry">Expiry Date</Label>
              <Input
                id="beeCertificateExpiry"
                type="date"
                value={data.beeCertificateExpiry || ''}
                onChange={(e) => updateField('beeCertificateExpiry', e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="beeCertificateLevel">Current Level</Label>
              <Select
                value={data.beeCertificateLevel?.toString() || ''}
                onValueChange={(v) => updateField('beeCertificateLevel', v ? Number(v) as 1|2|3|4|5|6|7|8 : undefined)}
                disabled={readOnly}
              >
                <SelectTrigger id="beeCertificateLevel">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((level) => (
                    <SelectItem key={level} value={level.toString()}>Level {level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="verificationAgency">Verification Agency</Label>
            <Input
              id="verificationAgency"
              value={data.verificationAgency || ''}
              onChange={(e) => updateField('verificationAgency', e.target.value)}
              placeholder="SANAS accredited agency"
              disabled={readOnly}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ClientInformationForm;
