import { useState, useEffect, useRef } from "react";
import { Button } from "@toolkit/components/ui/button";
import { Input } from "@toolkit/components/ui/input";
import { Label } from "@toolkit/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@toolkit/components/ui/select";
import { Plus, Building2, Loader2, ImagePlus, Search, LogOut, LayoutGrid, List, ChevronRight } from "lucide-react";
import { useActiveClient } from "@toolkit/lib/client-context";
import { useAuth } from "@toolkit/lib/auth";
import { api } from "@toolkit/lib/api";
import { useToast } from "@toolkit/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@toolkit/components/ui/dialog";
import { cn } from "@toolkit/lib/utils";
import okiruLogo from "@toolkit-assets/Okiru_WHT_Circle_Logo_V1_1772658965196.png";

interface ClientItem {
  id: string;
  name: string;
  financialYear: string;
  industrySector: string | null;
  logo: string | null;
  revenue: number;
  createdAt: string | null;
}

type ViewMode = "grid" | "list";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
};

const listVariant = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const } },
};

function formatRevenue(revenue: number): string {
  if (!revenue) return "";
  if (revenue >= 1_000_000_000) return `R${(revenue / 1_000_000_000).toFixed(1)}B`;
  if (revenue >= 1_000_000) return `R${(revenue / 1_000_000).toFixed(1)}M`;
  if (revenue >= 1_000) return `R${(revenue / 1_000).toFixed(0)}K`;
  return `R${revenue.toFixed(0)}`;
}

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

const softColors = [
  "from-blue-500/20 to-indigo-500/20",
  "from-emerald-500/20 to-teal-500/20",
  "from-amber-500/20 to-orange-500/20",
  "from-violet-500/20 to-purple-500/20",
  "from-rose-500/20 to-pink-500/20",
  "from-cyan-500/20 to-sky-500/20",
];

const avatarColors = [
  "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
];

