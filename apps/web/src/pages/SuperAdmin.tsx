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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@toolkit/components/ui/tabs";
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
  Crown,
  Building,
  Settings,
  Layers,
  Target,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  BookOpen,
  Info,
  CheckCircle2,
  RotateCcw,
  History,
} from "lucide-react";

// --- Types ---

interface DeploymentRevision {
  revision: number;
  changeReason: string;
  timestamp: string | null;
  deployedBy: string | null;
}

type DeploymentsResponse = Record<string, DeploymentRevision[] | { error: string }>;

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
  chooseOneGroup?: string;
  subElements?: Array<{
    criteria: string;
    points: number;
    target: string;
    formula: string;
    isBonus?: boolean;
  }>;
}

interface SectorIndicatorRow {
  code: string;
  element: string;
  category: string;
  name: string;
  weight: number;
  target: number | string;
  targetUnit?: string;
  calculation?: string;
}

interface Sector {
  code: string;
  name: string;
  type: string;
  totalPoints: number;
  pillarConfigs?: Record<string, PillarConfig | undefined> | StoredPillarLike[];
  targets?: Record<string, unknown>;
  levelThresholds?: Array<{ level: number; minPoints: number; recognition: number }> | unknown;
  indicators?: SectorIndicatorRow[];
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
      const subMin = deriveSubMinimumPercent(item);
      out[key] = {
        maxPoints,
        hasSubMinimum: Boolean(item.hasSubMinimum),
        subMinimumPercent: subMin,
        ...((item as { chooseOneGroup?: string }).chooseOneGroup
          ? { chooseOneGroup: (item as { chooseOneGroup?: string }).chooseOneGroup }
          : {}),
        ...((item as { subElements?: PillarConfig['subElements'] }).subElements?.length
          ? { subElements: (item as { subElements?: PillarConfig['subElements'] }).subElements }
          : {}),
      };
    }
    // Legacy Arango rows merged SD+ED into enterpriseSupplierDevelopment
    const esdLegacy = (pc as StoredPillarLike[]).find((p) => p?.code === 'enterpriseSupplierDevelopment');
    if (esdLegacy && typeof esdLegacy.maxPoints === 'number' && esdLegacy.maxPoints > 0) {
      const esdPts = esdLegacy.maxPoints;
      if (!out.supplierDevelopment?.maxPoints) {
        out.supplierDevelopment = {
          maxPoints: esdPts,
          hasSubMinimum: Boolean(esdLegacy.hasSubMinimum),
          subMinimumPercent: Number(esdLegacy.subMinimumThreshold) || 0,
        };
      }
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

// --- Helpers ---

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

/** Format numeric values to at most `decimals` places (fixes float display like 6.800000000000001). */
function formatDecimal(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toFixed(decimals)).toString();
}

function formatPercent(value: number, decimals = 2): string {
  return `${formatDecimal(value, decimals)}%`;
}

