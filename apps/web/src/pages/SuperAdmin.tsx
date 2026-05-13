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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@toolkit/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@toolkit/components/ui/table";
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
  Building,
  Settings,
  Layers,
  Target,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
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

interface PillarConfig {
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumPercent: number;
}

interface Sector {
  code: string;
  name: string;
  type: string;
  totalPoints: number;
  pillarConfigs?: Record<string, PillarConfig | undefined> | StoredPillarLike[];
  targets?: Record<string, unknown>;
  levelThresholds?: Array<{ level: number; minPoints: number; recognition: number }> | unknown;
}

/** Arango / ingestion shape: pillar list rows, not a keyed record */
interface StoredPillarLike {
  code?: string;
  name?: string;
  maxPoints?: number;
  hasSubMinimum?: boolean;
  subMinimumPercent?: number;
  subMinimumThreshold?: number;
}

type LevelThresholdRow = { level: number; minPoints: number; recognition: number };

/** API may return `{ success, sectors }`, a bare array, or malformed bodies; normalize before `.map`. */
function normalizeSectorsList(data: unknown): Sector[] {
  if (data == null) return [];
  let raw: unknown[] | null = null;
  if (Array.isArray(data)) {
    raw = data;
  } else if (typeof data === "object" && data !== null && "sectors" in data) {
    const s = (data as { sectors?: unknown }).sectors;
    if (Array.isArray(s)) raw = s;
    else if (s && typeof s === "object" && !Array.isArray(s)) raw = Object.values(s as Record<string, unknown>);
  }
  if (!raw) return [];
  return raw.filter((item): item is Sector => item != null && typeof item === "object" && !Array.isArray(item));
}

function safePillarConfigs(sector: Sector | null | undefined): Record<string, PillarConfig | undefined> {
  if (!sector || typeof sector !== "object") return {};
  const pc = sector.pillarConfigs as unknown;
  if (pc && typeof pc === "object" && !Array.isArray(pc)) {
    return pc as Record<string, PillarConfig | undefined>;
  }
  if (Array.isArray(pc)) {
    const out: Record<string, PillarConfig | undefined> = {};
    for (const item of pc as StoredPillarLike[]) {
      if (!item || typeof item !== "object") continue;
      const key = typeof item.code === "string" && item.code ? item.code : typeof item.name === "string" ? item.name : "";
      if (!key) continue;
      const maxPoints = typeof item.maxPoints === "number" ? item.maxPoints : Number(item.maxPoints) || 0;
      const subMin =
        typeof item.subMinimumPercent === "number"
          ? item.subMinimumPercent
          : typeof item.subMinimumThreshold === "number"
            ? item.subMinimumThreshold
            : Number(item.subMinimumThreshold) || 0;
      out[key] = {
        maxPoints,
        hasSubMinimum: Boolean(item.hasSubMinimum),
        subMinimumPercent: subMin,
      };
    }
    return out;
  }
  return {};
}

function coerceLevelThresholdRows(lt: unknown): LevelThresholdRow[] {
  if (lt == null) return [];
  const toRow = (o: Record<string, unknown>, levelFallback: number): LevelThresholdRow | null => {
    const levelRaw = o.level ?? levelFallback;
    const level = typeof levelRaw === "number" ? levelRaw : Number(levelRaw);
    if (!Number.isFinite(level)) return null;
    const minRaw = o.minPoints ?? o.min ?? 0;
    const recRaw = o.recognition ?? o.recognitionPercent ?? 0;
    const minPoints = typeof minRaw === "number" ? minRaw : Number(minRaw);
    const recognition = typeof recRaw === "number" ? recRaw : Number(recRaw);
    return {
      level,
      minPoints: Number.isFinite(minPoints) ? minPoints : 0,
      recognition: Number.isFinite(recognition) ? recognition : 0,
    };
  };
  if (Array.isArray(lt)) {
    const rows = lt
      .map((entry, i) => {
        if (!entry || typeof entry !== "object") return null;
        return toRow(entry as Record<string, unknown>, i + 1);
      })
      .filter((r): r is LevelThresholdRow => r != null);
    return [...rows].sort((a, b) => a.level - b.level);
  }
  if (typeof lt === "object" && !Array.isArray(lt)) {
    const rows = Object.entries(lt as Record<string, unknown>)
      .map(([k, v]) => {
        const levelFromKey = Number(k);
        if (!v || typeof v !== "object" || Array.isArray(v)) {
          return Number.isFinite(levelFromKey) ? toRow({ level: levelFromKey, minPoints: v } as Record<string, unknown>, levelFromKey) : null;
        }
        const base = Number.isFinite(levelFromKey) ? levelFromKey : NaN;
        return toRow(v as Record<string, unknown>, base);
      })
      .filter((r): r is LevelThresholdRow => r != null);
    return [...rows].sort((a, b) => a.level - b.level);
  }
  return [];
}

function safeLevelThresholds(sector: Sector | null | undefined): LevelThresholdRow[] {
  if (!sector || typeof sector !== "object") return [];
  return coerceLevelThresholdRows(sector.levelThresholds);
}

