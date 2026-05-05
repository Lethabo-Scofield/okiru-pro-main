import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@toolkit/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Textarea } from "@toolkit/components/ui/textarea";
import { Checkbox } from "@toolkit/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@toolkit/components/ui/select";
import { ArrowRight, Building2, Loader2 } from "lucide-react";

const ROLE_OPTIONS = [
  "Owner / Founder",
  "CEO / Managing Director",
  "Executive (C-Level)",
  "Director / Head of Department",
  "Manager",
  "Compliance / BEE Officer",
  "Finance (CFO, Accountant, etc.)",
  "HR / Operations",
  "Consultant / Advisor",
  "Other",
];

const BEE_LEVELS = [
  "Level 1",
  "Level 2",
  "Level 3",
  "Level 4",
  "Level 5",
  "Level 6",
  "Level 7",
  "Level 8",
  "Non-compliant / No BEE level",
  "Not sure",
];

const EMPLOYEE_RANGES = ["1 – 10", "11 – 50", "51 – 100", "101 – 250", "251 – 500", "500+"];

const INDUSTRIES = [
  "Technology / Software",
  "Financial Services",
  "Manufacturing",
  "Retail / E-commerce",
  "Healthcare",
  "Construction / Engineering",
  "Mining / Resources",
  "Telecommunications",
  "Logistics / Transport",
  "Education",
  "Professional Services (Legal, Consulting, etc.)",
  "Hospitality / Tourism",
  "Agriculture",
  "Other",
];

const REVENUE_RANGES = [
  "R0 – R10 million",
  "R10 million – R50 million",
  "R50 million – R100 million",
  "R100 million+",
];

const ACQUISITION_SOURCES = [
  "Google Search",
  "Social Media (LinkedIn, Facebook, etc.)",
  "Referral / Word of Mouth",
  "Email Campaign",
  "Event / Webinar",
  "Partner / Affiliate",
  "Online Ads",
  "Other",
];

const TOOLS = [
  "BE123",
  "Empowered",
  "Excel / Spreadsheets",
  "Custom Internal System",
  "None",
  "Other",
];

// Map historical/short labels to current canonical option text so existing
// company profiles prefill into the right dropdown after spec rename.
const LEGACY_INDUSTRY: Record<string, string> = {
  Technology: "Technology / Software",
  Mining: "Mining / Resources",
  Logistics: "Logistics / Transport",
  "Professional Services": "Professional Services (Legal, Consulting, etc.)",
  Hospitality: "Hospitality / Tourism",
};
const LEGACY_ROLE: Record<string, string> = {
  Finance: "Finance (CFO, Accountant, etc.)",
};
const LEGACY_SOURCE: Record<string, string> = {
  Google: "Google Search",
  "Social Media": "Social Media (LinkedIn, Facebook, etc.)",
  Referral: "Referral / Word of Mouth",
  Email: "Email Campaign",
  Event: "Event / Webinar",
  Partner: "Partner / Affiliate",
  Ads: "Online Ads",
};
const LEGACY_TOOL: Record<string, string> = {
  Excel: "Excel / Spreadsheets",
  "Custom System": "Custom Internal System",
};
const LEGACY_EMPLOYEES: Record<string, string> = {
  "1–10": "1 – 10",
  "11–50": "11 – 50",
  "51–100": "51 – 100",
  "101–250": "101 – 250",
  "251–500": "251 – 500",
};
const LEGACY_REVENUE: Record<string, string> = {
  "R0–R10M": "R0 – R10 million",
  "R10M–R50M": "R10 million – R50 million",
  "R50M–R100M": "R50 million – R100 million",
  "R100M+": "R100 million+",
};
const normalize = (val: any, map: Record<string, string>): string =>
  typeof val === "string" && map[val] ? map[val] : val || "";

interface FormState {
  companyName: string;
  role: string;
  roleOther: string;
  beeLevel: string;
  employeeRange: string;
  industry: string;
  industryOther: string;
  annualRevenue: string;
  acquisitionSource: string;
  acquisitionSourceOther: string;
  toolsUsed: string[];
  toolsOther: string;
  biggestChallenge: string;
}

