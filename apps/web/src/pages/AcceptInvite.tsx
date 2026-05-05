import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@toolkit/lib/auth";
import { useToast } from "@toolkit/hooks/use-toast";
import { Button } from "@toolkit/components/ui/button";
import { Card, CardContent } from "@toolkit/components/ui/card";
import { Building2, Loader2, Mail, ShieldCheck, AlertCircle } from "lucide-react";

interface InviteInfo {
  id: string;
  email: string;
  role: "owner" | "collaborator" | "viewer";
  workspaceId: string;
  workspaceName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
}

export default function AcceptInvite() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token || "";
  const [, navigate] = useLocation();
  const { user, isLoading, logout } = useAuth();
  const { toast } = useToast();

  const ROLE_LABEL: Record<string, string> = {
    owner: "Owner",
    collaborator: "Editor",
    viewer: "Viewer",
  };
  const ROLE_DESCRIPTION: Record<string, string> = {
    owner: "Full access - can manage people and settings.",
    collaborator: "Can view and edit team work.",
    viewer: "Can view everything but can't make changes.",
  };

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setError("Missing invite token");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/invites/${token}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "Invite not found");
        if (!cancelled) setInvite(data.invite);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Could not load invite");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Could not accept invite");
      toast({ title: "You're in - welcome to the team!" });
      navigate("/workspace");
    } catch (err: any) {
      toast({ title: "Could not accept", description: err.message, variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-[420px]">
          <CardContent className="py-10 text-center space-y-3">
            <div className="mx-auto h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <p className="text-sm font-medium" data-testid="text-invite-error">
              {error || "Invite not found"}
            </p>
            <Button variant="outline" onClick={() => navigate("/")} data-testid="btn-invite-home">
              Go home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusBlocked = invite.status !== "pending";
  const emailMismatch =
    !!user?.email && user.email.toLowerCase() !== invite.email.toLowerCase();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-[460px]">
        <CardContent className="py-10 px-8 space-y-5 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight">
              You're invited to join {invite.workspaceName || "a team"}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              You'll join as{" "}
              <span className="text-foreground font-medium">
                {ROLE_LABEL[invite.role] || invite.role}
              </span>
              {" - "}
              {ROLE_DESCRIPTION[invite.role] || ""}
            </p>
          </div>

          <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-left space-y-1.5 text-[12px]">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Sent to</span>
              <span className="text-foreground font-medium ml-auto truncate">{invite.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Status</span>
              <span className="text-foreground font-medium ml-auto capitalize">{invite.status}</span>
            </div>
          </div>

          {statusBlocked ? (
            <p className="text-[12px] text-destructive" data-testid="text-invite-blocked">
              {invite.status === "accepted"
                ? "This invite has already been used."
                : invite.status === "revoked"
                  ? "This invite has been revoked."
                  : "This invite has expired."}
            </p>
          ) : !user ? (
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground">
                To join, sign in or create an account using{" "}
                <span className="text-foreground font-medium">{invite.email}</span>.
              </p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() =>
                    navigate(`/auth?mode=register&redirect=${encodeURIComponent(`/invite/${token}`)}`)
                  }
                  data-testid="btn-invite-register"
                >
                  Create account
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() =>
                    navigate(`/auth?redirect=${encodeURIComponent(`/invite/${token}`)}`)
                  }
                  data-testid="btn-invite-sign-in"
                >
                  I have an account
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/70 pt-1">
                Use the same email address the invite was sent to, otherwise we won't be able to
                add you.
              </p>
            </div>
          ) : emailMismatch ? (
            <div className="space-y-2">
              <p className="text-[12px] text-destructive">
                This invite was sent to <span className="font-medium">{invite.email}</span>, but
                you're signed in as <span className="font-medium">{user.email}</span>. Sign out and
                sign back in with <span className="font-medium">{invite.email}</span> to accept.
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await logout();
                  } catch {}
                  navigate(`/auth?redirect=${encodeURIComponent(`/invite/${token}`)}`);
                }}
                data-testid="btn-invite-switch-account"
              >
                Sign out and switch
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={accept}
              disabled={accepting}
              data-testid="btn-accept-invite"
            >
              {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept invite"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
