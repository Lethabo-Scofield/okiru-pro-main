import { useEffect, useState } from "react";
import { Activity, Award, FileCheck2, Leaf, Loader2, Users } from "lucide-react";
import { API_BASE } from "@toolkit/lib/config";
import { Card, CardContent, CardHeader, CardTitle } from "@toolkit/components/ui/card";
import { Badge } from "@toolkit/components/ui/badge";
import { Button } from "@toolkit/components/ui/button";
import { AppNavBack } from "@/components/AppNavBack";
import { useAuth } from "@toolkit/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { useLocation } from "wouter";

type ProductCode = "esg" | "bbbee" | "certificates";
type UsageRow = { productCode: ProductCode; uniqueUsers: number; accessCount: number; switches: number; mostRecentAccess: string | null };
type UserRow = {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  organizationName: string | null;
  initialProduct: ProductCode | null;
  lastLogin: string | null;
  lastActivity: string | null;
  mostRecentProduct: ProductCode | null;
};

const productMeta: Record<ProductCode, { label: string; icon: typeof Leaf }> = {
  esg: { label: "ESG", icon: Leaf },
  bbbee: { label: "B-BBEE", icon: Award },
  certificates: { label: "Certificates", icon: FileCheck2 },
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

export default function AdminUserIntelligence() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin(user)) return;
    let cancelled = false;
    Promise.all([
      fetch(`${API_BASE}/api/admin/analytics`, { credentials: "include" }),
      fetch(`${API_BASE}/api/admin/product-usage`, { credentials: "include" }),
      fetch(`${API_BASE}/api/admin/users?limit=50`, { credentials: "include" }),
    ]).then(async ([analytics, usage, users]) => {
      if (!analytics.ok || !usage.ok || !users.ok) throw new Error("Unable to load user intelligence");
      const [analyticsData, usageData, usersData] = await Promise.all([analytics.json(), usage.json(), users.json()]);
      if (!cancelled) setData({ analytics: analyticsData, usage: usageData.products ?? [], users: usersData.users ?? usersData ?? [] });
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load user intelligence");
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!isSuperAdmin(user)) {
    return <div className="min-h-screen flex items-center justify-center"><Button onClick={() => navigate("/hub")}>Go to Hub</Button></div>;
  }
  if (error) return <div className="min-h-screen p-8"><AppNavBack href="/hub" eyebrow="Admin" label="Hub" variant="light" /><p className="text-sm text-red-600">{error}</p></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const analytics = data.analytics;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl px-6 py-8">
        <AppNavBack href="/hub" eyebrow="Admin" label="Hub" variant="light" className="mb-7" />
        <div className="flex items-start justify-between gap-4 mb-8">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Platform operations</p><h1 className="text-3xl font-semibold tracking-tight">User intelligence</h1><p className="mt-2 text-sm text-muted-foreground">Product interest, access and account activity.</p></div>
          <Button variant="outline" onClick={() => navigate("/admin/users")}>User management</Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
          {[[Users, "Total users", analytics.totalUsers], [Activity, "Active today", analytics.dailyActiveUsers], [Activity, "Active this month", analytics.monthlyActiveUsers], [Users, "New in 30 days", analytics.newRegistrations], [Users, "Inactive", analytics.inactiveUsers]].map(([Icon, label, value]: any) => (
            <Card key={label as string}><CardContent className="p-5"><Icon className="h-4 w-4 text-muted-foreground mb-4" /><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground mt-1">{label}</p></CardContent></Card>
          ))}
        </div>

        <section className="mb-8"><h2 className="text-sm font-semibold mb-3">Product usage</h2><div className="grid gap-4 md:grid-cols-3">
          {(["esg", "bbbee", "certificates"] as ProductCode[]).map((code) => { const row = (data.usage as UsageRow[]).find((item) => item.productCode === code); const meta = productMeta[code]; const Icon = meta.icon; return <Card key={code}><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{meta.label}</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3 text-sm"><div><p className="font-semibold">{row?.uniqueUsers ?? 0}</p><p className="text-xs text-muted-foreground">users</p></div><div><p className="font-semibold">{row?.accessCount ?? 0}</p><p className="text-xs text-muted-foreground">opens</p></div><div><p className="font-semibold">{row?.switches ?? 0}</p><p className="text-xs text-muted-foreground">switches</p></div></CardContent></Card>; })}
        </div></section>

        <Card><CardHeader><CardTitle className="text-base">Account activity</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-3 pr-4">User</th><th className="pb-3 pr-4">Company</th><th className="pb-3 pr-4">Initial interest</th><th className="pb-3 pr-4">Last login</th><th className="pb-3">Last product</th></tr></thead><tbody>{(data.users as UserRow[]).map((row) => <tr key={row.id} className="border-b last:border-0"><td className="py-3 pr-4"><p className="font-medium">{row.fullName || row.username}</p><p className="text-xs text-muted-foreground">{row.email || row.username}</p></td><td className="py-3 pr-4">{row.organizationName || "Unassigned"}</td><td className="py-3 pr-4">{row.initialProduct ? <Badge variant="outline">{productMeta[row.initialProduct]?.label}</Badge> : "Not selected"}</td><td className="py-3 pr-4 text-muted-foreground">{formatDate(row.lastLogin)}</td><td className="py-3">{row.mostRecentProduct ? productMeta[row.mostRecentProduct]?.label : "No activity"}</td></tr>)}</tbody></table></CardContent></Card>
      </main>
    </div>
  );
}
