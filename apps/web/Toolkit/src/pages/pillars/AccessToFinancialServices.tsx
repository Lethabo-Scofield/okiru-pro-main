import { useMemo } from "react";
import { useBbeeStore } from "@toolkit/lib/store";
import { calculateAfsScore } from "@toolkit/lib/calculators/afs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Building2, Landmark, Shield } from "lucide-react";
import { cn } from "@toolkit/lib/utils";
import {
  FSC_SUB_SECTOR_LABELS,
  fscSubSectorDisplayLabel,
  normalizeFscSubSector,
} from "@toolkit/lib/sectors/fsc-utils";

export default function AccessToFinancialServices() {
  const { afs, client, calculatorConfig, updateAfs, setFscSubSector } = useBbeeStore();
  const subSector = normalizeFscSubSector(client.fscSubSector);
  const afsCfg = calculatorConfig?.accessToFinancialServices;

  const result = useMemo(() => {
    if (!calculatorConfig || !afsCfg) return null;
    return calculateAfsScore(afs, calculatorConfig);
  }, [afs, calculatorConfig, afsCfg]);

  if (!calculatorConfig) {
    return <div className="p-8 text-center text-muted-foreground">Loading calculator config…</div>;
  }

  if (client.sectorCode?.toUpperCase() !== "FSC") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Access to Financial Services applies to the Financial Sector Code (FSC) only.
      </div>
    );
  }

  if (!afsCfg) {
    return (
      <div className="space-y-4 p-8 max-w-xl mx-auto">
        <h1 className="text-2xl font-heading font-bold">Access to Financial Services</h1>
        <p className="text-muted-foreground text-sm">
          AFS (12 pts) applies to Banks, Long-Term Insurers, and Short-Term Insurers only.
          Select a sub-sector under Company Information to enable this pillar.
        </p>
        <div className="space-y-2">
          <Label>FSC Sub-Sector</Label>
          <Select
            value={client.fscSubSector ?? "Others"}
            onValueChange={(v) => setFscSubSector(normalizeFscSubSector(v) as typeof client.fscSubSector)}
          >
            <SelectTrigger><SelectValue placeholder="Select sub-sector" /></SelectTrigger>
            <SelectContent>
              {FSC_SUB_SECTOR_LABELS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  const SubIcon = subSector === "Banks" ? Landmark : subSector === "STI" ? Shield : Building2;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SubIcon className="h-5 w-5 text-primary" />
            <Badge variant="outline">{fscSubSectorDisplayLabel(subSector)}</Badge>
          </div>
          <h1 className="text-3xl font-heading font-bold">Access to Financial Services</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            First-order providers score geographic access, product appropriateness, or policy penetration — structure differs by FSC sub-sector (12 pts total).
          </p>
        </div>
        <Card className="glass-panel min-w-[140px]">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">AFS Score</p>
            <p className="text-2xl font-bold font-mono text-primary">{(result?.total ?? 0).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">/ {afsCfg.maxPoints} pts</p>
          </CardContent>
        </Card>
      </div>

      {subSector === "Banks" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="glass-panel">
            <CardHeader><CardTitle className="text-base">Geographic access (6 pts)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Transaction Point coverage within 5km (%)" hint="Target 85% of qualifying area — 1 pt">
                <Input type="number" min={0} max={100} value={afs.transactionPointCoverage ?? ""} onChange={(e) => updateAfs({ transactionPointCoverage: Number(e.target.value) })} />
              </Field>
              <Field label="Service Point coverage within 10km (%)" hint="Target 70% — 1 pt">
                <Input type="number" min={0} max={100} value={afs.servicePointCoverage ?? ""} onChange={(e) => updateAfs({ servicePointCoverage: Number(e.target.value) })} />
              </Field>
              <Field label="Sales Point coverage within 15km (%)" hint="Target 60% — 2 pts">
                <Input type="number" min={0} max={100} value={afs.salesPointCoverage ?? ""} onChange={(e) => updateAfs({ salesPointCoverage: Number(e.target.value) })} />
              </Field>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardHeader><CardTitle className="text-base">Electronic & product access (6 pts)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <BoolField label="Electronic access — target market account holders (2 pts)" checked={!!afs.electronicAccessCompliant} onChange={(v) => updateAfs({ electronicAccessCompliant: v })} />
              <BoolField label="At least one Point of Presence per measurement unit (3 pts)" checked={!!afs.hasPointOfPresence} onChange={(v) => updateAfs({ hasPointOfPresence: v })} />
              <BoolField label="Active accounts with qualifying products in target market (3 pts)" checked={!!afs.activeAccountsCompliant} onChange={(v) => updateAfs({ activeAccountsCompliant: v })} />
            </CardContent>
          </Card>
        </div>
      )}

      {subSector === "LTI" && (
        <Card className="glass-panel">
          <CardHeader><CardTitle className="text-base">LTI AFS indicators</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Compliant appropriate products (numerator)" hint="3 pts — ratio vs total developed products">
              <Input type="number" min={0} value={afs.appropriateProductsNumerator ?? ""} onChange={(e) => updateAfs({ appropriateProductsNumerator: Number(e.target.value) })} />
            </Field>
            <Field label="Total developed products (denominator)">
              <Input type="number" min={0} value={afs.appropriateProductsDenominator ?? ""} onChange={(e) => updateAfs({ appropriateProductsDenominator: Number(e.target.value) })} />
            </Field>
            <Field label="On-book policies (Market Penetration)" hint="7 pts vs SAIA communicated">
              <Input type="number" min={0} value={afs.marketPenetrationPolicies ?? ""} onChange={(e) => updateAfs({ marketPenetrationPolicies: Number(e.target.value) })} />
            </Field>
            <Field label="SAIA communicated policies (denominator)">
              <Input type="number" min={0} value={afs.saiaCommunicatedPolicies ?? ""} onChange={(e) => updateAfs({ saiaCommunicatedPolicies: Number(e.target.value) })} />
            </Field>
            <Field label="Transactional access — polygon coverage (%)" hint="Target 80% — 2 pts">
              <Input type="number" min={0} max={100} value={afs.transactionalAccessCoverage ?? ""} onChange={(e) => updateAfs({ transactionalAccessCoverage: Number(e.target.value) })} />
            </Field>
          </CardContent>
        </Card>
      )}

      {subSector === "STI" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="glass-panel">
            <CardHeader><CardTitle className="text-base">Appropriate commercial products (2 pts)</CardTitle>
              <CardDescription>Tick each commercial line offered with qualifying products (100% each, 6 lines × ⅓ pt).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {([
                ["commercialEquipment", "Equipment"],
                ["commercialLiability", "Liability"],
                ["commercialProperty", "Property"],
                ["commercialAgriculture", "Agriculture"],
                ["commercialLivestock", "Livestock"],
                ["commercialOther", "Other"],
              ] as const).map(([key, label]) => (
                <BoolField key={key} label={label} checked={!!afs[key]} onChange={(v) => updateAfs({ [key]: v })} />
              ))}
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardHeader><CardTitle className="text-base">Insurance policies (10 pts)</CardTitle></CardHeader>
            <CardContent>
              <BoolField label="Personal lines — qualifying insurance policies at 100% target" checked={!!afs.insurancePoliciesCompliant} onChange={(v) => updateAfs({ insurancePoliciesCompliant: v })} />
            </CardContent>
          </Card>
        </div>
      )}

      {result && result.lines.length > 0 && (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Scorecard breakdown</CardTitle>
            <CardDescription>Practitioner-facing AFS indicators for {fscSubSectorDisplayLabel(subSector)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Indicator</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Target</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Max</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.lines.map((line) => (
                    <tr key={line.code}>
                      <td className="px-4 py-2">{line.name}</td>
                      <td className="px-4 py-2 text-right font-mono">{line.target}</td>
                      <td className="px-4 py-2 text-right font-mono">{line.maxPoints}</td>
                      <td className={cn("px-4 py-2 text-right font-mono font-bold", line.score > 0 ? "text-primary" : "text-muted-foreground")}>{line.score.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function BoolField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <Label className="text-sm font-normal leading-snug cursor-pointer" onClick={() => onChange(!checked)}>{label}</Label>
    </div>
  );
}