const EMPTY_FORM: FormState = {
  companyName: "",
  role: "",
  roleOther: "",
  beeLevel: "",
  employeeRange: "",
  industry: "",
  industryOther: "",
  annualRevenue: "",
  acquisitionSource: "",
  acquisitionSourceOther: "",
  toolsUsed: [],
  toolsOther: "",
  biggestChallenge: "",
};

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { redirectTo } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("redirect") || "";
    const safe = raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
    return { redirectTo: safe };
  }, []);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/me", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const p = data?.profile ?? data;
          if (p && typeof p === "object" && (p.companyName || p.role || p.industry)) {
            if (!p.companyName && (user as any)?.organizationName) {
              p.companyName = (user as any).organizationName;
            }
            // Normalize legacy/short labels to current canonical text first.
            p.role = normalize(p.role, LEGACY_ROLE);
            p.industry = normalize(p.industry, LEGACY_INDUSTRY);
            p.acquisitionSource = normalize(p.acquisitionSource, LEGACY_SOURCE);
            p.employeeRange = normalize(p.employeeRange, LEGACY_EMPLOYEES);
            p.annualRevenue = normalize(p.annualRevenue, LEGACY_REVENUE);
            const knownRole = ROLE_OPTIONS.includes(p.role || "");
            const knownIndustry = INDUSTRIES.includes(p.industry || "");
            const knownSource = ACQUISITION_SOURCES.includes(p.acquisitionSource || "");
            const rawToolsRaw: string[] = Array.isArray(p.toolsUsed) ? p.toolsUsed : [];
            const rawTools = rawToolsRaw.map((t) => normalize(t, LEGACY_TOOL));
            const knownTools = rawTools.filter((t) => TOOLS.includes(t));
            const unknownTools = rawTools.filter((t) => !TOOLS.includes(t));
            // Legacy fallback: if backend stored inlined "Other" values in the
            // main field (no dedicated *Other column), surface that text in the
            // free-text input. Prefer the dedicated *Other field when present.
            const industryOther = p.industryOther || (!knownIndustry && p.industry ? p.industry : "");
            const sourceOther =
              p.acquisitionSourceOther || (!knownSource && p.acquisitionSource ? p.acquisitionSource : "");
            const toolsOtherText =
              p.toolsUsedOther || (unknownTools.length ? unknownTools.join(", ") : "");
            setForm({
              companyName: p.companyName || "",
              role: knownRole ? p.role || "" : p.role ? "Other" : "",
              roleOther: knownRole ? "" : p.role || "",
              beeLevel: p.beeLevel || "",
              employeeRange: p.employeeRange || "",
              industry: knownIndustry ? p.industry || "" : p.industry ? "Other" : industryOther ? "Other" : "",
              industryOther,
              annualRevenue: p.annualRevenue || "",
              acquisitionSource: knownSource
                ? p.acquisitionSource || ""
                : p.acquisitionSource
                  ? "Other"
                  : sourceOther
                    ? "Other"
                    : "",
              acquisitionSourceOther: sourceOther,
              toolsUsed:
                unknownTools.length || (toolsOtherText && !knownTools.includes("Other"))
                  ? [...knownTools, "Other"]
                  : knownTools,
              toolsOther: toolsOtherText,
              biggestChallenge: p.biggestChallenge || "",
            });
          }
        }
        // No saved profile yet — pre-fill company name from the user's workspace.
        if ((user as any)?.organizationName) {
          setForm(prev =>
            prev.companyName ? prev : { ...prev, companyName: (user as any).organizationName }
          );
        }
      } catch {
        // ignore — fresh form
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTool = (tool: string) => {
    setForm((prev) => ({
      ...prev,
      toolsUsed: prev.toolsUsed.includes(tool)
        ? prev.toolsUsed.filter((t) => t !== tool)
        : [...prev.toolsUsed, tool],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) {
      toast({
        title: "Company name is required",
        description: "Tell us which company this profile belongs to.",
        variant: "destructive",
      });
      return;
    }

    // Role has no dedicated *Other column on the backend, so we still inline.
    const finalRole = form.role === "Other" ? form.roleOther.trim() || "Other" : form.role || null;
    // For industry/source/tools, the backend has dedicated *Other columns,
    // so send the option literal ("Other") plus the free-text in its own field.
    const finalIndustryOther = form.industry === "Other" ? form.industryOther.trim() || null : null;
    const finalSourceOther =
      form.acquisitionSource === "Other" ? form.acquisitionSourceOther.trim() || null : null;
    const finalToolsOther = form.toolsUsed.includes("Other")
      ? form.toolsOther.trim() || null
      : null;

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          role: finalRole,
          beeLevel: form.beeLevel || null,
          employeeRange: form.employeeRange || null,
          industry: form.industry || null,
          industryOther: finalIndustryOther,
          annualRevenue: form.annualRevenue || null,
          acquisitionSource: form.acquisitionSource || null,
          acquisitionSourceOther: finalSourceOther,
          toolsUsed: form.toolsUsed,
          toolsUsedOther: finalToolsOther,
          biggestChallenge: form.biggestChallenge.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to save");
      }
      toast({
        title: "Profile saved",
        description: "Welcome aboard — let's continue.",
      });

      const dest = redirectTo || "/certificates";
      const isCertificates = dest === "/certificates" || dest.startsWith("/certificates?");
      const finalDest = isCertificates
        ? dest.includes("?")
          ? `${dest}&openUpload=1`
          : `${dest}?openUpload=1`
        : dest;
      navigate(finalDest, { replace: true });
    } catch (err: any) {
      toast({
        title: "Couldn't save profile",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="min-h-full flex items-start justify-center px-4 py-8 sm:py-12">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/50"
          data-testid="onboarding-popup"
        >
          <div className="px-6 sm:px-8 py-6 border-b border-border/40">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Step 2 of 2 — Company onboarding
                </p>
                <h1 id="onboarding-title" className="text-xl sm:text-2xl font-semibold truncate">
                  Tell us about{user?.fullName ? ` ${user.fullName}'s` : " your"} company
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-primary" />
              <div className="h-1.5 flex-1 rounded-full bg-primary" />
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground">
              This helps us tailor your B-BBEE scorecards, link future certificates, and surface the
              right insights for your team.
            </p>
          </div>

        <form onSubmit={handleSubmit} className="px-6 sm:px-8 py-6 space-y-6" data-testid="onboarding-form">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="companyName">
                Company Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(e) => setField("companyName", e.target.value)}
                placeholder="e.g. Okiru (Pty) Ltd"
                required
                maxLength={200}
                data-testid="input-company-name"
              />
            </div>

            <div className="space-y-2">
              <Label>Your Role</Label>
              <Select value={form.role} onValueChange={(v) => setField("role", v)}>
                <SelectTrigger data-testid="select-role">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.role === "Other" && (
                <Input
                  value={form.roleOther}
                  onChange={(e) => setField("roleOther", e.target.value)}
                  placeholder="Tell us your role"
                  maxLength={120}
                  data-testid="input-role-other"
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>BEE Level</Label>
                <Select value={form.beeLevel} onValueChange={(v) => setField("beeLevel", v)}>
                  <SelectTrigger data-testid="select-bee-level">
                    <SelectValue placeholder="Select a BEE level" />
                  </SelectTrigger>
                  <SelectContent>
                    {BEE_LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Number of Employees</Label>
                <Select
                  value={form.employeeRange}
                  onValueChange={(v) => setField("employeeRange", v)}
                >
                  <SelectTrigger data-testid="select-employees">
                    <SelectValue placeholder="Select a range" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_RANGES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={form.industry} onValueChange={(v) => setField("industry", v)}>
                <SelectTrigger data-testid="select-industry">
                  <SelectValue placeholder="Select an industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.industry === "Other" && (
                <Input
                  value={form.industryOther}
                  onChange={(e) => setField("industryOther", e.target.value)}
                  placeholder="Tell us your industry"
                  maxLength={120}
                  data-testid="input-industry-other"
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Annual Revenue</Label>
                <Select
                  value={form.annualRevenue}
                  onValueChange={(v) => setField("annualRevenue", v)}
                >
                  <SelectTrigger data-testid="select-revenue">
                    <SelectValue placeholder="Select a range" />
                  </SelectTrigger>
                  <SelectContent>
                    {REVENUE_RANGES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>How did you hear about us</Label>
                <Select
                  value={form.acquisitionSource}
                  onValueChange={(v) => setField("acquisitionSource", v)}
                >
                  <SelectTrigger data-testid="select-source">
                    <SelectValue placeholder="Select a source" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACQUISITION_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.acquisitionSource === "Other" && (
                  <Input
                    value={form.acquisitionSourceOther}
                    onChange={(e) => setField("acquisitionSourceOther", e.target.value)}
                    placeholder="Please specify"
                    maxLength={120}
                    data-testid="input-source-other"
                  />
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Current Tools</Label>
                <p className="text-xs text-muted-foreground mt-1">Select all that apply</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TOOLS.map((tool) => {
                  const checked = form.toolsUsed.includes(tool);
                  return (
                    <label
                      key={tool}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                        checked
                          ? "border-primary/60 bg-primary/10"
                          : "border-border hover:border-border/80"
                      }`}
                      data-testid={`tool-${tool.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTool(tool)}
                      />
                      <span className="text-sm">{tool}</span>
                    </label>
                  );
                })}
              </div>
              {form.toolsUsed.includes("Other") && (
                <Input
                  value={form.toolsOther}
                  onChange={(e) => setField("toolsOther", e.target.value)}
                  placeholder="Please specify other tools"
                  maxLength={200}
                  data-testid="input-tools-other"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="challenge">Biggest Challenge (optional)</Label>
              <Textarea
                id="challenge"
                value={form.biggestChallenge}
                onChange={(e) => setField("biggestChallenge", e.target.value)}
                placeholder="What's the biggest B-BBEE compliance challenge you're facing right now?"
                rows={4}
                maxLength={2000}
                data-testid="input-challenge"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-border/40">
            <p className="text-[11px] text-muted-foreground">
              You can update these details later from your profile.
            </p>
            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              data-testid="btn-continue"
              className="min-w-[220px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  Continue to Certificates <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
