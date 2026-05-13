import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@toolkit/lib/auth";
import { apiRequest, queryClient } from "@toolkit/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { Input } from "@toolkit/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@toolkit/components/ui/select";
import { useToast } from "@toolkit/hooks/use-toast";
import { AppNavBack } from "@/components/AppNavBack";
import {
  Users,
  Shield,
  ShieldCheck,
  ShieldOff,
  Search,
  Mail,
  Clock,
  Building2,
  Loader2,
  Database,
  Server,
  RefreshCw,
  Trash2,
  UserPlus,
  FileText,
  Activity,
  Crown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  organizationId: string | null;
  organizationName: string | null;
  isVerified: boolean;
  twofaEnabled: boolean;
  lastLogin: string | null;
  createdAt: string | null;
}

interface UsersResponse {
  users: AdminUser[];
  total: number;
  skip: number;
  limit: number;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
  arangodb?: { connected: boolean };
}

const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "auditor", label: "Auditor" },
  { value: "analyst", label: "Analyst" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  admin: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  manager: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  analyst: "bg-green-500/15 text-green-400 border-green-500/30",
  auditor: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  user: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLORS[role] ?? ROLE_COLORS.user;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>
      {role === "super_admin" && <Crown className="h-2.5 w-2.5" />}
      {role === "admin" && <Shield className="h-2.5 w-2.5" />}
      {role}
    </span>
  );
}

// ─── User Row ────────────────────────────────────────────────────────────────

