import { useLocation } from "wouter";
import AuthPage from "@toolkit/pages/AuthPage";
import { useAuth } from "@toolkit/lib/auth";
import { useEffect, useMemo } from "react";

export default function AuthWrapper() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const defaultMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "register" ? "register" : "login";
  }, []);

  useEffect(() => {
    if (user) {
      navigate("/hub", { replace: true });
    }
  }, [user, navigate]);

  return <AuthPage defaultMode={defaultMode} />;
}
