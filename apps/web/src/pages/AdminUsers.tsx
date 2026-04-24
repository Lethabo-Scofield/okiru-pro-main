import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@toolkit/lib/auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@toolkit/lib/queryClient";
import { Card, CardContent } from "@toolkit/components/ui/card";
import { Button } from "@toolkit/components/ui/button";
import { Badge } from "@toolkit/components/ui/badge";
import { Input } from "@toolkit/components/ui/input";
import { useToast } from "@toolkit/hooks/use-toast";
import {
  ArrowLeft,
  Users,
  Shield,
  ShieldCheck,
  ShieldOff,
  Search,
  Mail,
  Clock,
  Building2,
  Loader2,
} from "lucide-react";

interface AdminUser {
  id: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  organizationId: string | null;
  organizationName: string | null;
  isVerified: boolean;
  twofaEnabled: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: user?.role === "admin",
  });

  const toggle2FAMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/2fa`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Updated", description: "User 2FA setting has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2" data-testid="text-access-denied">Access Denied</h2>
            <p className="text-sm text-muted-foreground mb-4">You need administrator privileges to view this page.</p>
            <Button onClick={() => navigate("/hub")} data-testid="btn-go-hub">Go to Hub</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filtered = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.fullName?.toLowerCase().includes(q)) ||
      (u.email?.toLowerCase().includes(q)) ||
      (u.organizationName?.toLowerCase().includes(q))
    );
  });

  const stats = {
    total: users.length,
    twoFAEnabled: users.filter((u) => u.twofaEnabled).length,
    admins: users.filter((u) => u.role === "admin").length,
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Never";
    return new Date(d).toLocaleString("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/hub")}
            className="shrink-0"
            data-testid="btn-back-hub"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-title">User Management</h1>
            <p className="text-sm text-muted-foreground">View and manage all registered users</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-total-users">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-2fa-users">{stats.twoFAEnabled}</p>
                <p className="text-xs text-muted-foreground">2FA Enabled</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-admins">{stats.admins}</p>
                <p className="text-xs text-muted-foreground">Administrators</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or organization..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10"
              data-testid="input-search-users"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((u) => (
              <Card key={u.id} className="overflow-hidden" data-testid={`card-user-${u.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm truncate" data-testid={`text-username-${u.id}`}>
                          {u.fullName || u.username}
                        </span>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-[10px] shrink-0" data-testid={`badge-role-${u.id}`}>
                          {u.role || "user"}
                        </Badge>
                        {u.twofaEnabled ? (
                          <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30 shrink-0" data-testid={`badge-2fa-${u.id}`}>
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            2FA
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground/50 shrink-0" data-testid={`badge-no-2fa-${u.id}`}>
                            <ShieldOff className="h-3 w-3 mr-1" />
                            No 2FA
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                        {u.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {u.email}
                          </span>
                        )}
                        {u.organizationName && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {u.organizationName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Last login: {formatDate(u.lastLogin)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Button
                        variant={u.twofaEnabled ? "destructive" : "outline"}
                        size="sm"
                        className="text-[11px] h-8"
                        disabled={toggle2FAMutation.isPending}
                        onClick={() => toggle2FAMutation.mutate({ userId: u.id, enabled: !u.twofaEnabled })}
                        data-testid={`btn-toggle-2fa-${u.id}`}
                      >
                        {u.twofaEnabled ? (
                          <><ShieldOff className="h-3 w-3 mr-1" /> Disable 2FA</>
                        ) : (
                          <><ShieldCheck className="h-3 w-3 mr-1" /> Enable 2FA</>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground" data-testid="text-no-users">
                {searchQuery ? "No users match your search." : "No users found."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
