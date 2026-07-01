import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@toolkit/lib/auth";
import { useToast } from "@toolkit/hooks/use-toast";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Building2, Users, Mail, Loader2, Shield, ShieldCheck, UserMinus, Copy } from "lucide-react";
import { AppNavBack } from "@/components/AppNavBack";
import { apiRequest } from "@/lib/queryClient";

interface OrgMember {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
  role: string;
  isAdmin: boolean;
}

interface OrgSummary {
  organization: { id: string; name: string; adminUserId: string | null } | null;
  isAdmin: boolean;
  memberCount: number;
}

/**
 * Company / Team management. Lists the organization's members and — for the
 * company admin — allows inviting teammates by email, transferring admin, and
 * removing members. Members in one organization share their companies and
 * scorecards (org-scoped visibility), so this is the surface that grows a
 * single-user tenant into a real team.
 */
export default function Team() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const isAdmin = summary?.isAdmin ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, memRes] = await Promise.all([
        apiRequest("GET", "/api/organization"),
        apiRequest("GET", "/api/organization/members"),
      ]);
      const sum = (await sumRes.json()) as OrgSummary;
      const mem = (await memRes.json()) as { members: OrgMember[] };
      setSummary(sum);
      setMembers(Array.isArray(mem.members) ? mem.members : []);
    } catch (err: any) {
      toast({ title: "Could not load your team", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setInviting(true);
    setPendingLink(null);
    try {
      const res = await apiRequest("POST", "/api/organization/invites", { email });
      const body = (await res.json()) as { emailSent?: boolean; acceptUrl?: string };
      if (body.emailSent) {
        toast({ title: "Invite sent", description: `We emailed an invite to ${email}.` });
      } else if (body.acceptUrl) {
        setPendingLink(body.acceptUrl);
        toast({ title: "Invite created", description: "Email isn't configured — copy the invite link below and share it." });
      } else {
        toast({ title: "Invite created", description: `Invited ${email}.` });
      }
      setInviteEmail("");
    } catch (err: any) {
      toast({ title: "Could not send invite", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleTransfer = async (member: OrgMember) => {
    if (!window.confirm(`Make ${member.fullName || member.username || member.email} the company admin? You will become a regular member.`)) {
      return;
    }
    setBusyUserId(member.id);
    try {
      await apiRequest("PATCH", "/api/organization/admin", { newAdminUserId: member.id });
      toast({ title: "Admin transferred", description: `${member.fullName || member.username} is now the company admin.` });
      await load();
    } catch (err: any) {
      toast({ title: "Transfer failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemove = async (member: OrgMember) => {
    if (!window.confirm(`Remove ${member.fullName || member.username || member.email} from the company? They will lose access to shared data.`)) {
      return;
    }
    setBusyUserId(member.id);
    try {
      await apiRequest("DELETE", `/api/organization/members/${encodeURIComponent(member.id)}`);
      toast({ title: "Member removed" });
      await load();
    } catch (err: any) {
      toast({ title: "Could not remove member", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setBusyUserId(null);
    }
  };

  const copyLink = async () => {
    if (!pendingLink) return;
    try {
      await navigator.clipboard.writeText(pendingLink);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Copy failed", description: pendingLink, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <AppNavBack href="/hub" eyebrow="Suite" label="Hub" size="compact" />

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-100">
            <Building2 className="w-6 h-6 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {summary?.organization?.name || "Your company"}
            </h1>
            <p className="text-sm text-gray-500">
              {summary ? `${summary.memberCount} member${summary.memberCount === 1 ? "" : "s"}` : "Team members"}
              {isAdmin ? " · You are the company admin" : ""}
            </p>
          </div>
        </div>

        {isAdmin && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="w-4 h-4" /> Invite a teammate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="email"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviting}
                  className="flex-1"
                />
                <Button type="submit" disabled={inviting}>
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send invite"}
                </Button>
              </form>
              <p className="text-xs text-gray-500 mt-2">
                They'll join your company and can see the same companies and scorecards you do.
              </p>
              {pendingLink && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
                  <code className="flex-1 text-xs break-all text-amber-900">{pendingLink}</code>
                  <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" /> Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">No members yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {members.map((m) => {
                  const isSelf = m.id === user?.id;
                  return (
                    <li key={m.id} className="flex items-center justify-between py-3 gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {m.fullName || m.username || m.email || "Member"}
                          </span>
                          {m.isAdmin && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 rounded px-1.5 py-0.5">
                              <ShieldCheck className="w-3 h-3" /> Admin
                            </span>
                          )}
                          {isSelf && <span className="text-xs text-gray-400">(You)</span>}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{m.email || m.username}</div>
                      </div>
                      {isAdmin && !isSelf && (
                        <div className="flex items-center gap-2 shrink-0">
                          {!m.isAdmin && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyUserId === m.id}
                              onClick={() => handleTransfer(m)}
                              title="Make company admin"
                            >
                              <Shield className="w-3.5 h-3.5 mr-1" /> Make admin
                            </Button>
                          )}
                          {!m.isAdmin && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              disabled={busyUserId === m.id}
                              onClick={() => handleRemove(m)}
                              title="Remove from company"
                            >
                              {busyUserId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
