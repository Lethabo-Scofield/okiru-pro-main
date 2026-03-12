import { useLocation } from "wouter";
import LandingPage from "@toolkit/pages/LandingPage";

export default function LandingWrapper() {
  const [, navigate] = useLocation();

  return (
    <LandingPage
      onNavigateAuth={() => navigate("/auth")}
    />
  );
}
