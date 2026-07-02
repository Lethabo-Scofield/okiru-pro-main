import { useLocation } from "wouter";
import AboutPage from "@toolkit/pages/About";
import { marketingAuthPath } from "@/lib/authRoutes";

export default function AboutWrapper() {
  const [, navigate] = useLocation();

  return (
    <AboutPage
      onNavigateAuth={() => navigate(marketingAuthPath("login"))}
      onNavigateHome={() => navigate("/")}
      onNavigateContact={() => navigate("/contact")}
      onNavigateProduct={(slug) => navigate(`/products/${slug}`)}
    />
  );
}
