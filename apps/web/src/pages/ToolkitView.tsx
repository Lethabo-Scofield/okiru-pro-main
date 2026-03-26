import { useEffect } from "react";
import { useParams } from "wouter";
import { ClientProvider, useActiveClient } from "@toolkit/lib/client-context";
import { AppRoutes } from "@toolkit/App";

function ClientPreloader({ clientId }: { clientId: string }) {
  const { setActiveClientId, activeClientId } = useActiveClient();

  useEffect(() => {
    if (clientId && clientId !== activeClientId) {
      setActiveClientId(clientId);
    }
  }, [clientId, activeClientId, setActiveClientId]);

  return <AppRoutes />;
}

export default function ToolkitView() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId || "";

  return (
    <ClientProvider initialClientId={clientId}>
      <ClientPreloader clientId={clientId} />
    </ClientProvider>
  );
}
