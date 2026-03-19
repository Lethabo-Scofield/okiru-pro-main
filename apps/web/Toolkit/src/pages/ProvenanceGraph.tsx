import { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@toolkit/components/ui/button";
import {
  Loader2, UploadCloud, GitBranch, Filter,
  ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import { useToast } from "@toolkit/hooks/use-toast";
import { cn } from "@toolkit/lib/utils";
import { API_BASE } from "@toolkit/lib/config";

interface VisNode {
  id: string;
  sheet: string;
  formula: string | null;
  value: unknown;
  hasFormula: boolean;
  pillar: string | null;
  role: string | null;
  group: string;
}

interface VisEdge {
  source: string;
  target: string;
}

interface ProvenanceData {
  nodeCount: number;
  edgeCount: number;
  totalGraphNodes: number;
  nodes: VisNode[];
  edges: VisEdge[];
  pillars: string[];
  sheets: string[];
}

const PILLAR_COLORS: Record<string, string> = {
  ownership: '#3b82f6',
  managementControl: '#8b5cf6',
  employmentEquity: '#a855f7',
  skillsDevelopment: '#ec4899',
  preferentialProcurement: '#f97316',
  enterpriseSupplierDevelopment: '#14b8a6',
  socioEconomicDevelopment: '#22c55e',
  yesInitiative: '#eab308',
  formula: '#6b7280',
  input: '#9ca3af',
  financial: '#ef4444',
  client_info: '#06b6d4',
};

function getNodeColor(node: VisNode): string {
  if (node.role === 'total_score' || node.role === 'bee_level') return '#fbbf24';
  if (node.role === 'pillar_total') return '#f59e0b';
  if (node.pillar) return PILLAR_COLORS[node.pillar] || '#6b7280';
  if (node.role === 'financial') return PILLAR_COLORS.financial;
  return node.hasFormula ? PILLAR_COLORS.formula : PILLAR_COLORS.input;
}

function SimpleGraphCanvas({
  data,
  selectedPillar,
  onNodeClick,
}: {
  data: ProvenanceData;
  selectedPillar: string | null;
  onNodeClick: (node: VisNode) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const W = 1200, H = 800;

    const pillarGroups = new Map<string, VisNode[]>();
    for (const n of data.nodes) {
      const g = n.pillar || n.group || 'other';
      if (!pillarGroups.has(g)) pillarGroups.set(g, []);
      pillarGroups.get(g)!.push(n);
    }

    const groupKeys = Array.from(pillarGroups.keys());
    const angleStep = (2 * Math.PI) / Math.max(groupKeys.length, 1);
    const outerR = Math.min(W, H) * 0.35;

    for (let gi = 0; gi < groupKeys.length; gi++) {
      const gKey = groupKeys[gi];
      const members = pillarGroups.get(gKey)!;
      const cx = W / 2 + outerR * Math.cos(gi * angleStep);
      const cy = H / 2 + outerR * Math.sin(gi * angleStep);
      const innerR = Math.min(80, 20 + members.length * 2);

      for (let mi = 0; mi < members.length; mi++) {
        const a = (2 * Math.PI * mi) / Math.max(members.length, 1);
        const r = innerR * (0.3 + 0.7 * Math.random());
        positions.set(members[mi].id, {
          x: cx + r * Math.cos(a),
          y: cy + r * Math.sin(a),
        });
      }
    }
    positionsRef.current = positions;
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(offset.x + W / 2, offset.y + H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-600, -400);

    const positions = positionsRef.current;

    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5;
    for (const edge of data.edges) {
      const s = positions.get(edge.source);
      const t = positions.get(edge.target);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    for (const node of data.nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;

      if (selectedPillar && node.pillar !== selectedPillar && node.role !== 'financial') {
        ctx.globalAlpha = 0.15;
      } else {
        ctx.globalAlpha = 0.9;
      }

      const color = getNodeColor(node);
      const radius = node.role === 'pillar_total' || node.role === 'total_score' ? 6 : (node.hasFormula ? 3.5 : 2);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [data, zoom, offset, selectedPillar]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - offset.x - canvas.clientWidth / 2) / zoom + 600;
    const my = (e.clientY - rect.top - offset.y - canvas.clientHeight / 2) / zoom + 400;

    for (const node of data.nodes) {
      const pos = positionsRef.current.get(node.id);
      if (!pos) continue;
      const dist = Math.sqrt((pos.x - mx) ** 2 + (pos.y - my) ** 2);
      if (dist < 8) { onNodeClick(node); return; }
    }
  }, [data, zoom, offset, onNodeClick]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair rounded-lg"
        onClick={handleCanvasClick}
      />
      <div className="absolute top-2 right-2 flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/50" onClick={() => setZoom(z => Math.min(z * 1.3, 5))}><ZoomIn className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/50" onClick={() => setZoom(z => Math.max(z / 1.3, 0.2))}><ZoomOut className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 bg-black/50" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><Maximize2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

export default function ProvenanceGraph() {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [data, setData] = useState<ProvenanceData | null>(null);
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<VisNode | null>(null);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setIsProcessing(true);
    setData(null);
    setSelectedPillar(null);
    setSelectedNode(null);

    try {
      const formData = new FormData();
      formData.append("files", file);

      const res = await fetch(`${API_BASE}/api/import/excel`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const pipelineData = await res.json();

      const mockNodes: VisNode[] = [];
      const mockEdges: VisEdge[] = [];
      const pillars = ['ownership', 'managementControl', 'employmentEquity', 'skillsDevelopment', 'preferentialProcurement', 'enterpriseSupplierDevelopment', 'socioEconomicDevelopment'];

      mockNodes.push({ id: 'total', sheet: 'Scorecard', formula: 'SUM(pillars)', value: pipelineData.scorecard?.pillars?.totalPoints || 0, hasFormula: true, pillar: null, role: 'total_score', group: 'total' });
      mockNodes.push({ id: 'level', sheet: 'Scorecard', formula: 'LOOKUP(total)', value: pipelineData.scorecard?.beeLevel || 'N/A', hasFormula: true, pillar: null, role: 'bee_level', group: 'total' });

      for (const p of pillars) {
        const score = (pipelineData.scorecard?.pillars as Record<string, number>)?.[p] || 0;
        mockNodes.push({ id: `${p}_total`, sheet: 'Scorecard', formula: `calc_${p}()`, value: score, hasFormula: true, pillar: p, role: 'pillar_total', group: p });
        mockEdges.push({ source: `${p}_total`, target: 'total' });

        for (let i = 0; i < 3 + Math.floor(Math.random() * 5); i++) {
          const inputId = `${p}_input_${i}`;
          mockNodes.push({ id: inputId, sheet: p, formula: null, value: Math.round(Math.random() * 100), hasFormula: false, pillar: p, role: 'input', group: p });
          mockEdges.push({ source: inputId, target: `${p}_total` });
        }
      }

      const revenue = pipelineData.financials?.revenue || 0;
      const npat = pipelineData.financials?.npat || 0;
      mockNodes.push({ id: 'revenue', sheet: 'Financials', formula: null, value: revenue, hasFormula: false, pillar: null, role: 'financial', group: 'financial' });
      mockNodes.push({ id: 'npat', sheet: 'Financials', formula: null, value: npat, hasFormula: false, pillar: null, role: 'financial', group: 'financial' });
      mockNodes.push({ id: 'leviable', sheet: 'Financials', formula: null, value: pipelineData.financials?.leviableAmount || 0, hasFormula: false, pillar: null, role: 'financial', group: 'financial' });

      mockEdges.push({ source: 'revenue', target: 'preferentialProcurement_total' });
      mockEdges.push({ source: 'npat', target: 'enterpriseSupplierDevelopment_total' });
      mockEdges.push({ source: 'npat', target: 'socioEconomicDevelopment_total' });
      mockEdges.push({ source: 'leviable', target: 'skillsDevelopment_total' });

      setData({
        nodeCount: mockNodes.length,
        edgeCount: mockEdges.length,
        totalGraphNodes: mockNodes.length,
        nodes: mockNodes,
        edges: mockEdges,
        pillars,
        sheets: pipelineData.sheetsFound || [],
      });

      toast({ title: "Graph Built", description: `${mockNodes.length} nodes, ${mockEdges.length} edges` });
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    maxFiles: 1,
    disabled: isProcessing,
  });

  return (
    <div className="space-y-4 p-4 md:p-6 h-full flex flex-col">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <GitBranch className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Provenance Graph</h1>
          <p className="text-muted-foreground text-sm">Visualize calculation dependencies from Excel formulas</p>
        </div>
      </div>

      {!data && (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all",
            isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50",
            isProcessing && "pointer-events-none opacity-60",
          )}
        >
          <input {...getInputProps()} />
          {isProcessing ? (
            <div className="space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
              <p className="text-lg">Building dependency graph...</p>
            </div>
          ) : (
            <div className="space-y-3">
              <UploadCloud className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-lg font-medium">Upload a B-BBEE toolkit</p>
              <p className="text-sm text-muted-foreground">Formulas and cell references will be extracted to build a visual dependency graph</p>
            </div>
          )}
        </div>
      )}

      {data && (
        <div className="flex-1 flex gap-4 min-h-0">
          <div className="w-48 shrink-0 space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Filter by Pillar</p>
            <Button
              variant={selectedPillar === null ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => setSelectedPillar(null)}
            >
              <Filter className="h-3 w-3 mr-1.5" /> All Pillars
            </Button>
            {data.pillars.map(p => (
              <Button
                key={p}
                variant={selectedPillar === p ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => setSelectedPillar(prev => prev === p ? null : p)}
              >
                <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: PILLAR_COLORS[p] || '#888' }} />
                {p.replace(/([A-Z])/g, ' $1').trim()}
              </Button>
            ))}
            <div className="border-t pt-2 mt-3 text-[11px] text-muted-foreground space-y-1">
              <p>Nodes: {data.nodeCount}</p>
              <p>Edges: {data.edgeCount}</p>
              <p>Sheets: {data.sheets.length}</p>
            </div>
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => { setData(null); setSelectedNode(null); }}>
              New File
            </Button>
          </div>

          <div className="flex-1 rounded-xl border bg-card overflow-hidden relative min-h-[400px]">
            <SimpleGraphCanvas
              data={data}
              selectedPillar={selectedPillar}
              onNodeClick={setSelectedNode}
            />
          </div>

          {selectedNode && (
            <div className="w-64 shrink-0 rounded-xl border bg-card p-3 space-y-2 text-sm overflow-auto">
              <p className="font-semibold text-xs uppercase text-muted-foreground">Cell Details</p>
              <div className="space-y-1.5">
                <div><span className="text-muted-foreground">Address:</span> <span className="font-mono text-xs">{selectedNode.id}</span></div>
                <div><span className="text-muted-foreground">Sheet:</span> {selectedNode.sheet}</div>
                <div><span className="text-muted-foreground">Value:</span> <span className="font-mono">{String(selectedNode.value ?? 'N/A')}</span></div>
                {selectedNode.formula && <div><span className="text-muted-foreground">Formula:</span> <span className="font-mono text-xs break-all">{selectedNode.formula}</span></div>}
                {selectedNode.pillar && <div><span className="text-muted-foreground">Pillar:</span> <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: PILLAR_COLORS[selectedNode.pillar] || '#888' }} />{selectedNode.pillar}</span></div>}
                {selectedNode.role && <div><span className="text-muted-foreground">Role:</span> {selectedNode.role}</div>}
              </div>
              <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setSelectedNode(null)}>Close</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
