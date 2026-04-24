import { useState, useRef } from "react";
import { useAuth } from "@toolkit/lib/auth";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Camera, Check, Loader2, User, ShieldCheck, ShieldOff, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@toolkit/hooks/use-toast";
import { cn } from "@toolkit/lib/utils";

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

export default function Profile() {
  const { user, updateProfile, uploadProfilePicture, toggle2FA, confirm2FA } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(user?.fullName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [show2FAVerify, setShow2FAVerify] = useState(false);
  const [otpInput, setOtpInput] = useState("");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProfile({ fullName, email });
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Failed to update profile", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 2 MB", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      await uploadProfilePicture(file);
      toast({ title: "Profile picture updated" });
    } catch {
      toast({ title: "Failed to upload picture", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const initials = (user?.fullName || user?.username || "U")
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.div
      className="max-w-lg mx-auto py-4 pb-16"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeIn} className="mb-8">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account details.</p>
      </motion.div>

      <motion.div variants={fadeIn} className="flex flex-col items-center mb-10">
        <div className="relative group">
          <div className="h-24 w-24 rounded-full overflow-hidden bg-muted flex items-center justify-center ring-2 ring-border/40">
            {user?.profilePicture ? (
              <img
                src={user.profilePicture}
                alt="Profile"
                className="h-full w-full object-cover"
                data-testid="img-profile-picture"
              />
            ) : (
              <span className="text-2xl font-semibold text-muted-foreground" data-testid="text-profile-initials">
                {initials}
              </span>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "absolute bottom-0 right-0 h-8 w-8 rounded-full bg-card border border-border/60 flex items-center justify-center",
              "hover:bg-muted transition-colors shadow-sm"
            )}
            disabled={isUploading}
            data-testid="btn-change-picture"
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <Camera className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePictureChange}
            className="hidden"
            data-testid="input-profile-picture"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-3">Click the camera to change your photo</p>
      </motion.div>

      <motion.div variants={fadeIn} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Username</label>
          <Input
            value={user?.username || ""}
            disabled
            className="bg-muted/30 text-muted-foreground"
            data-testid="input-username"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Full Name</label>
          <Input
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Your full name"
            data-testid="input-fullname"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            data-testid="input-email"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Role</label>
          <Input
            value={user?.role || "user"}
            disabled
            className="bg-muted/30 text-muted-foreground capitalize"
            data-testid="input-role"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full h-11 rounded-full text-sm font-medium mt-4"
          data-testid="btn-save-profile"
        >
          {isSaving ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
          ) : (
            <><Check className="h-4 w-4 mr-2" /> Save Changes</>
          )}
        </Button>
      </motion.div>

      <motion.div variants={fadeIn} className="mt-10">
        <h2 className="text-lg font-heading font-semibold tracking-tight mb-1">Security</h2>
        <p className="text-sm text-muted-foreground mb-5">Manage your two-factor authentication settings.</p>

        <div className="rounded-xl border border-border/50 bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                user?.twofaEnabled ? "bg-green-500/10" : "bg-muted"
              )}>
                {user?.twofaEnabled ? (
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                ) : (
                  <Shield className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium" data-testid="text-2fa-status">
                  Two-Factor Authentication {user?.twofaEnabled ? "Enabled" : "Disabled"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {user?.twofaEnabled
                    ? "A verification code will be sent to your email each time you sign in."
                    : "Add an extra layer of security by requiring a verification code when signing in."
                  }
                </p>
              </div>
            </div>
            {!show2FAVerify && (
              <Button
                variant={user?.twofaEnabled ? "destructive" : "default"}
                size="sm"
                className="text-xs shrink-0"
                disabled={is2FALoading}
                onClick={async () => {
                  setIs2FALoading(true);
                  try {
                    if (user?.twofaEnabled) {
                      const result = await toggle2FA(false);
                      toast({ title: "2FA Disabled", description: result.message });
                    } else {
                      const result = await toggle2FA(true);
                      if (result.requiresVerification) {
                        setShow2FAVerify(true);
                        toast({ title: "Code Sent", description: result.message });
                      }
                    }
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setIs2FALoading(false);
                  }
                }}
                data-testid="btn-toggle-2fa"
              >
                {is2FALoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : user?.twofaEnabled ? (
                  <><ShieldOff className="h-3.5 w-3.5 mr-1" /> Disable</>
                ) : (
                  <><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Enable</>
                )}
              </Button>
            )}
          </div>

          {show2FAVerify && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-4 pt-4 border-t border-border/30"
            >
              <p className="text-xs text-muted-foreground mb-3">
                Enter the 6-digit code sent to your email to activate 2FA.
              </p>
              <div className="flex gap-2">
                <Input
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="h-10 font-mono text-center text-lg tracking-widest max-w-[160px]"
                  maxLength={6}
                  data-testid="input-2fa-otp"
                />
                <Button
                  size="sm"
                  className="h-10"
                  disabled={otpInput.length < 6 || is2FALoading}
                  onClick={async () => {
                    setIs2FALoading(true);
                    try {
                      await confirm2FA(otpInput);
                      toast({ title: "2FA Enabled", description: "Two-factor authentication is now active." });
                      setShow2FAVerify(false);
                      setOtpInput("");
                    } catch (err: any) {
                      toast({ title: "Verification Failed", description: err.message, variant: "destructive" });
                      setOtpInput("");
                    } finally {
                      setIs2FALoading(false);
                    }
                  }}
                  data-testid="btn-confirm-2fa"
                >
                  {is2FALoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verify"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10"
                  onClick={() => { setShow2FAVerify(false); setOtpInput(""); }}
                  data-testid="btn-cancel-2fa"
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
