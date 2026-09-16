import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { BarChart3, Building2, ChevronRight, FileText, Leaf, Settings2, Users } from "lucide-react";
import { useEsgAccess } from "@/hooks/useEsgAccess";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { useActiveCompany } from "@/lib/activeCompany";

export default function HubLanding() {
  const [, navigate] = useLocation();
  const { activeCompany, loading } = useActiveCompany();
  const { allowed: esgAllowed } = useEsgAccess();
  useEffect(() => { if (!loading && !activeCompany) navigate("/companies", { replace: true }); }, [activeCompany, loading, navigate]);
  if (loading || !activeCompany) return <div className="min-h-screen bg-[#f8f8f7]" />;
  const companyId = encodeURIComponent(activeCompany.id);
  const actions = [
    { label: "Scorecards", description: "Create and review B-BBEE scorecards.", href: `/create-scorecard/${companyId}`, icon: BarChart3 },
    ...(esgAllowed ? [{ label: "ESG", description: "Open the ESG workspace and reporting inputs.", href: `/esg/create/${companyId}`, icon: Leaf }] : []),
    { label: "Documents", description: "Process and manage company documents.", href: "/documents", icon: FileText },
    { label: "Reports", description: "Review saved scorecards and reports.", href: "/dashboard", icon: FileText },
  ];
  return <div className="min-h-screen bg-[#f8f8f7] text-[#171717]"><header className="sticky top-0 z-20 border-b border-[#dededb] bg-white"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b6b68]">Active company</p><div className="mt-0.5 flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0" /><span className="truncate text-base font-semibold">{activeCompany.name}</span><Link href="/companies" className="ml-2 text-sm text-[#4b4b48] underline underline-offset-4">Switch company</Link></div></div><div className="flex items-center gap-3"><Link href="/workspace" className="hidden items-center gap-2 text-sm text-[#4b4b48] sm:inline-flex"><Users className="h-4 w-4" />Team</Link><Link href="/settings" className="hidden items-center gap-2 text-sm text-[#4b4b48] sm:inline-flex"><Settings2 className="h-4 w-4" />Settings</Link><UserAccountMenu variant="hub" /></div></div></header><main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><div className="border-b border-[#dededb] pb-7"><p className="text-sm text-[#62625f]">Company workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{activeCompany.name}</h1><p className="mt-2 text-sm text-[#62625f]">Choose a work area for this company.</p></div><section className="mt-7" aria-labelledby="work-areas"><h2 id="work-areas" className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b6b68]">Work areas</h2><div className="mt-3 divide-y divide-[#dededb] border-y border-[#dededb] bg-white">{actions.map(({ label, description, href, icon: Icon }) => <Link key={label} href={href} className="flex items-center gap-4 px-5 py-5 hover:bg-[#f7f7f5]"><span className="grid h-9 w-9 place-items-center border border-[#dededb] bg-[#fafaf9]"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-sm text-[#62625f]">{description}</span></span><ChevronRight className="h-4 w-4 text-[#777773]" /></Link>)}</div></section></main></div>;
}
