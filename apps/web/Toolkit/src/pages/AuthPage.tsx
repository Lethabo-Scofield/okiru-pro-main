import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@toolkit/lib/auth";
import { Card, CardContent } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Loader2, ArrowRight, ArrowLeft, Check, Building2, User, KeyRound, Shield, ChevronDown, Mail, RefreshCw } from "lucide-react";
import { useToast } from "@toolkit/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE } from "@toolkit/lib/config";
import okiruLogo from "@toolkit-assets/Okiru_WHT_Circle_Logo_V1_1772658965196.png";

const FALLBACK_ORGANIZATIONS: OrgOption[] = [
  { id: "okiru", name: "Okiru", emailDomain: "okiru.co.za" },
  { id: "param-solutions", name: "Param Solutions", emailDomain: "paramsolutions.co.za" },
];

const ROLES = [
  { value: "auditor", label: "B-BBEE Auditor", description: "Conduct and manage compliance audits" },
  { value: "analyst", label: "Compliance Analyst", description: "Analyse scorecard data and reports" },
  { value: "manager", label: "Team Manager", description: "Oversee audit teams and review results" },
  { value: "admin", label: "Administrator", description: "Full system access and user management" },
];

const TOTAL_STEPS = 4;
const stepLabels = ["Organization", "Your Details", "Credentials", "Role"];
const stepIcons = [Building2, User, KeyRound, Shield];

interface OrgOption {
  id: string;
  name: string;
  emailDomain: string;
}

function OrgPicker({ organizations, value, onChange, error }: {
  organizations: OrgOption[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = organizations.find(o => o.id === value);
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium text-muted-foreground/70">Organization</Label>
      <div className="relative">
        <button
          type="button"
          data-testid="select-organization"
          onClick={() => setOpen(p => !p)}
          className={`flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm bg-transparent shadow-sm transition-colors ${
            error ? 'border-destructive' : 'border-input hover:border-ring'
          } focus:outline-none focus:ring-1 focus:ring-ring`}
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Select your organization</span>
          )}
          <ChevronDown className={`h-4 w-4 opacity-50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-md border border-border bg-popover shadow-md overflow-hidden">
            {organizations.map(org => (
              <button
                key={org.id}
                type="button"
                data-testid={`org-option-${org.id}`}
                onClick={() => { onChange(org.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground ${
                  value === org.id ? 'bg-accent/50 font-medium' : ''
                }`}
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {org.name}
                {value === org.id && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-[11px] text-destructive" data-testid="error-organization">{error}</p>}
    </div>
  );
}

