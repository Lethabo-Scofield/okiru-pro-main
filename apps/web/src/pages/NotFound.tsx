import { useAuth } from "@toolkit/lib/auth";

export default function NotFound() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="h-10 w-10 border-2 border-[#636366] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const destination = user ? "/dashboard" : "/";
  const label = user ? "Go to Dashboard" : "Go to Home";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-4xl font-bold text-foreground" data-testid="text-404">404</p>
        <p className="text-muted-foreground">This page doesn't exist.</p>
        <a
          href={destination}
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          data-testid="link-404-home"
        >
          {label}
        </a>
      </div>
    </div>
  );
}