export default function ClientSelector() {
  const { setActiveClientId } = useActiveClient();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("okiru-client-view") as ViewMode) || "grid"; } catch { return "grid"; }
  });

  const toggleView = (mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem("okiru-client-view", mode); } catch {}
  };

  const [newClient, setNewClient] = useState({
    name: '', financialYear: new Date().getFullYear().toString(),
    industrySector: 'Generic', eapProvince: 'National',
  });

  useEffect(() => {
    api.getClients()
      .then(setClients)
      .catch(() => toast({ title: "Error", description: "Failed to load clients", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newClient.name) {
      toast({ title: "Required", description: "Client name is required", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      let client = await api.createClient(newClient);
      if (logoFile) {
        try {
          client = await api.uploadClientLogo(client.id, logoFile);
        } catch { }
      }
      setClients(prev => [...prev, client]);
      setIsCreateOpen(false);
      setNewClient({ name: '', financialYear: new Date().getFullYear().toString(), industrySector: 'Generic', eapProvince: 'National' });
      setLogoFile(null);
      setLogoPreview(null);
      setActiveClientId(client.id);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Too large", description: "Logo must be under 2MB", variant: "destructive" });
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleLogoUploadForExisting = async (clientId: string, file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Too large", description: "Logo must be under 2MB", variant: "destructive" });
      return;
    }
    try {
      const updated = await api.uploadClientLogo(clientId, file);
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, logo: updated.logo } : c));
      toast({ title: "Logo updated" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const displayName = user?.fullName || user?.username || "Admin";

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={okiruLogo} alt="Okiru" className="h-8 w-8 rounded-full object-contain" data-testid="img-logo-selector" />
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-wider leading-none">OKIRU</span>
              <span className="text-[8px] font-medium text-muted-foreground/40 tracking-widest leading-tight">.PRO</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline" data-testid="text-user-greeting">
              {displayName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground h-8"
              onClick={() => logout()}
              data-testid="btn-logout"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-heading font-bold tracking-tight" data-testid="text-select-client">
                Select a Company
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {loading
                  ? "Loading your companies..."
                  : clients.length === 0
                    ? "Create your first company to get started with B-BBEE compliance."
                    : `Choose a company to view its compliance dashboard.`
                }
              </p>
            </div>

            <div className="flex items-center gap-2">
              {clients.length > 0 && (
                <>
                  <div className="flex items-center border border-border/50 rounded-lg p-0.5 mr-1">
                    <button
                      onClick={() => toggleView("grid")}
                      className={cn(
                        "h-7 w-7 rounded-md flex items-center justify-center transition-colors",
                        viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="btn-view-grid"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleView("list")}
                      className={cn(
                        "h-7 w-7 rounded-md flex items-center justify-center transition-colors",
                        viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid="btn-view-list"
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                    <Input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search companies..."
                      className="pl-9 h-9 w-52 text-sm"
                      data-testid="input-search-clients"
                    />
                  </div>
                </>
              )}

              <Dialog open={isCreateOpen} onOpenChange={(open) => {
                setIsCreateOpen(open);
                if (!open) { setLogoFile(null); setLogoPreview(null); }
              }}>
                <DialogTrigger asChild>
                  <Button className="gap-2 rounded-full h-9 px-5 text-sm" data-testid="btn-create-client">
                    <Plus className="h-3.5 w-3.5" />
                    New Company
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>New Company</DialogTitle>
                    <DialogDescription>
                      Set up a new company for B-BBEE compliance tracking.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="h-20 w-20 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 flex items-center justify-center overflow-hidden transition-colors group"
                        data-testid="btn-upload-logo-create"
                      >
                        {logoPreview ? (
                          <img src={logoPreview} alt="Logo" className="h-full w-full object-cover" />
                        ) : (
                          <div className="text-center">
                            <ImagePlus className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary/60 mx-auto transition-colors" />
                            <span className="text-[9px] text-muted-foreground/40 mt-1 block">Logo</span>
                          </div>
                        )}
                      </button>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Company Name</Label>
                      <Input
                        value={newClient.name}
                        onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                        placeholder="e.g. Acme Corporation SA"
                        className="h-10"
                        data-testid="input-client-name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Financial Year</Label>
                        <Input
                          value={newClient.financialYear}
                          onChange={e => setNewClient({ ...newClient, financialYear: e.target.value })}
                          placeholder="2024"
                          className="h-10"
                          data-testid="input-client-fy"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Industry Sector</Label>
                        <Select value={newClient.industrySector} onValueChange={v => setNewClient({ ...newClient, industrySector: v })}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Generic">Generic</SelectItem>
                            <SelectItem value="ICT">ICT</SelectItem>
                            <SelectItem value="Construction">Construction</SelectItem>
                            <SelectItem value="Financial">Financial</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">EAP Province</Label>
                      <Select value={newClient.eapProvince} onValueChange={v => setNewClient({ ...newClient, eapProvince: v })}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="National">National</SelectItem>
                          <SelectItem value="Gauteng">Gauteng</SelectItem>
                          <SelectItem value="Western Cape">Western Cape</SelectItem>
                          <SelectItem value="KZN">KwaZulu-Natal</SelectItem>
                          <SelectItem value="Eastern Cape">Eastern Cape</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreate} disabled={creating} className="rounded-full px-6" data-testid="btn-confirm-create">
                      {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Create Company
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : clients.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 space-y-5"
          >
            <div className="h-20 w-20 rounded-3xl bg-muted flex items-center justify-center">
              <Building2 className="h-9 w-9 text-muted-foreground/40" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-semibold">No companies yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Create your first company to start tracking B-BBEE compliance.
              </p>
            </div>
          </motion.div>
        ) : filteredClients.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">No companies match "{search}"</p>
          </div>
        ) : viewMode === "grid" ? (
          <motion.div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={container}
            initial="hidden"
            animate="show"
            key="grid"
          >
            <AnimatePresence>
              {filteredClients.map((client, idx) => (
                <motion.div
                  key={client.id}
                  variants={cardVariant}
                  layout
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group relative rounded-2xl border border-border/50 bg-card hover:border-border hover:shadow-md transition-all cursor-pointer overflow-hidden"
                  onClick={() => setActiveClientId(client.id)}
                  data-testid={`card-client-${client.id}`}
                >
                  <div className={`h-20 bg-gradient-to-br ${softColors[idx % softColors.length]} flex items-center justify-center relative`}>
                    {client.logo ? (
                      <img src={client.logo} alt={client.name} className="h-12 w-12 rounded-xl object-cover shadow-sm bg-white" />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-white/80 dark:bg-white/10 backdrop-blur flex items-center justify-center shadow-sm">
                        <span className="text-sm font-bold text-foreground/60">{getInitials(client.name)}</span>
                      </div>
                    )}

                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <label
                        className="h-7 w-7 rounded-lg bg-white/80 dark:bg-black/50 backdrop-blur flex items-center justify-center cursor-pointer hover:bg-white dark:hover:bg-black/70 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`btn-upload-logo-${client.id}`}
                      >
                        <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleLogoUploadForExisting(client.id, f);
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <h3 className="font-semibold text-sm leading-tight truncate">{client.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        FY {client.financialYear}
                      </span>
                      {client.industrySector && (
                        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {client.industrySector}
                        </span>
                      )}
                      {client.revenue > 0 && (
                        <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {formatRevenue(client.revenue)}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            className="rounded-xl border border-border/50 bg-card overflow-hidden divide-y divide-border/30"
            variants={container}
            initial="hidden"
            animate="show"
            key="list"
          >
            <AnimatePresence>
              {filteredClients.map((client, idx) => (
                <motion.div
                  key={client.id}
                  variants={listVariant}
                  layout
                  exit={{ opacity: 0, x: -8 }}
                  className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setActiveClientId(client.id)}
                  data-testid={`card-client-${client.id}`}
                >
                  <div className="shrink-0">
                    {client.logo ? (
                      <img src={client.logo} alt={client.name} className="h-10 w-10 rounded-xl object-cover bg-white" />
                    ) : (
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", avatarColors[idx % avatarColors.length])}>
                        <span className="text-xs font-bold">{getInitials(client.name)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{client.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">FY {client.financialYear}</span>
                      {client.industrySector && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-[11px] text-muted-foreground">{client.industrySector}</span>
                        </>
                      )}
                      {client.revenue > 0 && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-[11px] text-muted-foreground">{formatRevenue(client.revenue)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <label
                      className="h-7 w-7 rounded-lg flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`btn-upload-logo-${client.id}`}
                    >
                      <ImagePlus className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleLogoUploadForExisting(client.id, f);
                        }}
                      />
                    </label>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {!loading && clients.length > 0 && (
          <p className="text-center text-xs text-muted-foreground/40 pt-4">
            {clients.length} {clients.length === 1 ? 'company' : 'companies'} in your workspace
          </p>
        )}
      </div>
    </div>
  );
}
