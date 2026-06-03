import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { esgToolkitHref, setEsgActiveCompany } from "@/lib/esgRoutes";

/** Redirect legacy /esg/create/:companyId[/summary] → unified toolkit. */
export default function EsgToolkitRedirect() {
  const params = useParams<{ companyId?: string }>();
  const [, navigate] = useLocation();

  useEffect(() => {
    const id = params.companyId;
    if (id) setEsgActiveCompany(id);
    navigate(id ? esgToolkitHref(id) : "/esg/clients", { replace: true });
  }, [params.companyId, navigate]);

  return (
    <div className="esg-theme min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--esg-acc-e)]" />
    </div>
  );
}