function OtpInput({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length);

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return;
    const newDigits = [...digits];
    newDigits[index] = char.slice(-1);
    const newValue = newDigits.join('');
    onChange(newValue);
    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center" data-testid="otp-input-group">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-11 h-13 text-center text-xl font-mono font-bold rounded-md border border-input bg-transparent shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          data-testid={`otp-digit-${i}`}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

export default function AuthPage({ defaultMode = 'login' }: { defaultMode?: 'login' | 'register' } = {}) {
  const [mode, setMode] = useState<'login' | 'register' | 'otp'>(defaultMode);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [organizations, setOrganizations] = useState<OrgOption[]>(FALLBACK_ORGANIZATIONS);
  const { login, register, verifyOtp, resendOtp } = useAuth();
  const { toast } = useToast();

  const [otpValue, setOtpValue] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [form, setForm] = useState({
    loginEmail: '',
    username: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    emailName: '',
    personalEmail: '',
    organizationId: '',
    subscriptionId: '',
    role: 'auditor',
  });

  const [emailType, setEmailType] = useState<'company' | 'personal'>('company');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [emailManuallyEdited, setEmailManuallyEdited] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/organizations`)
      .then(r => r.ok ? r.json() : FALLBACK_ORGANIZATIONS)
      .then((data: OrgOption[]) => setOrganizations(data?.length ? data : FALLBACK_ORGANIZATIONS))
      .catch(() => setOrganizations(FALLBACK_ORGANIZATIONS));
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const selectedOrg = organizations.find(o => o.id === form.organizationId);
  const fullEmail = useMemo(() => {
    if (emailType === 'personal') {
      return form.personalEmail.trim().toLowerCase();
    }
    if (!form.emailName.trim() || !selectedOrg) return '';
    return `${form.emailName.trim().toLowerCase()}@${selectedOrg.emailDomain}`;
  }, [form.emailName, form.personalEmail, selectedOrg, emailType]);

  const validateStep = (s: number): boolean => {
    const errors: Record<string, string> = {};
    if (s === 1) {
      if (!form.organizationId) errors.organizationId = "Please select your organization";
      if (!form.subscriptionId.trim()) errors.subscriptionId = "Subscription ID is required";
    } else if (s === 2) {
      if (!form.fullName.trim()) errors.fullName = "Full name is required";
      if (emailType === 'company') {
        if (!form.emailName.trim()) errors.emailName = "Email name is required";
      } else {
        if (!form.personalEmail.trim()) errors.personalEmail = "Email is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personalEmail.trim())) errors.personalEmail = "Enter a valid email address";
      }
    } else if (s === 3) {
      if (!form.username.trim()) errors.username = "Username is required";
      else if (form.username.length < 3) errors.username = "At least 3 characters";
      if (!form.password) errors.password = "Password is required";
      else if (form.password.length < 4) errors.password = "At least 4 characters";
      if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match";
    } else if (s === 4) {
      if (!form.role) errors.role = "Please select a role";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goToStep = (target: number) => {
    if (target > step) {
      if (!validateStep(step)) return;
      setDirection(1);
    } else {
      setDirection(-1);
      setFieldErrors({});
    }
    setStep(target);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'otp') {
      if (otpValue.length < 6) {
        setFieldErrors({ otp: "Please enter the full 6-digit code" });
        return;
      }
      setIsLoading(true);
      try {
        await verifyOtp(otpValue);
      } catch (error: any) {
        toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
        setOtpValue('');
      } finally {
        setIsLoading(false);
      }
      return;
    }
    if (mode === 'login') {
      if (!form.loginEmail.trim()) {
        setFieldErrors({ loginEmail: "Email is required" });
        return;
      }
      if (!form.password) {
        setFieldErrors({ password: "Password is required" });
        return;
      }
      setIsLoading(true);
      try {
        const result = await login(form.loginEmail.trim(), form.password);
        if (result.requires2FA) {
          setEmailHint(result.emailHint || '');
          setOtpValue('');
          setResendCooldown(30);
          setDirection(1);
          setMode('otp');
          toast({ title: "Verification Required", description: result.message || "Check your email for the code." });
        }
      } catch (error: any) {
        toast({ title: "Login Failed", description: error.message, variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
      return;
    }
    if (!validateStep(step)) return;
    if (step < TOTAL_STEPS) { goToStep(step + 1); return; }
    setIsLoading(true);
    try {
      const result = await register({
        username: form.username,
        password: form.password,
        fullName: form.fullName,
        email: fullEmail,
        organizationId: form.organizationId,
        subscriptionId: form.subscriptionId,
        role: form.role,
      });
      if (result?.requiresVerification) {
        setEmailHint(result.emailHint || fullEmail);
        setMode('otp');
        setOtpValue('');
        toast({ title: "Verify Your Email", description: result.message || "Check your email for the code." });
      }
    } catch (error: any) {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      const msg = await resendOtp();
      setResendCooldown(30);
      setOtpValue('');
      toast({ title: "Code Resent", description: msg });
    } catch (error: any) {
      toast({ title: "Resend Failed", description: error.message, variant: "destructive" });
    }
  };

  const switchToRegister = () => { setMode('register'); setStep(1); setFieldErrors({}); };
  const switchToLogin = () => { setMode('login'); setStep(1); setFieldErrors({}); setOtpValue(''); };

  const StepIcon = mode === 'otp' ? Mail : stepIcons[(step - 1) % stepIcons.length];

  const pageVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };

  const pageTransition = { duration: 0.15, ease: "easeOut" };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[420px]"
      >
        <div className="flex justify-center mb-8">
          <img src={okiruLogo} alt="Okiru" className="h-14 w-14 rounded-full object-contain" data-testid="img-logo-auth" />
        </div>

        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={mode === 'login' ? 'login' : mode === 'otp' ? 'otp' : `step-${step}`}
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
          >
              <Card className="border border-border/50 shadow-lg bg-card overflow-hidden">
                <div className="text-center pt-8 pb-3 px-6">
                  <h2 className="text-lg font-heading font-semibold tracking-tight" data-testid="text-auth-title">
                    {mode === 'login' ? 'Sign In' : mode === 'otp' ? 'Verify Your Identity' : 'Create Account'}
                  </h2>
                  <p className="text-[13px] text-muted-foreground/60 mt-1">
                    {mode === 'login'
                      ? 'Sign in with your work email'
                      : mode === 'otp'
                        ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Code sent to {emailHint || 'your email'}
                          </span>
                        )
                        : (
                          <span className="flex items-center justify-center gap-1.5">
                            <StepIcon className="h-3.5 w-3.5" />
                            {stepLabels[step - 1]}
                            <span className="text-muted-foreground/40">— {step} of {TOTAL_STEPS}</span>
                          </span>
                        )
                    }
                  </p>
                </div>

                {mode === 'register' && (
                  <div className="px-6 pb-1">
                    <div className="flex items-center gap-1" data-testid="step-indicator">
                      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
                        const s = i + 1;
                        const done = s < step;
                        const active = s === step;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => { if (s < step) goToStep(s); }}
                            className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
                              done ? "bg-primary cursor-pointer" : active ? "bg-primary/70" : "bg-muted"
                            }`}
                            data-testid={`step-bar-${s}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                <CardContent className="px-6 pb-7 pt-4">
                  <form onSubmit={handleSubmit}>
                    {mode === 'otp' ? (
                      <div className="space-y-5">
                        <div className="flex justify-center">
                          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                            <Shield className="h-7 w-7 text-primary" />
                          </div>
                        </div>

                        <p className="text-[13px] text-center text-muted-foreground">
                          Enter the 6-digit code sent to your email to complete sign-in.
                        </p>

                        <OtpInput value={otpValue} onChange={setOtpValue} />
                        {fieldErrors.otp && (
                          <p className="text-[11px] text-destructive text-center" data-testid="error-otp">{fieldErrors.otp}</p>
                        )}

                        <Button
                          type="submit"
                          className="w-full h-10 text-[13px] font-medium rounded-full"
                          disabled={isLoading || otpValue.length < 6}
                          data-testid="btn-verify-otp"
                        >
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Sign In'}
                        </Button>

                        <div className="flex items-center justify-between text-[12px]">
                          <button
                            type="button"
                            onClick={switchToLogin}
                            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            data-testid="btn-back-to-login"
                          >
                            <ArrowLeft className="h-3 w-3" /> Back to login
                          </button>
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={resendCooldown > 0}
                            className={`flex items-center gap-1 transition-colors ${
                              resendCooldown > 0 ? 'text-muted-foreground/40 cursor-not-allowed' : 'text-primary hover:text-primary/80'
                            }`}
                            data-testid="btn-resend-otp"
                          >
                            <RefreshCw className="h-3 w-3" />
                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                          </button>
                        </div>
                      </div>
                    ) : mode === 'login' ? (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="login-email" className="text-[12px] font-medium text-muted-foreground/70">Work Email</Label>
                          <Input
                            id="login-email"
                            type="email"
                            required
                            value={form.loginEmail}
                            onChange={e => {
                              setForm({ ...form, loginEmail: e.target.value });
                              setFieldErrors(prev => ({ ...prev, loginEmail: '' }));
                            }}
                            placeholder="thabo@okiru.co.za"
                            className="h-10"
                            autoComplete="email"
                            data-testid="input-login-email"
                          />
                          {fieldErrors.loginEmail && (
                            <p className="text-[11px] text-destructive" data-testid="error-login-email">{fieldErrors.loginEmail}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="login-pw" className="text-[12px] font-medium text-muted-foreground/70">Password</Label>
                          <Input
                            id="login-pw"
                            type="password"
                            required
                            value={form.password}
                            onChange={e => {
                              setForm({ ...form, password: e.target.value });
                              setFieldErrors(prev => ({ ...prev, password: '' }));
                            }}
                            placeholder="••••••••"
                            className="h-10"
                            autoComplete="current-password"
                            data-testid="input-password"
                          />
                          {fieldErrors.password && (
                            <p className="text-[11px] text-destructive" data-testid="error-login-password">{fieldErrors.password}</p>
                          )}
                        </div>
                        <Button
                          type="submit"
                          className="w-full h-10 text-[13px] font-medium rounded-full"
                          disabled={isLoading}
                          data-testid="btn-submit-auth"
                        >
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {step === 1 && (
                          <div className="space-y-4">
                            <OrgPicker
                              organizations={organizations}
                              value={form.organizationId}
                              onChange={v => {
                                setForm({ ...form, organizationId: v });
                                setFieldErrors(prev => ({ ...prev, organizationId: '' }));
                              }}
                              error={fieldErrors.organizationId}
                            />

                            {selectedOrg && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                className="rounded-lg border border-primary/20 bg-primary/5 p-3"
                              >
                                <p className="text-[11px] text-primary font-medium mb-0.5">{selectedOrg.name}</p>
                                <p className="text-[11px] text-muted-foreground">Enter the subscription ID provided by your organization.</p>
                              </motion.div>
                            )}

                            <div className="space-y-1.5">
                              <Label className="text-[12px] font-medium text-muted-foreground/70">Subscription ID</Label>
                              <Input
                                value={form.subscriptionId}
                                onChange={e => {
                                  setForm({ ...form, subscriptionId: e.target.value.toUpperCase() });
                                  setFieldErrors(prev => ({ ...prev, subscriptionId: '' }));
                                }}
                                placeholder="e.g. OKR-2026-001"
                                className="h-10 font-mono text-sm tracking-wider"
                                data-testid="input-subscription-id"
                              />
                              {fieldErrors.subscriptionId && (
                                <p className="text-[11px] text-destructive" data-testid="error-subscription">{fieldErrors.subscriptionId}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {step === 2 && (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label className="text-[12px] font-medium text-muted-foreground/70">Full Name</Label>
                              <Input
                                value={form.fullName}
                                onChange={e => {
                                  const name = e.target.value;
                                  const updates: Record<string, string> = { fullName: name };
                                  if (!emailManuallyEdited && emailType === 'company') {
                                    updates.emailName = name.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
                                  }
                                  setForm(prev => ({ ...prev, ...updates }));
                                  setFieldErrors(prev => ({ ...prev, fullName: '' }));
                                }}
                                placeholder="e.g. Thabo Mokoena"
                                className="h-10"
                                autoComplete="name"
                                data-testid="input-fullname"
                              />
                              {fieldErrors.fullName && (
                                <p className="text-[11px] text-destructive" data-testid="error-fullname">{fieldErrors.fullName}</p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-[12px] font-medium text-muted-foreground/70">Email</Label>
                              <div className="flex gap-2 mb-2">
                                <button
                                  type="button"
                                  onClick={() => { setEmailType('company'); setFieldErrors(prev => ({ ...prev, emailName: '', personalEmail: '' })); }}
                                  className={`flex-1 text-[11px] font-medium py-2 px-3 rounded-lg border transition-colors ${
                                    emailType === 'company'
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-border bg-transparent text-muted-foreground hover:border-muted-foreground/30'
                                  }`}
                                  data-testid="btn-email-company"
                                >
                                  Company Email
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEmailType('personal'); setFieldErrors(prev => ({ ...prev, emailName: '', personalEmail: '' })); }}
                                  className={`flex-1 text-[11px] font-medium py-2 px-3 rounded-lg border transition-colors ${
                                    emailType === 'personal'
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-border bg-transparent text-muted-foreground hover:border-muted-foreground/30'
                                  }`}
                                  data-testid="btn-email-personal"
                                >
                                  Personal Email
                                </button>
                              </div>

                              {emailType === 'company' ? (
                                <>
                                  <div className="flex items-center gap-0">
                                    <Input
                                      value={form.emailName}
                                      onChange={e => {
                                        const val = e.target.value.replace(/[^a-zA-Z0-9._-]/g, '');
                                        setForm(prev => ({ ...prev, emailName: val }));
                                        setFieldErrors(prev => ({ ...prev, emailName: '' }));
                                        setEmailManuallyEdited(true);
                                      }}
                                      placeholder="thabo.mokoena"
                                      className="h-10 rounded-r-none border-r-0 flex-1"
                                      data-testid="input-email-name"
                                    />
                                    <div className="h-10 px-3 flex items-center bg-muted/50 border border-l-0 border-border rounded-r-md text-[12px] text-muted-foreground font-mono whitespace-nowrap">
                                      @{selectedOrg?.emailDomain || 'company.co.za'}
                                    </div>
                                  </div>
                                  {fieldErrors.emailName && (
                                    <p className="text-[11px] text-destructive" data-testid="error-email">{fieldErrors.emailName}</p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Input
                                    type="email"
                                    value={form.personalEmail}
                                    onChange={e => {
                                      setForm(prev => ({ ...prev, personalEmail: e.target.value }));
                                      setFieldErrors(prev => ({ ...prev, personalEmail: '' }));
                                    }}
                                    placeholder="thabo.mokoena@gmail.com"
                                    className="h-10"
                                    autoComplete="email"
                                    data-testid="input-personal-email"
                                  />
                                  {fieldErrors.personalEmail && (
                                    <p className="text-[11px] text-destructive" data-testid="error-personal-email">{fieldErrors.personalEmail}</p>
                                  )}
                                </>
                              )}
                              {fullEmail && (
                                <p className="text-[11px] text-muted-foreground/60 mt-1" data-testid="text-full-email">
                                  Verification will be sent to: <span className="text-foreground font-medium">{fullEmail}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {step === 3 && (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label className="text-[12px] font-medium text-muted-foreground/70">Username</Label>
                              <Input
                                value={form.username}
                                onChange={e => {
                                  setForm({ ...form, username: e.target.value });
                                  setFieldErrors(prev => ({ ...prev, username: '' }));
                                }}
                                placeholder="Choose a username"
                                className="h-10"
                                autoComplete="username"
                                data-testid="input-username"
                              />
                              {fieldErrors.username && (
                                <p className="text-[11px] text-destructive" data-testid="error-username">{fieldErrors.username}</p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[12px] font-medium text-muted-foreground/70">Password</Label>
                              <Input
                                type="password"
                                value={form.password}
                                onChange={e => {
                                  setForm({ ...form, password: e.target.value });
                                  setFieldErrors(prev => ({ ...prev, password: '' }));
                                }}
                                placeholder="Min 4 characters"
                                className="h-10"
                                autoComplete="new-password"
                                data-testid="input-password"
                              />
                              {fieldErrors.password && (
                                <p className="text-[11px] text-destructive" data-testid="error-password">{fieldErrors.password}</p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[12px] font-medium text-muted-foreground/70">Confirm Password</Label>
                              <Input
                                type="password"
                                value={form.confirmPassword}
                                onChange={e => {
                                  setForm({ ...form, confirmPassword: e.target.value });
                                  setFieldErrors(prev => ({ ...prev, confirmPassword: '' }));
                                }}
                                placeholder="Re-enter password"
                                className="h-10"
                                autoComplete="new-password"
                                data-testid="input-confirm-password"
                              />
                              {fieldErrors.confirmPassword && (
                                <p className="text-[11px] text-destructive" data-testid="error-confirm-password">{fieldErrors.confirmPassword}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {step === 4 && (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label className="text-[12px] font-medium text-muted-foreground/70">Your Role</Label>
                              <div className="grid gap-2" data-testid="role-options">
                                {ROLES.map(r => (
                                  <button
                                    key={r.value}
                                    type="button"
                                    onClick={() => {
                                      setForm({ ...form, role: r.value });
                                      setFieldErrors(prev => ({ ...prev, role: '' }));
                                    }}
                                    className={`w-full text-left rounded-lg border p-3 transition-all duration-200 ${
                                      form.role === r.value
                                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                        : "border-border/50 hover:border-border hover:bg-muted/30"
                                    }`}
                                    data-testid={`btn-role-${r.value}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">{r.label}</span>
                                      {form.role === r.value && (
                                        <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                          <Check className="h-3 w-3 text-primary-foreground" />
                                        </div>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.description}</p>
                                  </button>
                                ))}
                              </div>
                              {fieldErrors.role && (
                                <p className="text-[11px] text-destructive" data-testid="error-role">{fieldErrors.role}</p>
                              )}
                            </div>

                            <div className="rounded-lg border border-border/30 bg-muted/20 p-3 space-y-1.5">
                              <p className="text-[11px] font-medium text-muted-foreground">Account Summary</p>
                              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
                                <span className="text-muted-foreground/60">Organization</span>
                                <span className="text-foreground font-medium truncate">{selectedOrg?.name || '—'}</span>
                                <span className="text-muted-foreground/60">Name</span>
                                <span className="text-foreground font-medium truncate">{form.fullName || '—'}</span>
                                <span className="text-muted-foreground/60">Email</span>
                                <span className="text-foreground font-medium truncate">{fullEmail || '—'}</span>
                                <span className="text-muted-foreground/60">Username</span>
                                <span className="text-foreground font-medium truncate">{form.username || '—'}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 pt-2">
                          {step > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => goToStep(step - 1)}
                              className="h-10 text-[13px] rounded-full px-5"
                              data-testid="btn-prev-step"
                            >
                              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                              Back
                            </Button>
                          )}
                          {step < TOTAL_STEPS ? (
                            <Button
                              type="button"
                              onClick={() => goToStep(step + 1)}
                              className="flex-1 h-10 text-[13px] font-medium rounded-full"
                              data-testid="btn-next-step"
                            >
                              Continue
                              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                            </Button>
                          ) : (
                            <Button
                              type="submit"
                              className="flex-1 h-10 text-[13px] font-medium rounded-full"
                              disabled={isLoading}
                              data-testid="btn-submit-auth"
                            >
                              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                                <>
                                  Create Account
                                  <Check className="h-3.5 w-3.5 ml-1.5" />
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </form>

                  {mode !== 'otp' && (
                    <div className="mt-5 text-center">
                      <p className="text-[12px] text-muted-foreground/60">
                        {mode === 'login' ? (
                          <>
                            New here?{' '}
                            <button onClick={switchToRegister} className="text-primary font-medium hover:underline" data-testid="link-switch-register">
                              Create account
                            </button>
                          </>
                        ) : (
                          <>
                            Have an account?{' '}
                            <button onClick={switchToLogin} className="text-primary font-medium hover:underline" data-testid="link-switch-login">
                              Sign in
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