function UserRow({ user }: { user: AdminUser }) {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>(user.role ?? "user");

  const roleMutation = useMutation({
    mutationFn: async (role: string) => {
      await apiRequest("PATCH", `/api/admin/users/${user.id}/role`, { role });
    },
    onSuccess: (_, role) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated", description: `${user.username} → ${role}` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const twoFAMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("PATCH", `/api/admin/users/${user.id}/2fa`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "2FA updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card className="overflow-hidden" data-testid={`card-user-${user.id}`}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-sm truncate">{user.fullName || user.username}</span>
              <RoleBadge role={user.role ?? "user"} />
              {user.twofaEnabled ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-green-500 border border-green-500/30 px-1.5 py-0.5 rounded">
                  <ShieldCheck className="h-2.5 w-2.5" /> 2FA
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 border border-zinc-500/20 px-1.5 py-0.5 rounded">
                  <ShieldOff className="h-2.5 w-2.5" /> No 2FA
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              {user.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {user.email}
                </span>
              )}
              {user.organizationName && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> {user.organizationName}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Last login: {formatDate(user.lastLogin)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="h-8 text-[12px] w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-[12px]">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 text-[11px]"
              disabled={roleMutation.isPending || selectedRole === (user.role ?? "user")}
              onClick={() => roleMutation.mutate(selectedRole)}
            >
              {roleMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update"}
            </Button>
            <Button
              variant={user.twofaEnabled ? "destructive" : "outline"}
              size="sm"
              className="h-8 text-[11px]"
              disabled={twoFAMutation.isPending}
              onClick={() => twoFAMutation.mutate(!user.twofaEnabled)}
            >
              {user.twofaEnabled ? (
                <><ShieldOff className="h-3 w-3 mr-1" />Disable 2FA</>
              ) : (
                <><ShieldCheck className="h-3 w-3 mr-1" />Enable 2FA</>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [skip, setSkip] = useState(0);
  const limit = 50;

  const { data: usersResp, isLoading: usersLoading } = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users", roleFilter, skip],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
      if (roleFilter !== "all") params.set("role", roleFilter);
      return apiRequest("GET", `/api/admin/users?${params}`).then((r) => r.json());
    },
    enabled: user?.role === "super_admin",
    staleTime: 30_000,
  });

  const { data: health } = useQuery<HealthResponse>({
    queryKey: ["/api/health"],
    queryFn: () => apiRequest("GET", "/api/health").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const seedUsersMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seed-demo-users").then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Demo users seeded", description: data.message });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const seedSessionsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/seed-demo-sessions").then((r) => r.json()),
    onSuccess: (data: any) => {
      toast({ title: "Demo sessions seeded", description: data.message });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const clearDemoMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/clear-demo-data").then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const d = data.deleted;
      toast({
        title: "Demo data cleared",
        description: `Users: ${d.users}, Orgs: ${d.organizations}, Sessions: ${d.sessions}`,
      });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const users = usersResp?.users ?? [];
  const totalUsers = usersResp?.total ?? 0;

  const filtered = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.fullName?.toLowerCase().includes(q)) ||
      (u.email?.toLowerCase().includes(q)) ||
      (u.organizationName?.toLowerCase().includes(q))
    );
  });

  const stats = {
    total: totalUsers,
    superAdmins: users.filter((u) => u.role === "super_admin").length,
    admins: users.filter((u) => u.role === "admin").length,
    twoFAEnabled: users.filter((u) => u.twofaEnabled).length,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <AppNavBack href="/hub" eyebrow="Suite" label="Hub" variant="light" size="compact" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Crown className="h-6 w-6 text-amber-400" />
              Super Admin
            </h1>
            <p className="text-sm text-muted-foreground">Platform management — {user?.email}</p>
          </div>
        </div>

        {/* ─── System Status ─── */}
        <section>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" /> System Status
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">API Status</p>
                <p className="font-semibold text-sm flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${health?.status === "ok" ? "bg-green-500" : "bg-red-500"}`} />
                  {health?.status ?? "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Environment</p>
                <p className="font-semibold text-sm capitalize">{health?.environment ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Uptime</p>
                <p className="font-semibold text-sm">
                  {health ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">ArangoDB</p>
                <p className="font-semibold text-sm flex items-center gap-1">
                  {health?.arangodb ? (
                    <>
                      <span className={`h-2 w-2 rounded-full ${health.arangodb.connected ? "bg-green-500" : "bg-red-500"}`} />
                      {health.arangodb.connected ? "Connected" : "Down"}
                    </>
                  ) : "—"}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ─── Mock Data Autofiller ─── */}
        <section>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" /> Mock Data Autofiller
          </h2>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-4">
                Populate the system with realistic demo data for presentations and testing. Records tagged{" "}
                <code className="text-[11px] bg-muted px-1 rounded">isDemo: true</code> can be cleared below.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[12px] gap-2"
                  disabled={seedUsersMutation.isPending}
                  onClick={() => seedUsersMutation.mutate()}
                >
                  {seedUsersMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <UserPlus className="h-3.5 w-3.5" />}
                  Seed Demo Users
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[12px] gap-2"
                  disabled={seedSessionsMutation.isPending}
                  onClick={() => seedSessionsMutation.mutate()}
                >
                  {seedSessionsMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <FileText className="h-3.5 w-3.5" />}
                  Seed Demo Sessions
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[12px] gap-2"
                  onClick={() => apiRequest("POST", "/api/certificates/process", { force: true })
                    .then(() => toast({ title: "Certificate re-extraction triggered" }))
                    .catch((e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }))
                  }
                >
                  <Activity className="h-3.5 w-3.5" />
                  Seed Demo Certificates
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="text-[12px] gap-2 ml-auto"
                  disabled={clearDemoMutation.isPending}
                  onClick={() => clearDemoMutation.mutate()}
                >
                  {clearDemoMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  Clear Demo Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ─── User Management ─── */}
        <section>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" /> User Management
          </h2>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Total Users", value: stats.total, icon: Users, color: "text-primary" },
              { label: "Super Admins", value: stats.superAdmins, icon: Crown, color: "text-amber-400" },
              { label: "Admins", value: stats.admins, icon: Shield, color: "text-blue-400" },
              { label: "2FA Enabled", value: stats.twoFAEnabled, icon: ShieldCheck, color: "text-green-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{value}</p>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or org..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setSkip(0); }}>
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] })}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* List */}
          {usersLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((u) => <UserRow key={u.id} user={u} />)}
              {filtered.length === 0 && (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  {searchQuery ? "No users match your search." : "No users found."}
                </div>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalUsers > limit && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-muted-foreground">
                Showing {skip + 1}–{Math.min(skip + limit, totalUsers)} of {totalUsers}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={skip === 0}
                  onClick={() => setSkip(Math.max(0, skip - limit))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={skip + limit >= totalUsers}
                  onClick={() => setSkip(skip + limit)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
