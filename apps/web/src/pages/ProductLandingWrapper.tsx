import { useParams, useLocation } from "wouter";
import ProductLandingPage from "@toolkit/pages/ProductLandingPage";
import { getProduct } from "@toolkit/pages/productLandingConfig";
import { marketingAuthPath } from "@/lib/authRoutes";
import NotFound from "@/pages/NotFound";

export default function ProductLandingWrapper() {
  const params = useParams();
  const [, navigate] = useLocation();
  const product = getProduct(params.slug);

  if (!product) return <NotFound />;

  return (
    <ProductLandingPage
      product={product}
      onNavigateHome={() => navigate("/")}
      onNavigateAuth={() => navigate(marketingAuthPath("login"))}
      onNavigateRegister={() => navigate(marketingAuthPath("register"))}
      onNavigateProduct={(slug) => navigate(`/products/${slug}`)}
      onNavigateCertificates={() => navigate("/certificates")}
      onNavigateAbout={() => navigate("/about")}
      onNavigateContact={() => navigate("/contact")}
    />
  );
}
