import { useLocation } from "wouter";
import ContactPage from "@toolkit/pages/Contact";
import { marketingAuthPath } from "@/lib/authRoutes";

export default function ContactWrapper() {
  const [, navigate] = useLocation();

  return (
    <ContactPage
      onNavigateAuth={() => navigate(marketingAuthPath("login"))}
      onNavigateHome={() => navigate("/")}
      onNavigateAbout={() => navigate("/about")}
      onNavigateProduct={(slug) => navigate(`/products/${slug}`)}
    />
  );
}
