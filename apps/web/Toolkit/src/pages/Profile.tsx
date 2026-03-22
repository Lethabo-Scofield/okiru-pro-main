import { useState, useRef } from "react";
import { useAuth } from "@toolkit/lib/auth";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Camera, Check, Loader2, User } from "lucide-react";
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
  const { user, updateProfile, uploadProfilePicture } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(user?.fullName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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
    </motion.div>
  );
}
