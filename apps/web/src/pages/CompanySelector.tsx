import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { Building2, ChevronRight, Loader2, Plus } from "lucide-react";
import { API_BASE } from "@toolkit/lib/config";
import { useToast } from "@/hooks/use-toast";
import { useActiveCompany, type ActiveCompany } from "@/lib/activeCompany";

export default function CompanySelector() {
  const [, navigate] = useLocation();
  const { companies, loading, selectCompany, refreshCompanies } = useActiveCompany();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const openCompany = (company: ActiveCompany) => { selectCompany(company); navigate("/hub", { replace: true }); };
  const createCompany = async (event: FormEvent) => {
    event.preventDefault(); if (!name.trim() || creating) return; setCreating(true);
    try {
      const response = await fetch(`${API_BASE}/api/clients`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Unable to create company");
      const created = await response.json(); const company = { id: created.clientId || created.id, name: created.name };
      if (!company.id || !company.name) throw new Error("Company response was incomplete"); await refreshCompanies(); openCompany(company);
    } catch (error) { toast({ title: "Company could not be created", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); } finally { setCreating(false); }
  };
  return <main className="min-h-screen bg-[#f8f8f7] px-4 py-10 text-[#171717] sm:px-6"><section className="mx-auto w-full max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b6b68]">Okiru</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Select company</h1><p className="mt-2 text-sm text-[#62625f]">Choose the company you want to work on.</p><form onSubmit={createCompany} className="mt-8 flex gap-2 border-y border-[#dededb] py-5"><label className="sr-only" htmlFor="new-company-name">Company name</label><input id="new-company-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="New company name" className="min-w-0 flex-1 border border-[#cfcfcb] bg-white px-3 py-2 text-sm outline-none focus:border-[#171717]" /><button type="submit" disabled={!name.trim() || creating} className="inline-flex items-center gap-2 bg-[#171717] px-4 py-2 text-sm font-medium text-white disabled:opacity-45">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create company</button></form><div className="mt-6 border border-[#dededb] bg-white"><div className="border-b border-[#dededb] px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#6b6b68]">Available companies</div>{loading ? <div className="flex items-center gap-2 px-5 py-8 text-sm text-[#62625f]"><Loader2 className="h-4 w-4 animate-spin" />Loading companies</div> : companies.length === 0 ? <p className="px-5 py-8 text-sm text-[#62625f]">No companies are available. Create a company to begin.</p> : <div>{companies.map((company) => <button key={company.id} type="button" onClick={() => openCompany(company)} className="flex w-full items-center gap-3 border-b border-[#efefec] px-5 py-4 text-left last:border-b-0 hover:bg-[#f7f7f5]" data-testid={`select-company-${company.id}`}><Building2 className="h-4 w-4 text-[#62625f]" /><span className="flex-1 text-sm font-medium">{company.name}</span><ChevronRight className="h-4 w-4 text-[#777773]" /></button>)}</div>}</div></section></main>;
}
