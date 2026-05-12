import { useLocation } from "wouter";
import LandingPage from "@toolkit/pages/LandingPage";
import { marketingAuthPath } from "@/lib/authRoutes";

export default function LandingWrapper() {
  const [, navigate] = useLocation();

  return (
    <LandingPage
      onNavigateAuth={() => navigate(marketingAuthPath("login"))}
      onNavigateRegister={() => navigate(marketingAuthPath("register"))}
      onNavigateCertificates={() => navigate("/certificates")}
    />
  );
}
