import { Suspense } from "react";
import { EsgToolkitShell } from "../../EsgToolkit/src/pages/EsgToolkitShell";
import "@/styles/esg-glass.css";

export default function EsgToolkitView() {
  return (
    <Suspense
      fallback={
        <div className="esg-theme min-h-screen flex items-center justify-center">
          <div className="h-10 w-10 border-2 border-[var(--esg-acc-e)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <EsgToolkitShell />
    </Suspense>
  );
}
