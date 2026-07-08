import { useLocation } from "wouter";
import PrivacyPage from "@toolkit/pages/Privacy";
import { marketingAuthPath } from "@/lib/authRoutes";

export default function PrivacyWrapper() {
  const [, navigate] = useLocation();

  return (
    <PrivacyPage
      onNavigateAuth={() => navigate(marketingAuthPath("login"))}
      onNavigateHome={() => navigate("/")}
      onNavigateAbout={() => navigate("/about")}
      onNavigateContact={() => navigate("/contact")}
      onNavigateProduct={(slug) => navigate(`/products/${slug}`)}
    />
  );
}
