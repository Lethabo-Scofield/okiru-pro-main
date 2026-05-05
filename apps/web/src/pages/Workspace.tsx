import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@toolkit/lib/auth";
import { useToast } from "@toolkit/hooks/use-toast";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import {
  Building2,
  Users,
  Mail,
  Loader2,
  ArrowLeft,
  Trash2,
  Copy,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

type Role = "owner" | "collaborator" | "viewer";

interface Workspace {
  id: string;
  name: string;
  ownerUserId: string;
}

interface WorkspaceMember {
  id: string;
  userId: string;
  role: Role;
  joinedAt: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
}

interface WorkspaceInvite {
  id: string;
  email: string;
  role: Role;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedByUserId: string;
}

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  collaborator: "Editor",
  viewer: "Viewer",
};

const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: "Full access. Can manage people, send invites and rename the team space.",
  collaborator: "Can view and edit work, and invite new people.",
  viewer: "Can view everything but can't make changes.",
};

export default function WorkspacePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("collaborator");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const active = useMemo(
    () => workspaces.find((w) => w.id === activeId) || null,
    [workspaces, activeId],
  );
  const myMembership = useMemo(
    () => members.find((m) => m.userId === user?.id),
    [members, user],
  );
  const isOwner = myMembership?.role === "owner";
  const canInvite = myMembership?.role === "owner" || myMembership?.role === "collaborator";

  async function fetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, { credentials: "include", ...init });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
    return data;
  }

  async function loadWorkspaces() {
    setLoading(true);
    try {
      const data = await fetchJson("/api/workspaces");
      const list: Workspace[] = data.workspaces || [];
      setWorkspaces(list);
      if (!activeId && list.length > 0) setActiveId(list[0].id);
    } catch (err: any) {
      toast({ title: "Could not load your team", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(id: string) {
    try {
      const [m, i] = await Promise.all([
        fetchJson(`/api/workspaces/${id}/members`),
        fetchJson(`/api/workspaces/${id}/invites`).catch(() => ({ invites: [] })),
      ]);
      setMembers(m.members || []);
      setInvites(i.invites || []);
    } catch (err: any) {
      toast({ title: "Could not load team details", description: err.message, variant: "destructive" });
    }
  }

  useEffect(() => {
    loadWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) loadDetails(activeId);
  }, [activeId]);

  useEffect(() => {
    if (active) setNameDraft(active.name);
  }, [active]);

  async function rename() {
    if (!active) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === active.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      await fetchJson(`/api/workspaces/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      toast({ title: "Team renamed" });
      setRenaming(false);
      await loadWorkspaces();
    } catch (err: any) {
      toast({ title: "Rename failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite() {
    if (!active) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const data = await fetchJson(`/api/workspaces/${active.id}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      toast({
        title: "Invite link ready",
        description: `Copy the link below and send it to ${email} — they'll sign up and join your team.`,
      });
      setInviteEmail("");
      setInvites((prev) => [data.invite, ...prev]);
    } catch (err: any) {
      toast({ title: "Could not invite", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(id: string) {
    if (!active) return;
    setBusy(true);
    try {
      await fetchJson(`/api/workspaces/${active.id}/invites/${id}`, { method: "DELETE" });
      setInvites((prev) => prev.filter((x) => x.id !== id));
      toast({ title: "Invite revoked" });
    } catch (err: any) {
      toast({ title: "Revoke failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(memberUserId: string, role: Role) {
    if (!active) return;
    setBusy(true);
    try {
      await fetchJson(`/api/workspaces/${active.id}/members/${memberUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await loadDetails(active.id);
      toast({ title: "Role updated" });
    } catch (err: any) {
      toast({ title: "Role change failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(memberUserId: string) {
    if (!active) return;
    if (!confirm("Remove this person from your team? They'll lose access immediately.")) return;
    setBusy(true);
    try {
      await fetchJson(`/api/workspaces/${active.id}/members/${memberUserId}`, { method: "DELETE" });
      await loadDetails(active.id);
      toast({ title: "Member removed" });
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function inviteUrl(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  async function copyInvite(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1800);
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  }

  function inviteStatus(inv: WorkspaceInvite): { label: string; className: string } {
    if (inv.revokedAt) return { label: "Revoked", className: "text-muted-foreground" };
    if (inv.acceptedAt) return { label: "Accepted", className: "text-emerald-500" };
    if (new Date(inv.expiresAt).getTime() < Date.now())
      return { label: "Expired", className: "text-amber-500" };
    return { label: "Pending", className: "text-blue-400" };
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header
        className="h-14 sticky top-0 z-20 bg-background"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="max-w-[1100px] mx-auto px-6 h-full flex items-center justify-between">
          <button
            onClick={() => navigate("/hub")}
            className="inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground"
            data-testid="btn-back-hub"
          >
            <ArrowLeft className="h-4 w-4" /> Hub
          </button>
          <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
            <Building2 className="h-4 w-4" />
            Your team
          </div>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-10 space-y-6">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Your team</h1>
          <p className="text-[13px] text-muted-foreground">
            Invite colleagues to work together on your B-BBEE compliance. Everyone you add can sign
            in with their own account and see the same data.
          </p>
        </div>

        {workspaces.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              You aren't part of a team yet. Ask the person who invited you to send the invite link
              again.
            </CardContent>
          </Card>
        ) : (
          <>
            {workspaces.length > 1 && (
              <div className="flex flex-wrap gap-2" data-testid="workspace-switcher">
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setActiveId(w.id)}
                    className={`px-3 py-1.5 rounded-full text-[12px] border transition ${
                      activeId === w.id
                        ? "bg-primary/10 border-primary/40 text-foreground"
                        : "border-border/40 text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`btn-switch-${w.id}`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            )}

            {active && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Team space
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[12px] text-muted-foreground/70">Team name</Label>
                      {renaming ? (
                        <div className="flex gap-2">
                          <Input
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            data-testid="input-rename-workspace"
                            autoFocus
                          />
                          <Button onClick={rename} disabled={busy} data-testid="btn-save-rename">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setRenaming(false);
                              setNameDraft(active.name);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium" data-testid="text-workspace-name">
                            {active.name}
                          </p>
                          {isOwner && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRenaming(true)}
                              data-testid="btn-rename-workspace"
                            >
                              Rename
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground/60">
                      Your role:{" "}
                      <span className="text-foreground font-medium">
                        {ROLE_LABEL[myMembership?.role || "viewer"]}
                      </span>
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" /> Members ({members.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {members.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-lg border border-border/40 p-3 gap-3"
                        data-testid={`member-row-${m.userId}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {m.fullName || m.username || m.email || m.userId}
                            {m.userId === user?.id && (
                              <span className="text-[11px] text-muted-foreground ml-2">(you)</span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {m.email || m.username}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isOwner && m.role !== "owner" ? (
                            <select
                              value={m.role}
                              onChange={(e) => changeRole(m.userId, e.target.value as Role)}
                              disabled={busy}
                              className="h-8 rounded-md border border-border/50 bg-background px-2 text-[12px]"
                              data-testid={`select-role-${m.userId}`}
                            >
                              <option value="collaborator">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          ) : (
                            <span className="text-[11px] text-muted-foreground px-2 py-1 rounded-full border border-border/40">
                              {ROLE_LABEL[m.role]}
                            </span>
                          )}
                          {isOwner && m.role !== "owner" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMember(m.userId)}
                              data-testid={`btn-remove-${m.userId}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {canInvite && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Mail className="h-4 w-4" /> Invite someone to your team
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[12px] text-muted-foreground">
                        <span className="text-foreground font-medium">How it works:</span> enter
                        their email, choose what they can do, then click <span className="text-foreground font-medium">Create invite link</span>.
                        We'll generate a link below — copy it and send it to them by email,
                        WhatsApp, or any chat. They sign up with the same email and join your team.
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[12px] text-muted-foreground/70">
                          Their email address
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2">
                          <Input
                            type="email"
                            placeholder="colleague@yourcompany.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            data-testid="input-invite-email"
                          />
                          <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as Role)}
                            className="h-10 rounded-md border border-border/50 bg-background px-3 text-[13px]"
                            data-testid="select-invite-role"
                          >
                            <option value="collaborator">Editor — can view and edit</option>
                            <option value="viewer">Viewer — view only</option>
                          </select>
                          <Button onClick={sendInvite} disabled={busy} data-testid="btn-send-invite">
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Create invite link"
                            )}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          <span className="text-foreground font-medium">{ROLE_LABEL[inviteRole]}:</span>{" "}
                          {ROLE_DESCRIPTION[inviteRole]}
                        </p>
                      </div>

                      {invites.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Pending invite links — copy and send
                          </p>
                          {invites.map((inv) => {
                            const status = inviteStatus(inv);
                            const url = inviteUrl(inv.token);
                            const isCopied = copiedToken === inv.token;
                            const canRevoke = !inv.revokedAt && !inv.acceptedAt;
                            return (
                              <div
                                key={inv.id}
                                className="flex items-center justify-between rounded-lg border border-border/40 p-3 gap-3"
                                data-testid={`invite-row-${inv.id}`}
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{inv.email}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {ROLE_LABEL[inv.role]} ·{" "}
                                    <span className={status.className}>{status.label}</span>
                                  </p>
                                  {canRevoke && (
                                    <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                                      {url}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {canRevoke && (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyInvite(inv.token)}
                                        data-testid={`btn-copy-${inv.id}`}
                                      >
                                        {isCopied ? (
                                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                                        ) : (
                                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                                        )}
                                        {isCopied ? "Copied" : "Copy link"}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => revokeInvite(inv.id)}
                                        data-testid={`btn-revoke-${inv.id}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => active && loadDetails(active.id)}
                    data-testid="btn-refresh-workspace"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
