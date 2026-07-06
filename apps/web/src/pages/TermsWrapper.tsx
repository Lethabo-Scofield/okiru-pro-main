import { useLocation } from "wouter";
import TermsPage from "@toolkit/pages/Terms";
import { marketingAuthPath } from "@/lib/authRoutes";

export default function TermsWrapper() {
  const [, navigate] = useLocation();

  return (
    <TermsPage
      onNavigateAuth={() => navigate(marketingAuthPath("login"))}
      onNavigateHome={() => navigate("/")}
      onNavigateAbout={() => navigate("/about")}
      onNavigateContact={() => navigate("/contact")}
      onNavigateProduct={(slug) => navigate(`/products/${slug}`)}
    />
  );
}
