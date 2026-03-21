import { useLocation } from "wouter";
import AuthPage from "@toolkit/pages/AuthPage";
import { useAuth } from "@toolkit/lib/auth";
import { useEffect } from "react";

export default function AuthWrapper() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  return <AuthPage />;
}