function deriveSubMinimumPercent(item: StoredPillarLike): number {
  if (typeof item.subMinimumPercent === "number" && Number.isFinite(item.subMinimumPercent)) {
    return item.subMinimumPercent;
  }
  const maxPts = typeof item.maxPoints === "number" ? item.maxPoints : Number(item.maxPoints) || 0;
  const threshold =
    typeof item.subMinimumThreshold === "number"
      ? item.subMinimumThreshold
      : Number(item.subMinimumThreshold) || 0;
  if (maxPts > 0 && threshold > 0 && threshold <= maxPts) {
    return (threshold / maxPts) * 100;
  }
  return 0;
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

// --- Sector Helpers ---

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

const TRANSPORT_QSE_COMPULSORY_PILLARS = new Set(["ownership", "managementControl", "employmentEquity"]);
const TRANSPORT_QSE_ELECTIVE_PILLARS = new Set([
  "skillsDevelopment",
  "preferentialProcurement",
  "enterpriseDevelopment",
  "socioEconomicDevelopment",
]);

const PILLAR_ORDER = [
  "ownership",
  "managementControl",
  "employmentEquity",
  "skillsDevelopment",
  "preferentialProcurement",
  "supplierDevelopment",
  "enterpriseDevelopment",
  "socioEconomicDevelopment",
  "yesInitiative",
];

function sectorTabId(sector: Sector): string {
  return `${sector.code}-${sector.type}`;
}

function sectorTabLabel(sector: Sector): string {
  const code = sector.code || "";
  const type = sector.type || "";
  return `${code} ${type}`.trim();
}

type TargetRow = { criteria: string; points: number; target: string; formula: string; isBonus?: boolean };

const PILLAR_TARGET_KEY: Record<string, string> = {
  ownership: "ownership",
  managementControl: "managementControl",
  employmentEquity: "employmentEquity",
  skillsDevelopment: "skills",
  preferentialProcurement: "procurement",
  supplierDevelopment: "esd",
  enterpriseDevelopment: "esd",
  socioEconomicDevelopment: "sed",
};

function humanizeKey(key: string): string {
  return key
    .replace(/MaxPts$|Bonus$|Target$|Percent$/g, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function formatTargetValue(key: string, value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (key.includes("Percent") || key.includes("Target")) {
    if (value > 0 && value <= 1) return formatPercent(value * 100);
  }
  return formatDecimal(value);
}

// Per-pillar scoring formulas for expert reference
const PILLAR_FORMULAS: Record<string, Record<string, string>> = {
  ownership: {
    votingRightsMaxPts: "min(actual Black voting % / target%, 1) × max_points",
    womenVotingMaxPts: "min(actual Black women voting % / target%, 1) × max_points",
    economicInterestMaxPts: "min(actual Black EI % / target%, 1) × max_points",
    womenEIMaxPts: "min(actual Black women EI % / target%, 1) × max_points",
    netValueMaxPts: "Year-graduated factor × Black EI% / 100% × 8 pts",
    newEntrantsMaxPts: "Full points if any Black new entrant shareholder present",
  },
  managementControl: {
    boardBlackMaxPts: "min(Black board members / total board, target%) / target% × max_points",
    boardBWMaxPts: "min(Black women board members / total board, target%) / target% × max_points",
    execBlackMaxPts: "min(Black exec directors / total exec, 50%) / 50% × max_points",
    execBWMaxPts: "min(Black women exec directors / total exec, 25%) / 25% × max_points",
    otherExecBlackMaxPts: "min(Black other exec mgmt / total other exec, target%) / target% × max_points",
    otherExecBWMaxPts: "min(Black women other exec / total other exec, target%) / target% × max_points",
    seniorMaxPts: "min(Black senior mgmt / total senior, EAP%) / EAP% × max_points",
    middleMaxPts: "min(Black middle mgmt / total middle, EAP%) / EAP% × max_points",
    juniorMaxPts: "min(Black junior mgmt / total junior, EAP%) / EAP% × max_points",
    disabledMaxPts: "min(Black disabled employees / total employees, 2%) / 2% × max_points",
  },
  skills: {
    learningProgrammesMaxPts: "min(recognised Black training spend / leviable amount, target%) / target% × max_points",
    bursaryMaxPts: "min(Black bursary spend / leviable amount, target%) / target% × max_points",
    disabledLearningMaxPts: "min(Black disabled training spend / leviable amount, target%) / target% × max_points",
    learnershipsMaxPts: "min(Black learners in B/C/D programmes / headcount, target%) / target% × max_points",
    absorptionMaxPts: "min(absorbed learners / total learners, 100%) × max_points",
  },
  procurement: {
    allSuppliersMaxPts: "Σ(supplier spend × BEE recognition%) / TMPS / 80% × 5 pts",
    qseMaxPts: "Σ(QSE spend) / TMPS / 15% × max_points",
    emeMaxPts: "Σ(EME spend) / TMPS / 15% × max_points",
    bo51MaxPts: "Σ(≥51% Black-owned spend) / TMPS / 50% × max_points",
    bwo30MaxPts: "Σ(≥30% Black women-owned spend) / TMPS / 12% × max_points",
    dgMaxPts: "Σ(designated group spend) / TMPS / 2% × max_points  [bonus row]",
  },
  esd: {
    sdMaxPts: "Σ(contribution × benefit factor) / (2% of NPAT) × max_points",
    edMaxPts: "Σ(contribution × benefit factor) / (1% of NPAT) × max_points",
    edGraduationBonus: "+1 pt if ≥1 SD beneficiary graduated to self-sufficiency",
    edJobsBonus: "+1 pt if ≥1 permanent job created by ED beneficiary",
  },
  sed: {
    maxPts: "Σ(qualifying SED spend) / (1% of NPAT) × max_points",
  },
};

function getPillarFormula(pillarKey: string, fieldKey: string): string {
  const formulaKey = PILLAR_TARGET_KEY[pillarKey] ?? pillarKey;
  const bucket = PILLAR_FORMULAS[formulaKey] ?? PILLAR_FORMULAS[pillarKey] ?? {};
  return bucket[fieldKey] ?? "min(actual / target, 1) × max_points";
}

/** Construction element name → workbook / sectorConfig pillar key. */
const PILLAR_TO_CONSTRUCTION_ELEMENT: Record<string, string> = {
  ownership: "ownership",
  managementControl: "managementControl",
  skillsDevelopment: "skillsDevelopment",
  supplierDevelopment: "enterpriseSupplierDevelopment",
  socioEconomicDevelopment: "socioEconomicDevelopment",
};

function buildIndicatorRows(sector: Sector, pillarKey: string): TargetRow[] {
  const indicators = sector.indicators;
  if (!indicators?.length) return [];
  const element = PILLAR_TO_CONSTRUCTION_ELEMENT[pillarKey] ?? pillarKey;
  return indicators
    .filter((ind) => ind.element === element && ind.weight > 0)
    .map((ind) => ({
      criteria: ind.name,
      points: ind.weight,
      target:
        typeof ind.target === "number"
          ? ind.targetUnit === "percent" || ind.targetUnit === "percent_above"
            ? `${ind.target}%`
            : String(ind.target)
          : String(ind.target),
      formula: ind.calculation ?? "indicator",
      isBonus: ind.category === "bonus",
    }));
}

function buildPillarTargetRows(sector: Sector, pillarKey: string): TargetRow[] {
  const pillarConfig = safePillarConfigs(sector)[pillarKey];
  if (pillarConfig?.subElements?.length) {
    return pillarConfig.subElements.map((el) => ({
      criteria: el.criteria,
      points: el.points,
      target: el.target || "—",
      formula: el.formula || "min(actual / target, 1) × max_points",
      isBonus: el.isBonus,
    }));
  }

  const indicatorRows = buildIndicatorRows(sector, pillarKey);
  if (indicatorRows.length > 0) return indicatorRows;

  const targets = sector.targets;
  if (!targets || typeof targets !== "object") return [];
  const bucketKey = PILLAR_TARGET_KEY[pillarKey];
  if (!bucketKey) return [];
  const bucket = (targets as Record<string, unknown>)[bucketKey];
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) return [];

  // Super Admin Fix Plan §1.2 — SD and ED share `targets.esd`; filter by key prefix.
  const esdPrefix =
    bucketKey === "esd"
      ? pillarKey === "supplierDevelopment"
        ? "sd"
        : pillarKey === "enterpriseDevelopment"
          ? "ed"
          : null
      : null;

  const rows: TargetRow[] = [];
  for (const [k, v] of Object.entries(bucket as Record<string, unknown>)) {
    if (esdPrefix && !k.toLowerCase().startsWith(esdPrefix)) continue;
    if (typeof v !== "number" || v <= 0) continue;
    if (!k.endsWith("MaxPts") && !k.endsWith("Bonus") && k !== "maxPts") continue;
    const targetKey = k.replace(/MaxPts$/, "Target").replace(/Bonus$/, "Target");
    const targetVal = (bucket as Record<string, unknown>)[targetKey];
    rows.push({
      criteria: humanizeKey(k),
      points: v,
      target: formatTargetValue(targetKey, targetVal ?? (bucket as Record<string, unknown>).spendPercent),
      formula: getPillarFormula(pillarKey, k),
      isBonus: k.includes("Bonus"),
    });
  }
  return rows;
}

function getPillarSubMinimumCopy(pillarKey: string): string | null {
  if (pillarKey === "ownership") {
    return "Sub-minimum: 40% of Net Value points (3.2 / 8 pts)";
  }
  return null;
}

function getManagementControlLabel(sector: Sector): string {
  const pc = safePillarConfigs(sector);
  const eePts = pc.employmentEquity?.maxPoints ?? 0;
  return eePts > 0 ? "Management Control" : "Management Control (incl. Employment Equity)";
}

function sectorHasSeparateEePillar(sectors: Sector[]): boolean {
  return sectors.some((s) => (safePillarConfigs(s).employmentEquity?.maxPoints ?? 0) > 0);
}

function SectorIntegrityWarning({ sector, pillarKey, config }: { sector: Sector; pillarKey: string; config: PillarConfig }) {
  const targetRows = buildPillarTargetRows(sector, pillarKey);
  if (targetRows.length === 0) return null;
  const rowSum = targetRows.reduce((s, r) => s + r.points, 0);
  if (Math.abs(rowSum - config.maxPoints) <= 0.5) return null;
  return (
    <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-800">
      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
      <span>
        Pillar header reports <strong>{config.maxPoints} pts</strong> but indicator rows sum to{" "}
        <strong>{rowSum} pts</strong> — see docs/SECTOR_TRUTH_LEDGER.md.
      </span>
    </div>
  );
}

function CrossSectorTable({ sectors }: { sectors: Sector[] }) {
  const ordered = [...sectors].sort((a, b) => sectorTabLabel(a).localeCompare(sectorTabLabel(b)));
  const showEeRow = sectorHasSeparateEePillar(ordered);
  const visiblePillars = PILLAR_ORDER.filter((key) => showEeRow || key !== "employmentEquity");

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs min-w-[140px]">Pillar</TableHead>
              {ordered.map((s) => (
                <TableHead key={sectorTabId(s)} className="text-xs text-center whitespace-nowrap">
                  {sectorTabLabel(s)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiblePillars.map((key) => (
              <TableRow key={key}>
                <TableCell className="text-xs font-medium">
                  {key === "managementControl" ? "Management Control (incl. EE where merged)" : PILLAR_NAMES[key] ?? key}
                </TableCell>
                {ordered.map((s) => {
                  const config = safePillarConfigs(s)[key];
                  const pts = config?.maxPoints ?? 0;
                  return (
                    <TableCell key={sectorTabId(s)} className="text-xs text-center font-mono">
                      {pts > 0 ? pts : "—"}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            <TableRow className="font-semibold bg-muted/30">
              <TableCell className="text-xs">Grand Total</TableCell>
              {ordered.map((s) => (
                <TableCell key={sectorTabId(s)} className="text-xs text-center font-mono font-bold">
                  {s.totalPoints}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ApiPillarCard({
  pillarKey,
  config,
  sector,
  pillarLabel,
}: {
  pillarKey: string;
  config: PillarConfig;
  sector: Sector;
  pillarLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const targetRows = buildPillarTargetRows(sector, pillarKey);
  const transportQse = isTransportQse(sector);
  const isCompulsory = transportQse && TRANSPORT_QSE_COMPULSORY_PILLARS.has(pillarKey);
  const isElective = transportQse && (config.chooseOneGroup === "transport_qse_elective" || TRANSPORT_QSE_ELECTIVE_PILLARS.has(pillarKey));

  return (
    <Card className={config.hasSubMinimum ? "border-amber-500/40" : ""}>
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-4"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <span className="text-sm font-semibold truncate">{pillarLabel ?? PILLAR_NAMES[pillarKey] ?? pillarKey}</span>
          {isCompulsory && (
            <Badge variant="outline" className="text-[9px] border-blue-500/50 text-blue-700 shrink-0">
              Compulsory (82 pts base)
            </Badge>
          )}
          {isElective && (
            <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-700 shrink-0">
              Elective — choose 1 of 4 (+25 pts)
            </Badge>
          )}
          {config.hasSubMinimum && (
            <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-600 shrink-0">
              {getPillarSubMinimumCopy(pillarKey) ?? `sub-min ${formatPercent(config.subMinimumPercent)}`}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-sm font-bold">{formatDecimal(config.maxPoints)} pts</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          <SectorIntegrityWarning sector={sector} pillarKey={pillarKey} config={config} />
          {targetRows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Indicator</TableHead>
                    <TableHead className="text-[10px] text-center w-14">Points</TableHead>
                    <TableHead className="text-[10px] w-24">Target</TableHead>
                    <TableHead className="text-[10px]">Formula / Calculation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targetRows.map((el, i) => (
                    <TableRow key={i} className={el.isBonus ? "bg-green-500/5" : ""}>
                      <TableCell className="text-xs">
                        {el.criteria}
                        {el.isBonus && (
                          <Badge variant="outline" className="ml-2 text-[9px] border-green-500/40 text-green-600">
                            bonus
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-center font-mono font-semibold">{formatDecimal(el.points)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{el.target}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground font-mono leading-relaxed">{el.formula}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No scoring rows configured for this pillar — check sector config or re-seed from code.
            </p>
          )}
          {config.hasSubMinimum && (
            <div className="flex items-start gap-2 p-2 rounded bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-700">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                <strong>Sub-minimum rule:</strong>{" "}
                {getPillarSubMinimumCopy(pillarKey) ??
                  `If scored points fall below ${formatPercent(config.subMinimumPercent)} of max points, the B-BBEE level is discounted by one level (e.g. Level 3 → Level 4).`}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const SECTOR_CALC_METHODS: Record<string, { levelNote: string; subMinNote: string; npatNote: string }> = {
  "RCOGP-Generic": {
    levelNote: "Standard scale: 100+ → L1, 95–99 → L2, 90–94 → L3, 80–89 → L4, 75–79 → L5, 70–74 → L6, 55–69 → L7, 40–54 → L8, <40 → Non-Compliant.",
    subMinNote: "Priority pillars with sub-minimum: Ownership (40% of Net Value pts = 3.2/8), Skills (40% of 20 base pts = 8), PP (40% of 27 base pts = 10.8), SD (40% of 10 pts = 4). Failing any → level drops by 1.",
    npatNote: "If actual NPAT < 25% of industry norm, use NPAT = industry norm% × turnover as the target base. If no valid NPAT in 5 years, use 25% of latest industry norm.",
  },
  "RCOGP-QSE": {
    levelNote: "Same standard scale as RCOGP Generic (100/95/90/80/75/70/55/40). Total out of 108 pts.",
    subMinNote: "QSE must choose SD or ESD for the sub-minimum priority check. Ownership sub-minimum still applies.",
    npatNote: "Deemed NPAT applies same as Generic when actual NPAT is below the industry norm threshold.",
  },
  "ICT-Generic": {
    levelNote: "ICT scale (140-pt total): 120+ → L1, 115–119 → L2, 110–114 → L3, 100–109 → L4, 95–99 → L5, 90–94 → L6, 75–89 → L7, 55–74 → L8, <55 → Non-Compliant.",
    subMinNote: "Same priority element sub-minimum rules as RCOGP Generic, applied to ICT-specific max points.",
    npatNote: "Same deemed NPAT logic as RCOGP. ICT industry norm used where applicable.",
  },
  "ICT-QSE": {
    levelNote: "ICT scale applied to QSE (116-pt total): same threshold percentages as ICT Generic.",
    subMinNote: "QSE sub-minimum: choose SD or ESD priority check.",
    npatNote: "Deemed NPAT same as ICT Generic.",
  },
  "FSC-Generic": {
    levelNote: "FSC scaled thresholds (not integers): 95.5 → L1, 90.7 → L2, 86.0 → L3, 76.4 → L4, 71.6 → L5, 66.8 → L6, 52.5 → L7, 38.2 → L8.",
    subMinNote: "Same priority element sub-minimum rules as RCOGP, applied to FSC-specific max points per sub-sector.",
    npatNote: "Deemed NPAT uses FSC financial sector norm (15% industry norm).",
  },
  "AGRI-Generic": {
    levelNote: "Standard scale (100/95/90/80/75/70/55/40). Total out of 132 pts.",
    subMinNote: "Same sub-minimum rules as RCOGP Generic, applied to AgriBEE max points.",
    npatNote: "Deemed NPAT uses agriculture norm (8% industry norm).",
  },
  "TRANSPORT-Generic": {
    levelNote: "Standard scale scaled to 108-pt total (e.g. L1 ≥ 90 pts). MC and EE are separate gazetted pillars (11 + 18 pts).",
    subMinNote: "Transport toolkit Notes sheet defines MC indicator sub-minimum targets (Voting 50%/25%, Exec 50%/20%, Senior/Other Top 40%/20%).",
    npatNote: "Enterprise Development pillar (15 pts) uses 3% NPAT supplier development formula — toolkit labelling quirk.",
  },
  "TRANSPORT-QSE": {
    levelNote: "Standard scale scaled to 107-pt total (82 compulsory + 25 chosen elective).",
    subMinNote: "Choose exactly ONE elective pillar (Skills / PP / Enterprise Dev / SED) at 25 pts each.",
    npatNote: "Compulsory pillars: Ownership 28 + MC 27 + EE 27 = 82. One elective adds 25 pts.",
  },
  "CONSTRUCTION-QSE": {
    levelNote: "Construction QSE total 110 pts. Level thresholds use standard scale as placeholder — [UNVERIFIED] pending expert calibration.",
    subMinNote: "Construction QSE uses combined Enterprise & Supplier Development pillar (29 pts).",
    npatNote: "Indicator-level scoring via Construction Sector Code matrix (constructionIndicators.ts).",
  },
  "CONSTRUCTION-Contractor": {
    levelNote: "Construction Contractor total 123 pts. Level thresholds placeholder — [UNVERIFIED].",
    subMinNote: "Combined ESD pillar 38 pts (PP + SD). MC includes board through junior bands plus professional registration and youth bonus.",
    npatNote: "SD contributions target 3% NPAT; SED target 1.25% NPAT.",
  },
  "CONSTRUCTION-BEP": {
    levelNote: "Construction BEP total 123 pts (Skills 34, ESD 30). Level thresholds placeholder — [UNVERIFIED].",
    subMinNote: "BEP MC excludes junior management rows; ownership targets subject to professional-registration adjustment rule.",
    npatNote: "Indicator matrix matches Construction sector codes docx column 4/5 weights.",
  },
};

function getSectorCalcMethod(sector: Sector) {
  const key = `${sector.code}-${sector.type}`;
  return SECTOR_CALC_METHODS[key] ?? null;
}

function SectorTabView({ sector }: { sector: Sector }) {
  const pillarConfigs = safePillarConfigs(sector);
  const levelThresholds = safeLevelThresholds(sector);
  const calcMethod = getSectorCalcMethod(sector);
  const activeEntries = PILLAR_ORDER.map((key) => ({ key, config: pillarConfigs[key] })).filter(
    (e) => e.config && e.config.maxPoints > 0,
  );

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="text-xs">{sector.type}</Badge>
        <span className="text-sm font-mono font-bold text-primary">{sector.totalPoints} total points</span>
        {isTransportQse(sector) && (
          <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-700">
            82 compulsory + 25 elective = 107 pts
          </Badge>
        )}
      </div>

      {isTransportQse(sector) && (
        <p className="text-xs text-amber-700 bg-amber-500/5 border border-amber-500/30 rounded-md px-3 py-2">
          This scorecard requires choosing exactly one of four elective pillars (Skills Development, Preferential
          Procurement, Enterprise Development, or Socio-Economic Development), each worth 25 pts. That elective is added
          to the 82-pt compulsory base for a 107-pt total.
        </p>
      )}

      <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Pillar breakdown — click to expand scoring rows and formulas
          </p>
          {activeEntries.map(({ key, config }) => (
            <ApiPillarCard
              key={key}
              pillarKey={key}
              config={config!}
              sector={sector}
              pillarLabel={key === "managementControl" ? getManagementControlLabel(sector) : undefined}
            />
          ))}
        </div>

        <div className="min-w-[220px] space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Level thresholds</p>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Level</TableHead>
                      <TableHead className="text-[10px] text-right">Min pts</TableHead>
                      <TableHead className="text-[10px] text-right">Recognition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {levelThresholds.map((t) => (
                      <TableRow key={t.level} className={t.level === 1 ? "bg-green-500/10" : ""}>
                        <TableCell className="text-xs font-semibold">Level {t.level}</TableCell>
                        <TableCell className="text-xs text-right font-mono">≥ {t.minPoints}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{t.recognition}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {calcMethod ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Calculation method
              </p>
              <Card>
                <CardContent className="p-3 space-y-3">
                  <div>
                    <p className="text-[9px] font-semibold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                      <Target className="h-3 w-3" /> Level determination
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{calcMethod.levelNote}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase text-amber-600 mb-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Sub-minimum discount
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{calcMethod.subMinNote}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                      <Info className="h-3 w-3" /> NPAT / deemed profit
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{calcMethod.npatNote}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase text-blue-600 mb-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> YES initiative
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      YES is not scored — it improves the B-BBEE level after all pillars are calculated.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Calculation method
              </p>
              <Card>
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Per-indicator formulas shown in each pillar breakdown use{" "}
                    <span className="font-mono">min(actual / target, 1) × max_points</span> unless noted.
                    Level thresholds are in the table above. Total score = sum of pillar points
                    {isTransportQse(sector) ? " (82 compulsory + 1 chosen elective of 25)." : "."}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
                    <strong>Transport QSE:</strong> Compulsory base 82 pts (Ownership 28 + MC 27 + EE 27) + choose ONE
                    elective at 25 pts (Skills / PP / Enterprise Dev / SED) = 107 total
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
                  const isTransportQseCompulsory = isTransportQseSector && TRANSPORT_QSE_COMPULSORY_PILLARS.has(key);
                  const isTransportQseElective =
                    isTransportQseSector && isApplicable && config?.chooseOneGroup === "transport_qse_elective";
                  return (
                    <TableRow
                      key={key}
                      className={isTransportQseCompulsory || isTransportQseElective ? "bg-amber-500/10" : !isApplicable ? "opacity-50" : ""}
                    >
                      <TableCell className="text-sm font-medium">
                        {PILLAR_NAMES[key] || key}
                        {isTransportQseCompulsory && (
                          <Badge variant="outline" className="ml-2 text-[9px] border-blue-500/50 text-blue-700">
                            compulsory
                          </Badge>
                        )}
                        {isTransportQseElective && (
                          <Badge variant="outline" className="ml-2 text-[9px] border-amber-500/50 text-amber-700">
                            elective (+25)
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {formatDecimal(config?.maxPoints || 0)}
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
                        {config?.hasSubMinimum ? formatPercent(config.subMinimumPercent) : "—"}
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
                  <p className="font-semibold text-sm">{formatDecimal(threshold.minPoints)} pts</p>
                  <p className="text-[10px] text-muted-foreground">{formatPercent(threshold.recognition)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- User Row ---

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

// --- Main Page ---

export default function SuperAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [skip, setSkip] = useState(0);
  const limit = 50;

  // Rollback state
  const [rollbackTarget, setRollbackTarget] = useState<{ deployment: string; revision: number } | null>(null);

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

  const { data: deploymentsData, isLoading: deploymentsLoading, refetch: refetchDeployments } = useQuery<DeploymentsResponse>({
    queryKey: ["/api/admin/deployments"],
    queryFn: () => apiRequest("GET", "/api/admin/deployments").then((r) => r.json()),
    enabled: user?.role === "super_admin",
    staleTime: 60_000,
  });

  const rollbackMutation = useMutation({
    mutationFn: (payload: { deployment: string; revision: number }) =>
      apiRequest("POST", "/api/admin/rollback", payload).then((r) => r.json()),
    onSuccess: (data: any, vars) => {
      setRollbackTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deployments"] });
      toast({
        title: "Rollback initiated",
        description: data.message ?? `Rolled back ${vars.deployment} to revision ${vars.revision}`,
      });
    },
    onError: (err: any) => {
      setRollbackTarget(null);
      toast({ title: "Rollback failed", description: err.message, variant: "destructive" });
    },
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

        {/* --- System Status --- */}
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

        {/* --- B-BBEE scorecard reference (read-only, from sectorConfig via API) --- */}
        <section>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" /> B-BBEE Scorecard Reference
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                Read-only reference from sector config (<span className="font-mono text-[10px]">/api/sectors</span>) — pillar weights, sub-minimums, and level thresholds.
              </p>
            </div>
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
          ) : sectors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">No sectors loaded. Use Refresh from Code to seed sector rules.</p>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">All sectors at a glance</p>
                <CrossSectorTable sectors={sectors} />
              </div>

              <Tabs defaultValue={sectorTabId(sectors[0])}>
                <TabsList className="flex-wrap h-auto gap-1 mb-2">
                  {sectors.map((s) => (
                    <TabsTrigger key={sectorTabId(s)} value={sectorTabId(s)} className="text-xs">
                      {sectorTabLabel(s)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {sectors.map((s) => (
                  <TabsContent key={sectorTabId(s)} value={sectorTabId(s)}>
                    <SectorTabView sector={s} />
                  </TabsContent>
                ))}
              </Tabs>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">BEE recognition levels</p>
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Level</TableHead>
                            <TableHead className="text-[10px] text-right">Recognition</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            { level: 1, rec: "135%" },
                            { level: 2, rec: "125%" },
                            { level: 3, rec: "110%" },
                            { level: 4, rec: "100%" },
                            { level: 5, rec: "80%" },
                            { level: 6, rec: "60%" },
                            { level: 7, rec: "50%" },
                            { level: 8, rec: "10%" },
                          ].map((r) => (
                            <TableRow key={r.level}>
                              <TableCell className="text-xs">Level {r.level}</TableCell>
                              <TableCell className="text-xs text-right font-mono">{r.rec}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Company size thresholds</p>
                  <Card>
                    <CardContent className="p-4 space-y-3 text-[11px] text-muted-foreground">
                      <p><strong className="text-green-600">EME</strong> — turnover under R10M</p>
                      <p><strong className="text-blue-600">QSE</strong> — R10M to R50M</p>
                      <p><strong className="text-violet-600">Generic</strong> — over R50M</p>
                    </CardContent>
                  </Card>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">YES initiative</p>
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <p className="text-[11px] text-amber-700 font-medium">Not a scored pillar (maxPoints = 0)</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        YES provides level uplift after sub-minimum discounting. Tier 2 (1.5× headcount + 5% absorption)
                        also adds <strong>+3 bonus points</strong> to the achieved total — separate from the 120-point max.
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Excel Summary shows a &quot;YES points&quot; row equal to the grand total when bonus = 0; that is not
                        double-counting. Lake Trading validation: 63.56 pillar total, YES bonus 0.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </section>

        {/* --- User Management --- */}
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

        {/* --- Deployment Rollback --- */}
        <section>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-amber-400" />
                  Deployment Rollback
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => refetchDeployments()}
                  disabled={deploymentsLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${deploymentsLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Roll back any Kubernetes deployment to a previous revision. This runs{" "}
                <code className="font-mono bg-muted px-1 rounded">kubectl rollout undo</code> against the cluster.
              </p>
            </CardHeader>
            <CardContent>
              {deploymentsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !deploymentsData ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                  <AlertCircle className="h-4 w-4" />
                  Failed to load deployment history.
                </div>
              ) : (
                <div className="space-y-6">
                  {(["web", "api", "compute"] as const).map((depName) => {
                    const entry = deploymentsData[depName];
                    const isError = entry && "error" in entry;
                    const revisions = isError ? [] : (entry as DeploymentRevision[]) ?? [];

                    return (
                      <div key={depName}>
                        <div className="flex items-center gap-2 mb-2">
                          <Server className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium capitalize">{depName}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            deployment/{depName}
                          </Badge>
                        </div>
                        {isError ? (
                          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded px-3 py-2">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            {(entry as { error: string }).error}
                          </div>
                        ) : revisions.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-1">No revisions found.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs w-20">Revision</TableHead>
                                <TableHead className="text-xs">Change reason</TableHead>
                                <TableHead className="text-xs w-36">Deployed by</TableHead>
                                <TableHead className="text-xs w-44">Timestamp</TableHead>
                                <TableHead className="text-xs w-24 text-right">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {revisions.map((rev, idx) => (
                                <TableRow key={rev.revision}>
                                  <TableCell className="text-xs font-mono">
                                    #{rev.revision}
                                    {idx === 0 && (
                                      <Badge className="ml-1.5 text-[9px] h-3.5 px-1 bg-green-600/20 text-green-600 border-green-600/30">
                                        current
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                                    {rev.changeReason || <span className="italic opacity-50">—</span>}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {rev.deployedBy ?? <span className="text-muted-foreground italic opacity-50">—</span>}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {rev.timestamp
                                      ? new Date(rev.timestamp).toLocaleString()
                                      : <span className="italic opacity-50">—</span>}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {idx === 0 ? (
                                      <span className="text-xs text-muted-foreground italic">live</span>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                                        disabled={rollbackMutation.isPending}
                                        onClick={() => setRollbackTarget({ deployment: depName, revision: rev.revision })}
                                      >
                                        <RotateCcw className="h-3 w-3 mr-1" />
                                        Rollback
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Rollback confirmation dialog */}
        <Dialog open={!!rollbackTarget} onOpenChange={(open) => { if (!open) setRollbackTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-500" />
                Confirm Rollback
              </DialogTitle>
            </DialogHeader>
            {rollbackTarget && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You are about to roll back{" "}
                  <span className="font-semibold text-foreground">deployment/{rollbackTarget.deployment}</span>{" "}
                  to{" "}
                  <span className="font-semibold text-foreground">revision #{rollbackTarget.revision}</span>.
                  This will immediately replace the running pods in production.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRollbackTarget(null)}
                    disabled={rollbackMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={rollbackMutation.isPending}
                    onClick={() => rollbackMutation.mutate(rollbackTarget)}
                  >
                    {rollbackMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Confirm Rollback
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
