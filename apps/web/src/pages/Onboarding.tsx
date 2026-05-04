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
  "Finance",
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

const EMPLOYEE_RANGES = ["1–10", "11–50", "51–100", "101–250", "251–500", "500+"];

const INDUSTRIES = [
  "Technology",
  "Financial Services",
  "Manufacturing",
  "Retail / E-commerce",
  "Healthcare",
  "Construction / Engineering",
  "Mining",
  "Telecommunications",
  "Logistics",
  "Education",
  "Professional Services",
  "Hospitality",
  "Agriculture",
  "Other",
];

const REVENUE_RANGES = ["R0–R10M", "R10M–R50M", "R50M–R100M", "R100M+"];

const ACQUISITION_SOURCES = [
  "Google",
  "Social Media",
  "Referral",
  "Email",
  "Event",
  "Partner",
  "Ads",
  "Other",
];

const TOOLS = ["BE123", "Empowered", "Excel", "Custom System", "None", "Other"];

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
  toolsUsed: string[];
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
  toolsUsed: [],
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
          if (data?.profile) {
            const p = data.profile;
            const knownRole = ROLE_OPTIONS.includes(p.role || "");
            const knownIndustry = INDUSTRIES.includes(p.industry || "");
            setForm({
              companyName: p.companyName || "",
              role: knownRole ? p.role || "" : p.role ? "Other" : "",
              roleOther: knownRole ? "" : p.role || "",
              beeLevel: p.beeLevel || "",
              employeeRange: p.employeeRange || "",
              industry: knownIndustry ? p.industry || "" : p.industry ? "Other" : "",
              industryOther: knownIndustry ? "" : p.industry || "",
              annualRevenue: p.annualRevenue || "",
              acquisitionSource: p.acquisitionSource || "",
              toolsUsed: Array.isArray(p.toolsUsed) ? p.toolsUsed : [],
              biggestChallenge: p.biggestChallenge || "",
            });
          }
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

    const finalRole = form.role === "Other" ? form.roleOther.trim() || "Other" : form.role || null;
    const finalIndustry =
      form.industry === "Other" ? form.industryOther.trim() || "Other" : form.industry || null;

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
          industry: finalIndustry,
          annualRevenue: form.annualRevenue || null,
          acquisitionSource: form.acquisitionSource || null,
          toolsUsed: form.toolsUsed,
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Step 2 of 2 — Company onboarding
              </p>
              <h1 className="text-2xl font-semibold">
                Tell us about{user?.fullName ? ` ${user.fullName}'s` : " your"} company
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-primary" />
            <div className="h-1.5 flex-1 rounded-full bg-primary" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            This helps us tailor your B-BBEE scorecards, link future certificates, and surface the
            right insights for your team.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" data-testid="onboarding-form">
          <div className="rounded-xl border border-border bg-card/50 p-6 space-y-5">
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

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
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
  );
}
