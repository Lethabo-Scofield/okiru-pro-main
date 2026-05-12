import { useMemo } from "react";
import { useSearch } from "wouter";
import Onboarding from "@/pages/Onboarding";

export default function CompanyProfilePage() {
  const search = useSearch();
  const returnTo = useMemo(() => {
    const q = new URLSearchParams(search);
    const r = q.get("returnTo");
    if (r && r.startsWith("/") && !r.startsWith("//")) return r;
    return "/hub";
  }, [search]);

  return <Onboarding mode="edit" returnTo={returnTo} />;
}
