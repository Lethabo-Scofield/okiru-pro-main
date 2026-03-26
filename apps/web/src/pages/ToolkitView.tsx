import { useParams } from "wouter";
import ToolkitApp from "@toolkit/App";

export default function ToolkitView() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId || "";

  if (clientId) {
    localStorage.setItem("okiru-pro-active-client", clientId);
  }

  return <ToolkitApp />;
}