/** Guard `Object.entries` for possibly malformed records */
function safeObjectEntriesKV(obj: unknown): [string, PillarConfig | undefined][] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.entries(obj as Record<string, PillarConfig | undefined>);
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

// ─── Sector Helpers ──────────────────────────────────────────────────────────

const PILLAR_NAMES: Record<string, string> = {
  ownership: "Ownership",
  managementControl: "Management Control",
  employmentEquity: "Employment Equity",
  skillsDevelopment: "Skills Development",
  preferentialProcurement: "Preferential Procurement",
  supplierDevelopment: "Supplier Development",
  enterpriseDevelopment: "Enterprise Development",
  socioEconomicDevelopment: "Socio-Economic Development",
  yesInitiative: "YES Initiative",
  empowermentFinancing: "Empowerment Financing",
  accessToFinancialServices: "Access to Financial Services",
  consumerEducation: "Consumer Education",
};

function getActivePillars(pillarConfigs: Record<string, PillarConfig | undefined>): { name: string; maxPoints: number }[] {
  const pc =
    pillarConfigs && typeof pillarConfigs === "object" && !Array.isArray(pillarConfigs) ? pillarConfigs : {};
  return Object.entries(pc)
    .filter(([_, config]) => config && config.maxPoints > 0)
    .map(([key, config]) => ({
      name: PILLAR_NAMES[key] || key,
      maxPoints: config?.maxPoints || 0,
    }))
    .sort((a, b) => b.maxPoints - a.maxPoints);
}

function getPillarCount(pillarConfigs: Record<string, PillarConfig | undefined>): number {
  const pc =
    pillarConfigs && typeof pillarConfigs === "object" && !Array.isArray(pillarConfigs) ? pillarConfigs : {};
  return Object.values(pc).filter((config) => config && config.maxPoints > 0).length;
}

function isTransportQse(sector: Sector): boolean {
  const code = typeof sector.code === "string" ? sector.code : "";
  const t = typeof sector.type === "string" ? sector.type : "";
  return code.toUpperCase() === "TRANSPORT" && t.toLowerCase() === "qse";
}

