import { useState } from "react";
import { useAuth } from "@toolkit/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@toolkit/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import okiruLogo from "@toolkit-assets/Okiru_WHT_Circle_Logo_V1_1772658965196.png";

export default function AuthPage({ defaultMode = 'login' }: { defaultMode?: 'login' | 'register' } = {}) {
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    organizationName: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await login(form.username, form.password);
      } else {
        await register({
          username: form.username,
          password: form.password,
          fullName: form.fullName || undefined,
          email: form.email || undefined,
          organizationName: form.organizationName || undefined,
        });
      }
    } catch (error: any) {
      toast({
        title: mode === 'login' ? "Login Failed" : "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[340px]"
      >
        <div className="flex justify-center mb-8">
          <img src={okiruLogo} alt="Okiru" className="h-14 w-14 rounded-full object-contain" data-testid="img-logo-auth" />
        </div>

        <Card className="border border-border/50 shadow-none bg-card">
          <CardHeader className="text-center space-y-1 pt-8 pb-2">
            <CardTitle className="text-lg font-heading font-semibold tracking-tight">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </CardTitle>
            <CardDescription className="text-[13px] text-muted-foreground/60">
              {mode === 'login'
                ? 'Access your compliance dashboard'
                : 'Get started with Okiru.Pro'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-7">
            <form onSubmit={handleSubmit} className="space-y-3">
              <AnimatePresence mode="wait">
                {mode === 'register' && (
                  <motion.div
                    key="register-fields"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-3 overflow-hidden"
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName" className="text-[12px] font-medium text-muted-foreground/70">Full Name</Label>
                      <Input
                        id="fullName"
                        value={form.fullName}
                        onChange={e => setForm({ ...form, fullName: e.target.value })}
                        placeholder="John Doe"
                        className="h-9"
                        data-testid="input-fullname"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-[12px] font-medium text-muted-foreground/70">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        placeholder="name@company.com"
                        className="h-9"
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="orgName" className="text-[12px] font-medium text-muted-foreground/70">Organization</Label>
                      <Input
                        id="orgName"
                        value={form.organizationName}
                        onChange={e => setForm({ ...form, organizationName: e.target.value })}
                        placeholder="Company Ltd"
                        className="h-9"
                        data-testid="input-org-name"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-[12px] font-medium text-muted-foreground/70">Username</Label>
                <Input
                  id="username"
                  required
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder="username"
                  className="h-9"
                  data-testid="input-username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[12px] font-medium text-muted-foreground/70">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="h-9"
                  data-testid="input-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-9 text-[13px] font-medium mt-1 rounded-full"
                disabled={isLoading}
                data-testid="btn-submit-auth"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  mode === 'login' ? 'Continue' : 'Create Account'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-[12px] text-muted-foreground/60">
                {mode === 'login' ? (
                  <>
                    New here?{' '}
                    <button
                      onClick={() => setMode('register')}
                      className="text-primary font-medium hover:underline"
                      data-testid="link-switch-register"
                    >
                      Create account
                    </button>
                  </>
                ) : (
                  <>
                    Have an account?{' '}
                    <button
                      onClick={() => setMode('login')}
                      className="text-primary font-medium hover:underline"
                      data-testid="link-switch-login"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
