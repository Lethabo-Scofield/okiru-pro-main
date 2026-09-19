import { useState } from "react";
import { getProvinces, getEapReportYears } from "@toolkit/lib/calculators/eapTargets";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import {
  Settings as SettingsIcon,
  Save,
  ChevronRight,
  Loader2,
  User,
  Shield,
  ArrowUpCircle,
} from "lucide-react";
import { useBbeeStore } from "@toolkit/lib/store";
import { useAuth } from "@toolkit/lib/auth";
import { useToast } from "@toolkit/hooks/use-toast";
import { motion } from "framer-motion";
import { cn } from "@toolkit/lib/utils";

export default function Settings() {
  const { client, updateSettings, updateIndustry, updateEapYear, activeClientId, clearSaveError } = useBbeeStore();
  const { user } = useAuth();
  const { toast } = useToast();

  const [province, setProvince] = useState(client.eapProvince);
  const [industry, setIndustry] = useState(client.industry);
  const [eapYear, setEapYear] = useState<number | undefined>(client.eapYear);
  const [measureStart, setMeasureStart] = useState(client.measurementPeriodStart || '');
  const [measureEnd, setMeasureEnd] = useState(client.measurementPeriodEnd || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    // A save with no active client persists nowhere. Saying "Saved" there is the
    // phantom-save pattern: the toast becomes the only evidence anything happened.
    if (!activeClientId) {
      toast({
        title: "No active client",
        description: "Open a company before changing its preferences.",
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);
    clearSaveError();
    try {
      // CRITICAL: the industry field is the industry VERTICAL (Manufacturing,
      // Retail, etc.) used for the industry-norm lookup — it is NOT the scorecard
      // sector code. This handler once passed it as the industrySector argument
      // to updateSettings, silently overwriting the sector code that drives the
      // entire scorecard configuration. It now uses updateIndustry (which targets
      // client.industry) and PRESERVES the sector code via client.industrySector.
      await updateSettings(province, client.industrySector || "", measureStart || undefined, measureEnd || undefined);
      if (industry !== client.industry) await updateIndustry(industry);
      if (eapYear !== client.eapYear) await updateEapYear(eapYear);

      // _persistSave absorbs rejections into saveError so one failed write cannot
      // unmount the page. Read it back rather than assuming success — otherwise a
      // rejected PATCH shows "Settings Saved" and the store’s own failure toast
      // at the same time.
      const failure = useBbeeStore.getState().saveError;
      if (failure) {
        toast({ title: "Settings not saved", description: failure, variant: "destructive" });
        return;
      }
      toast({ title: "Settings Saved", description: "Client preferences updated." });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save settings.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };


  const ROLE_LABELS: Record<string, string> = {
    auditor: 'B-BBEE Auditor',
    analyst: 'Compliance Analyst',
    manager: 'Team Manager',
    admin: 'Administrator',
  };

  const ROLE_HIERARCHY = ['auditor', 'analyst', 'manager'];

  const currentRole = user?.role || 'auditor';
  const currentRoleIndex = ROLE_HIERARCHY.indexOf(currentRole);
  const canUpgrade = currentRoleIndex >= 0 && currentRoleIndex < ROLE_HIERARCHY.length - 1;
  const nextRole = canUpgrade ? ROLE_HIERARCHY[currentRoleIndex + 1] : null;

  const [isRequestingUpgrade, setIsRequestingUpgrade] = useState(false);

  const handleRequestUpgrade = async () => {
    if (!nextRole) return;
    setIsRequestingUpgrade(true);
    try {
      const res = await fetch('/api/auth/request-role-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestedRole: nextRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Upgrade Requested", description: data.message || `Your request to upgrade to ${ROLE_LABELS[nextRole]} has been submitted.` });
      } else {
        toast({ title: "Request Failed", description: data.message || "Could not submit upgrade request.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to submit upgrade request.", variant: "destructive" });
    } finally {
      setIsRequestingUpgrade(false);
    }
  };

  const sectorLabel = [client.sectorCode, client.scorecardType || client.companySize].filter(Boolean).join(' · ');

  return (
    <motion.div
      className="space-y-6 max-w-3xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Account, appearance, and client preferences. Scoring rules come from sector config only.</p>
      </div>

      <Card className="glass-panel">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Account & Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <div className="text-sm font-medium mt-1">{user?.fullName || user?.username || '—'}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <div className="text-sm font-medium mt-1">{user?.email || '—'}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Organization</Label>
              <div className="text-sm font-medium mt-1">{user?.organizationName || '—'}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Username</Label>
              <div className="text-sm font-medium mt-1">{user?.username || '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Role & Permissions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{ROLE_LABELS[currentRole] || currentRole}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {currentRole === 'auditor' && 'Conduct and manage compliance audits'}
                {currentRole === 'analyst' && 'Analyze scorecard data and generate reports'}
                {currentRole === 'manager' && 'Oversee audit teams and review results'}
                {currentRole === 'admin' && 'Full system access and user management'}
              </div>
            </div>
            <span className={cn(
              "px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider",
              currentRole === 'admin' ? "bg-violet-500/15 text-violet-400" :
              currentRole === 'manager' ? "bg-amber-500/15 text-amber-400" :
              currentRole === 'analyst' ? "bg-blue-500/15 text-blue-400" :
              "bg-emerald-500/15 text-emerald-400"
            )}>
              {currentRole}
            </span>
          </div>

          {canUpgrade && nextRole && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center gap-3">
                <ArrowUpCircle className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-sm font-medium">Upgrade to {ROLE_LABELS[nextRole]}</div>
                  <div className="text-xs text-muted-foreground">Request elevated permissions from your admin</div>
                </div>
              </div>
              <Button
                size="sm"
                className="rounded-full gap-1.5 h-8"
                onClick={handleRequestUpgrade}
                disabled={isRequestingUpgrade}
              >
                {isRequestingUpgrade ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
                Request Upgrade
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role Progression</div>
            <div className="flex items-center gap-1">
              {ROLE_HIERARCHY.map((role, i) => (
                <div key={role} className="flex items-center gap-1">
                  <div className={cn(
                    "px-3 py-1.5 rounded-lg text-[12px] font-medium",
                    i <= currentRoleIndex
                      ? "bg-primary/15 text-primary border border-primary/25"
                      : "bg-muted/40 text-muted-foreground border border-border/30"
                  )}>
                    {ROLE_LABELS[role]}
                  </div>
                  {i < ROLE_HIERARCHY.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            Client Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sectorLabel && (
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2 text-[12px] text-muted-foreground">
              Scoring rules and level thresholds are loaded from sector config: <span className="font-medium text-foreground">{sectorLabel}</span>
            </div>
          )}

          <div className="grid gap-2">
            <Label className="text-[13px]">EAP Province</Label>
            <Select value={province} onValueChange={(v) => setProvince(v as typeof province)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select Province" />
              </SelectTrigger>
              <SelectContent>
                {getProvinces().map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Demographic targets for Management Control.</p>
          </div>

          <div className="grid gap-2">
            <Label className="text-[13px]">EAP Report Year (CEE)</Label>
            <Select
              value={eapYear === undefined ? 'latest' : String(eapYear)}
              onValueChange={(v) => setEapYear(v === 'latest' ? undefined : Number(v))}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Latest CEE report" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest ({getEapReportYears()[0]} — current CEE report)</SelectItem>
                {getEapReportYears().map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              CEE EAP dataset vintage the MC &amp; Skills demographic targets score against. Use the year your measurement period was verified under.
            </p>
          </div>

          <div className="grid gap-2">
            <Label className="text-[13px]">Industry Sector</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select Sector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Generic">Generic / General</SelectItem>
                <SelectItem value="ICT">ICT Sector</SelectItem>
                <SelectItem value="Construction">Construction</SelectItem>
                <SelectItem value="Financial">Financial</SelectItem>
                <SelectItem value="Transport">Transport & Logistics</SelectItem>
                <SelectItem value="Mining">Mining & Quarrying</SelectItem>
                <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                <SelectItem value="Retail">Retail</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Used for deemed NPAT and industry norm comparisons only — does not override scorecard sector rules.</p>
          </div>

          <div className="grid gap-2">
            <Label className="text-[13px]">Measurement Period</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Start</Label>
                <Input
                  type="month"
                  className="h-9 font-mono text-sm"
                  value={measureStart}
                  onChange={e => setMeasureStart(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">End</Label>
                <Input
                  type="month"
                  className="h-9 font-mono text-sm"
                  value={measureEnd}
                  onChange={e => setMeasureEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">12-month B-BBEE measurement period for this verification.</p>
          </div>

          <Button className="w-full gap-2 mt-2 rounded-full h-10" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Saving..." : "Save Preferences"}
          </Button>
        </CardContent>
      </Card>

    </motion.div>
  );
}