function SectorDetailsDialog({ sector }: { sector: Sector }) {
  const pillarConfigs = safePillarConfigs(sector);
  const activePillars = getActivePillars(pillarConfigs);
  const isTransportQseSector = isTransportQse(sector);
  const levelThresholds = safeLevelThresholds(sector);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-[11px]">
          <Eye className="h-3 w-3 mr-1" />
          View Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-blue-500" />
            {sector.name}
            <Badge variant="outline" className="ml-2">
              {sector.type}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary Card */}
          <Card className={isTransportQseSector ? "border-amber-500/50 bg-amber-500/5" : ""}>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Code</p>
                  <p className="font-semibold text-sm">{sector.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Points</p>
                  <p className={`font-semibold text-sm ${isTransportQseSector ? "text-amber-600" : ""}`}>
                    {sector.totalPoints}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Pillars</p>
                  <p className={`font-semibold text-sm ${isTransportQseSector ? "text-amber-600" : ""}`}>
                    {getPillarCount(pillarConfigs)}
                  </p>
                </div>
              </div>
              {isTransportQseSector && (
                <div className="mt-3 p-2 bg-amber-500/10 rounded border border-amber-500/20">
                  <p className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    <strong>Transport QSE:</strong> Exactly 4 pillars at 25 points each = 100 total
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pillar Configuration */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Pillar Configuration
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Pillar</TableHead>
                  <TableHead className="text-xs text-right">Max Points</TableHead>
                  <TableHead className="text-xs text-center">Applicable</TableHead>
                  <TableHead className="text-xs text-center">Sub-Minimum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeObjectEntriesKV(pillarConfigs).map(([key, config]) => {
                  const isApplicable = config && config.maxPoints > 0;
                  const isTransportQsePillar = isTransportQseSector && isApplicable;
                  return (
                    <TableRow
                      key={key}
                      className={isTransportQsePillar ? "bg-amber-500/10" : !isApplicable ? "opacity-50" : ""}
                    >
                      <TableCell className="text-sm font-medium">
                        {PILLAR_NAMES[key] || key}
                        {isTransportQsePillar && (
                          <Badge variant="outline" className="ml-2 text-[9px] border-amber-500/50 text-amber-700">
                            25 pts
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {config?.maxPoints || 0}
                      </TableCell>
                      <TableCell className="text-center">
                        {isApplicable ? (
                          <Badge variant="default" className="text-[9px] bg-green-500/20 text-green-700 hover:bg-green-500/20">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">
                            No
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {config?.hasSubMinimum ? `${config.subMinimumPercent}%` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Level Thresholds */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Level Thresholds
            </h4>
            <div className="grid grid-cols-4 gap-2">
              {(Array.isArray(levelThresholds) ? levelThresholds : []).map((threshold) => (
                <div
                  key={threshold.level}
                  className="p-2 border rounded text-center"
                >
                  <p className="text-xs text-muted-foreground">Level {threshold.level}</p>
                  <p className="font-semibold text-sm">{threshold.minPoints} pts</p>
                  <p className="text-[10px] text-muted-foreground">{threshold.recognition}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

  const { data: sectors = [], isLoading: sectorsLoading } = useQuery<Sector[]>({
    queryKey: ["/api/sectors"],
    queryFn: () => apiRequest("GET", "/api/sectors").then((r) => r.json()).then(normalizeSectorsList),
    enabled: user?.role === "super_admin",
    staleTime: 60_000,
  });

  const seedSectorsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sectors/seed").then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sectors"] });
      toast({ title: "Sectors re-seeded", description: `Total sectors: ${data.result?.totalSectors || "unknown"}` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
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

  const users = Array.isArray(usersResp?.users) ? usersResp.users : [];
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
    <div className="min-h-screen bg-background relative">
      {/* Floating Autofill Buttons - Lower Left */}
      <div className="fixed bottom-4 left-4 z-50">
        <div className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/50 rounded-lg shadow-2xl p-3 space-y-2 min-w-[180px]">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Demo Data</p>
          <button
            onClick={() => seedUsersMutation.mutate()}
            disabled={seedUsersMutation.isPending}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-zinc-200 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-md transition-colors disabled:opacity-50"
          >
            {seedUsersMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <UserPlus className="h-3 w-3 text-emerald-400" />
            )}
            Seed Users
          </button>
          <button
            onClick={() => seedSessionsMutation.mutate()}
            disabled={seedSessionsMutation.isPending}
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-zinc-200 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-md transition-colors disabled:opacity-50"
          >
            {seedSessionsMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileText className="h-3 w-3 text-blue-400" />
            )}
            Seed Sessions
          </button>
          <button
            onClick={() => apiRequest("POST", "/api/certificates/process", { force: true })
              .then(() => toast({ title: "Certificate re-extraction triggered" }))
              .catch((e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }))
            }
            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-zinc-200 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-md transition-colors"
          >
            <Activity className="h-3 w-3 text-violet-400" />
            Seed Certificates
          </button>
          <div className="border-t border-zinc-700/50 pt-2 mt-1">
            <button
              onClick={() => clearDemoMutation.mutate()}
              disabled={clearDemoMutation.isPending}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-colors disabled:opacity-50"
            >
              {clearDemoMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Clear Demo Data
            </button>
          </div>
        </div>
      </div>

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

        {/* ─── Sector Configuration ─── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Building className="h-4 w-4 text-muted-foreground" /> Sector Configuration
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedSectorsMutation.mutate()}
              disabled={seedSectorsMutation.isPending}
              className="text-xs"
            >
              {seedSectorsMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Settings className="h-3 w-3 mr-1" />
              )}
              Refresh from Code
            </Button>
          </div>

          {sectorsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Sector Code</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs text-right">Total Points</TableHead>
                      <TableHead className="text-xs">Pillars</TableHead>
                      <TableHead className="text-xs">Level Thresholds</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sectors.map((sector) => {
                      const pillarConfigs = safePillarConfigs(sector);
                      const levelThresholds = safeLevelThresholds(sector);
                      const isTransportQseSector = isTransportQse(sector);
                      const activePillars = getActivePillars(pillarConfigs);
                      const activePillarList = Array.isArray(activePillars) ? activePillars : [];
                      const levelList = Array.isArray(levelThresholds) ? levelThresholds : [];

                      return (
                        <TableRow
                          key={`${sector.code}-${sector.type}`}
                          className={isTransportQseSector ? "bg-amber-500/10 border-l-2 border-l-amber-500" : ""}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{sector.code}</span>
                              {isTransportQseSector && (
                                <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-700">
                                  <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                                  Verified
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {sector.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-mono text-sm ${isTransportQseSector ? "text-amber-600 font-semibold" : ""}`}>
                              {sector.totalPoints}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {getPillarCount(pillarConfigs)} pillars
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {activePillarList.slice(0, 4).map((pillar) => (
                                  <Badge
                                    key={pillar.name}
                                    variant="secondary"
                                    className={`text-[9px] ${isTransportQseSector ? "bg-amber-500/20 text-amber-800" : ""}`}
                                  >
                                    {pillar.name.length > 12 ? `${pillar.name.slice(0, 12)}...` : pillar.name}: {pillar.maxPoints}
                                  </Badge>
                                ))}
                                {activePillarList.length > 4 && (
                                  <Badge variant="outline" className="text-[9px]">
                                    +{activePillarList.length - 4} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {levelList.slice(0, 4).map((t) => (
                                <span key={t.level} className="text-[10px] text-muted-foreground">
                                  L{t.level}: {t.minPoints}
                                </span>
                              ))}
                              {levelList.length > 4 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{levelList.length - 4} more
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <SectorDetailsDialog sector={sector} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Transport QSE Verification Note */}
          <Card className="mt-4 border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-700">Transport QSE Verification</h4>
                  <p className="text-xs text-amber-600 mt-1">
                    TRANSPORT QSE has exactly <strong>4 pillars</strong> at <strong>25 points each</strong>:
                    Skills Development, Preferential Procurement, Enterprise Development, and Socio-Economic Development.
                    Total: <strong>100 points</strong>. Ownership, Management Control, and YES are not applicable (maxPoints: 0).
                  </p>
                </div>
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
