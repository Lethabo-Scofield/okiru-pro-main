import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@toolkit/lib/auth";
import { markAuthSessionJustCompleted } from "@toolkit/lib/authFlowFlags";
import { Card, CardContent } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Loader2, ArrowLeft, Check, Shield, Mail, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@toolkit/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE } from "@toolkit/lib/config";
import okiruLogo from "@toolkit-assets/Okiru_WHT_Circle_Logo_V1_1772658965196.png";
import { AppNavBack } from "@/components/AppNavBack";
import { companyNameFromWorkEmail, isWorkEmail, WORK_EMAIL_REQUIRED_MESSAGE } from "@shared/workEmail";

interface AsyncFieldStatus {
  checking: boolean;
  available: boolean | null;
  message: string;
}

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function FieldStatus({ status }: { status: AsyncFieldStatus }) {
  if (status.checking) {
    return (
      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking...
      </p>
    );
  }
  if (status.available === true) {
    return (
      <p className="text-[11px] text-emerald-500 flex items-center gap-1 mt-1" data-testid="field-status-ok">
        <CheckCircle2 className="h-3 w-3" />
        {status.message}
      </p>
    );
  }
  if (status.available === false) {
    return (
      <p className="text-[11px] text-destructive flex items-center gap-1 mt-1" data-testid="field-status-error">
        <AlertCircle className="h-3 w-3" />
        {status.message}
      </p>
    );
  }
  return null;
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
  const [mode, setMode] = useState<'login' | 'register' | 'otp' | 'forgot' | 'reset'>(defaultMode);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register, verifyOtp, resendOtp } = useAuth();
  const { toast } = useToast();

  /** Keep register vs login aligned with URL when AuthWrapper remounts or query updates without full remount. */
  useEffect(() => {
    setMode((prev) => {
      if (prev === "otp" || prev === "forgot" || prev === "reset") return prev;
      return defaultMode;
    });
  }, [defaultMode]);

  const [otpValue, setOtpValue] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  const [form, setForm] = useState({
    loginEmail: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    email: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const defaultStatus: AsyncFieldStatus = { checking: false, available: null, message: '' };
  const [emailStatus, setEmailStatus] = useState<AsyncFieldStatus>(defaultStatus);

  const debouncedEmail = useDebounce(form.email, 250);

  const emailAbort = useRef<AbortController | null>(null);
  const emailPending = useRef<Promise<void> | null>(null);
  const emailStatusRef = useRef(defaultStatus);
  const debouncedEmailRef = useRef('');
  useEffect(() => { emailStatusRef.current = emailStatus; }, [emailStatus]);
  useEffect(() => { debouncedEmailRef.current = debouncedEmail; }, [debouncedEmail]);

  const waitForStable = async (
    isStable: () => boolean,
    timeoutMs = 1500,
  ) => {
    const start = Date.now();
    while (!isStable() && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 40));
    }
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    emailAbort.current?.abort();
    if (!debouncedEmail) {
      setEmailStatus(defaultStatus);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(debouncedEmail.trim())) {
      setEmailStatus({ checking: false, available: false, message: "Enter a valid email address" });
      return;
    }
    if (!isWorkEmail(debouncedEmail)) {
      setEmailStatus({ checking: false, available: false, message: WORK_EMAIL_REQUIRED_MESSAGE });
      return;
    }
    const controller = new AbortController();
    emailAbort.current = controller;
    setEmailStatus({ checking: true, available: null, message: '' });
    const p = fetch(`${API_BASE}/api/auth/check-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: debouncedEmail.trim() }),
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(data => { if (!controller.signal.aborted) setEmailStatus({ checking: false, available: data.available, message: data.message }); })
      .catch(e => { if (e.name !== 'AbortError') setEmailStatus({ checking: false, available: null, message: '' }); });
    emailPending.current = p;
    p.finally(() => { if (emailPending.current === p) emailPending.current = null; });
  }, [debouncedEmail]);

  useEffect(() => {
    if (!emailStatus.checking && emailStatus.available !== null) {
      setFieldErrors(prev => {
        if (prev.email === "Still checking..." || prev.email === "Verification pending, please wait") {
          const next = { ...prev };
          if (emailStatus.available === true) delete next.email;
          else next.email = emailStatus.message;
          return next;
        }
        return prev;
      });
    }
  }, [emailStatus]);

  const validateRegistration = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.fullName.trim()) errors.fullName = "Full name is required";
    if (!form.email.trim()) errors.email = "Work email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address";
    else if (!isWorkEmail(form.email)) errors.email = WORK_EMAIL_REQUIRED_MESSAGE;
    else if (emailStatus.checking) errors.email = "Still checking...";
    else if (emailStatus.available === false) errors.email = emailStatus.message;
    else if (emailStatus.available === null) errors.email = "Verification pending, please wait";
    if (!form.password) errors.password = "Password is required";
    else if (form.password.length < 8) errors.password = "At least 8 characters";
    if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
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
        markAuthSessionJustCompleted();
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
          setMode('otp');
          toast({ title: "Verification Required", description: result.message || "Check your email for the code." });
        } else {
          markAuthSessionJustCompleted();
        }
      } catch (error: any) {
        toast({ title: "Login Failed", description: error.message, variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
      return;
    }
    if (form.email.trim()) {
      await waitForStable(() =>
        debouncedEmailRef.current === form.email &&
        !emailStatusRef.current.checking &&
        emailStatusRef.current.available !== null
      );
    }
    if (!validateRegistration()) return;
    setIsLoading(true);
    try {
      const result = await register({
        password: form.password,
        fullName: form.fullName,
        email: form.email.trim().toLowerCase(),
      });
      if (result?.requiresVerification) {
        setEmailHint(result.emailHint || form.email);
        setMode('otp');
        setOtpValue('');
        toast({ title: "Verify Your Email", description: result.message || "Check your email for the code." });
      } else {
        markAuthSessionJustCompleted();
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setFieldErrors({ resetEmail: "Email is required" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");
      toast({ title: "Check Your Email", description: data.message });
      setMode('reset');
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!resetToken.trim()) errors.resetToken = "Reset code is required";
    if (!resetNewPassword) errors.resetNewPassword = "New password is required";
    else if (resetNewPassword.length < 8) errors.resetNewPassword = "At least 8 characters";
    if (resetNewPassword !== resetConfirmPassword) errors.resetConfirmPassword = "Passwords do not match";
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim(), token: resetToken.trim(), newPassword: resetNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: "Password Reset", description: data.message });
      setMode('login');
      setFieldErrors({});
      setResetEmail('');
      setResetToken('');
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (error: any) {
      toast({ title: "Reset Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const switchToRegister = () => { setMode('register'); setFieldErrors({}); };
  const switchToLogin = () => { setMode('login'); setFieldErrors({}); setOtpValue(''); };

  const pageVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };

  const pageTransition = { duration: 0.15, ease: "easeOut" as const };

  const passwordStrength = useMemo(() => {
    const pw = form.password;
    if (!pw) return null;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: "Weak", color: "bg-red-500", width: "w-1/5" };
    if (score === 2) return { label: "Fair", color: "bg-orange-500", width: "w-2/5" };
    if (score === 3) return { label: "Good", color: "bg-yellow-500", width: "w-3/5" };
    if (score === 4) return { label: "Strong", color: "bg-emerald-500", width: "w-4/5" };
    return { label: "Very Strong", color: "bg-emerald-500", width: "w-full" };
  }, [form.password]);

  const headerEyebrow =
    mode === "login"
      ? "Sign in"
      : mode === "register"
        ? "Create account"
        : mode === "otp"
          ? "Verification"
          : mode === "forgot"
            ? "Password help"
            : "Reset password";

  return (
    <div
      className="min-h-screen flex flex-col bg-black text-white"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}
    >
      <header
        className="sticky top-0 z-20 shrink-0 bg-black/90 backdrop-blur-md"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <AppNavBack href="/" label="Home" variant="dark" size="compact" data-testid="btn-back-to-home" />
          <span className="hidden sm:inline text-[12px] text-[#636366] tracking-wide uppercase">{headerEyebrow}</span>
          <div className="w-12 shrink-0" aria-hidden />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-8">
          <img src={okiruLogo} alt="Okiru" className="h-14 w-14 rounded-full object-contain" data-testid="img-logo-auth" />
        </div>

              <Card className="border border-border/50 shadow-lg bg-card overflow-hidden">
                <div className="text-center pt-8 pb-3 px-6">
                  <h2 className="text-lg font-heading font-semibold tracking-tight" data-testid="text-auth-title">
                    {mode === 'login' ? 'Sign In' : mode === 'otp' ? 'Verify Your Identity' : mode === 'forgot' ? 'Forgot Password' : mode === 'reset' ? 'Reset Password' : 'Create Account'}
                  </h2>
                  <p className="text-[13px] text-muted-foreground/60 mt-1">
                    {mode === 'login'
                      ? 'Sign in with your username or email'
                      : mode === 'forgot'
                        ? 'Enter your email to receive a reset code'
                        : mode === 'reset'
                          ? 'Enter the code sent to your email'
                      : mode === 'otp'
                        ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Code sent to {emailHint || 'your email'}
                          </span>
                        )
                        : (
                          <span className="flex items-center justify-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Use your company email
                          </span>
                        )
                    }
                  </p>
                </div>

                <CardContent className="px-6 pb-7 pt-4">
                  <form onSubmit={mode === 'forgot' ? handleForgotPassword : mode === 'reset' ? handleResetPassword : handleSubmit}>
                    <AnimatePresence mode="wait" custom={1} initial={false}>
                      <motion.div
                        key={mode}
                        custom={1}
                        variants={pageVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={pageTransition}
                      >
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
                          <Label htmlFor="login-email" className="text-[12px] font-medium text-muted-foreground/70">Username or Email</Label>
                          <Input
                            id="login-email"
                            type="text"
                            required
                            value={form.loginEmail}
                            onChange={e => {
                              setForm({ ...form, loginEmail: e.target.value });
                              setFieldErrors(prev => ({ ...prev, loginEmail: '' }));
                            }}
                            placeholder="username or email"
                            className="h-10"
                            autoComplete="username"
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
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => { setFieldErrors({}); setResetEmail(form.loginEmail); setMode('forgot'); }}
                            className="text-[12px] text-muted-foreground hover:text-primary transition-colors"
                            data-testid="btn-forgot-password"
                          >
                            Forgot your password?
                          </button>
                        </div>
                      </div>
                    ) : mode === 'forgot' ? (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="reset-email" className="text-[12px] font-medium text-muted-foreground/70">Email Address</Label>
                          <Input
                            id="reset-email"
                            type="email"
                            value={resetEmail}
                            onChange={e => { setResetEmail(e.target.value); setFieldErrors(prev => ({ ...prev, resetEmail: '' })); }}
                            placeholder="you@example.com"
                            className="h-10"
                            autoComplete="email"
                            data-testid="input-reset-email"
                          />
                          {fieldErrors.resetEmail && (
                            <p className="text-[11px] text-destructive" data-testid="error-reset-email">{fieldErrors.resetEmail}</p>
                          )}
                        </div>
                        <Button
                          type="submit"
                          className="w-full h-10 text-[13px] font-medium rounded-full"
                          disabled={isLoading}
                          data-testid="btn-send-reset"
                        >
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Code'}
                        </Button>
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={switchToLogin}
                            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mx-auto"
                            data-testid="btn-back-to-login-forgot"
                          >
                            <ArrowLeft className="h-3 w-3" /> Back to sign in
                          </button>
                        </div>
                      </div>
                    ) : mode === 'reset' ? (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-[12px] font-medium text-muted-foreground/70">Reset Code</Label>
                          <Input
                            value={resetToken}
                            onChange={e => { setResetToken(e.target.value); setFieldErrors(prev => ({ ...prev, resetToken: '' })); }}
                            placeholder="Enter 6-digit code"
                            className="h-10 text-center tracking-widest font-mono"
                            maxLength={6}
                            data-testid="input-reset-token"
                          />
                          {fieldErrors.resetToken && (
                            <p className="text-[11px] text-destructive">{fieldErrors.resetToken}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[12px] font-medium text-muted-foreground/70">New Password</Label>
                          <Input
                            type="password"
                            value={resetNewPassword}
                            onChange={e => { setResetNewPassword(e.target.value); setFieldErrors(prev => ({ ...prev, resetNewPassword: '' })); }}
                            placeholder="New password"
                            className="h-10"
                            data-testid="input-reset-new-password"
                          />
                          {fieldErrors.resetNewPassword && (
                            <p className="text-[11px] text-destructive">{fieldErrors.resetNewPassword}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[12px] font-medium text-muted-foreground/70">Confirm Password</Label>
                          <Input
                            type="password"
                            value={resetConfirmPassword}
                            onChange={e => { setResetConfirmPassword(e.target.value); setFieldErrors(prev => ({ ...prev, resetConfirmPassword: '' })); }}
                            placeholder="Confirm new password"
                            className="h-10"
                            data-testid="input-reset-confirm-password"
                          />
                          {fieldErrors.resetConfirmPassword && (
                            <p className="text-[11px] text-destructive">{fieldErrors.resetConfirmPassword}</p>
                          )}
                        </div>
                        <Button
                          type="submit"
                          className="w-full h-10 text-[13px] font-medium rounded-full"
                          disabled={isLoading}
                          data-testid="btn-reset-password"
                        >
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset Password'}
                        </Button>
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={switchToLogin}
                            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mx-auto"
                            data-testid="btn-back-to-login-reset"
                          >
                            <ArrowLeft className="h-3 w-3" /> Back to sign in
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-[12px] font-medium text-muted-foreground/70">Full name</Label>
                          <Input
                            value={form.fullName}
                            onChange={e => {
                              setForm(prev => ({ ...prev, fullName: e.target.value }));
                              setFieldErrors(prev => ({ ...prev, fullName: '' }));
                            }}
                            placeholder="e.g. Thabo Mokoena"
                            className="h-10"
                            autoComplete="name"
                            autoFocus
                            data-testid="input-fullname"
                          />
                          {fieldErrors.fullName && <p className="text-[11px] text-destructive" data-testid="error-fullname">{fieldErrors.fullName}</p>}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[12px] font-medium text-muted-foreground/70">Work email</Label>
                          <Input
                            type="email"
                            value={form.email}
                            onChange={e => {
                              setForm(prev => ({ ...prev, email: e.target.value }));
                              setFieldErrors(prev => ({ ...prev, email: '' }));
                            }}
                            placeholder="you@company.co.za"
                            className="h-10"
                            autoComplete="email"
                            data-testid="input-email"
                          />
                          {fieldErrors.email ? (
                            <p className="text-[11px] text-destructive" data-testid="error-email">{fieldErrors.email}</p>
                          ) : (
                            <FieldStatus status={emailStatus} />
                          )}
                          {companyNameFromWorkEmail(form.email) && emailStatus.available !== false && (
                            <p className="text-[11px] text-muted-foreground/60" data-testid="derived-company-name">
                              Workspace: <span className="font-medium text-foreground/80">{companyNameFromWorkEmail(form.email)}</span>
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-[12px] font-medium text-muted-foreground/70">Password</Label>
                            <Input
                              type="password"
                              value={form.password}
                              onChange={e => {
                                setForm(prev => ({ ...prev, password: e.target.value }));
                                setFieldErrors(prev => ({ ...prev, password: '' }));
                              }}
                              placeholder="Min 8 characters"
                              className="h-10"
                              autoComplete="new-password"
                              data-testid="input-password"
                            />
                            {fieldErrors.password && <p className="text-[11px] text-destructive" data-testid="error-password">{fieldErrors.password}</p>}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[12px] font-medium text-muted-foreground/70">Confirm password</Label>
                            <Input
                              type="password"
                              value={form.confirmPassword}
                              onChange={e => {
                                setForm(prev => ({ ...prev, confirmPassword: e.target.value }));
                                setFieldErrors(prev => ({ ...prev, confirmPassword: '' }));
                              }}
                              placeholder="Repeat password"
                              className="h-10"
                              autoComplete="new-password"
                              data-testid="input-confirm-password"
                            />
                            {fieldErrors.confirmPassword && <p className="text-[11px] text-destructive" data-testid="error-confirm-password">{fieldErrors.confirmPassword}</p>}
                          </div>
                        </div>

                        {passwordStrength && !fieldErrors.password && (
                          <div className="space-y-1">
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full ${passwordStrength.color} ${passwordStrength.width} transition-all duration-300 rounded-full`} />
                            </div>
                            <p className={`text-[10px] ${passwordStrength.color.replace('bg-', 'text-')}`}>{passwordStrength.label}</p>
                          </div>
                        )}

                        <Button type="submit" className="w-full h-10 text-[13px] font-medium rounded-full" disabled={isLoading} data-testid="btn-submit-auth">
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Create Account</span><Check className="h-3.5 w-3.5 ml-1.5" /></>}
                        </Button>
                      </div>
                    )}
                      </motion.div>
                    </AnimatePresence>
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
        </div>
      </main>
    </div>
  );
}
