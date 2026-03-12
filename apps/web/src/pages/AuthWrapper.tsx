import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@toolkit/lib/auth";
import { AppLoader } from "@toolkit/components/Loader";
import AuthPage from "@toolkit/pages/AuthPage";

export default function AuthWrapper() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/dashboard");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return <AppLoader />;
  }

  if (user) {
    return <AppLoader />;
  }

  return <AuthPage />;
}
