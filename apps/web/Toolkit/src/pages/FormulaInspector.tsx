import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@toolkit/lib/config";

interface CellNode {
  address: string;
  sheet: string;
  column: string;
  row: number;
  formula: string | null;
  value: unknown;
  dependsOn: string[];
  semanticTag: Record<string, string> | null;
  graphId?: string;
}

interface GraphMeta {
  _key: string;
  scorecardType: string;
  sectorCode: string;
  sourceFile: string;
  nodeCount: number;
  edgeCount: number;
  formulaCount: number;
  inputCount: number;
  sheets: string[];
  createdAt: string;
  computeModelId?: string;
}

interface PillarStructure {
  name: string;
  code: string;
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;
  indicators: Array<{
    name: string;
    code: string;
    maxPoints: number;
    targets: Array<{
      targetValue: number;
      targetUnit: string;
      targetBase: string;
      weighting: number;
    }>;
  }>;
}

interface ComparisonResult {
  address: string;
  sheet: string;
  storedValue: unknown;
  truthValue: unknown;
  formula: string | null;
  match: boolean;
  delta: number | null;
  semanticTag: Record<string, string> | null;
}

type Tab = "templates" | "cells" | "structure" | "graph" | "accuracy";

const PILLAR_COLORS: Record<string, string> = {
  ownership: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  managementControl: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  employmentEquity: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  skillsDevelopment: "bg-green-500/20 text-green-400 border-green-500/30",
  preferentialProcurement: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  enterpriseSupplierDevelopment: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  socioEconomicDevelopment: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  yesInitiative: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

export default function FormulaInspector() {
  const [tab, setTab] = useState<Tab>("templates");
  const [templates, setTemplates] = useState<GraphMeta[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [cells, setCells] = useState<CellNode[]>([]);
  const [structure, setStructure] = useState<{ pillars: PillarStructure[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<CellNode | null>(null);
  const [traceResult, setTraceResult] = useState<unknown>(null);
  const [sheetFilter, setSheetFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [comparisonResult, setComparisonResult] = useState<{
    accuracy: number;
    matches: number;
    mismatches: number;
    details: ComparisonResult[];
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/templates`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      setTemplates(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const loadCells = useCallback(async (graphKey: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/templates/${graphKey}/cells`);
      if (!res.ok) throw new Error("Failed to load cells");
      const data = await res.json();
      setCells(data.cells || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load cells");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStructure = useCallback(async (graphKey: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/templates/${graphKey}/structure`);
      if (!res.ok) throw new Error("Failed to load structure");
      const data = await res.json();
      setStructure(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load structure");
    } finally {
      setLoading(false);
    }
  }, []);

  const traceCell = useCallback(async (graphKey: string, cellAddr: string, direction: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/templates/${graphKey}/trace/${encodeURIComponent(cellAddr)}?direction=${direction}`);
      if (!res.ok) throw new Error("Trace failed");
      const data = await res.json();
      setTraceResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Trace failed");
    }
  }, []);

  const selectTemplate = useCallback((key: string) => {
    setSelectedTemplate(key);
    setTab("cells");
    loadCells(key);
    loadStructure(key);
  }, [loadCells, loadStructure]);

  const handleIngest = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/templates/ingest`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Ingestion failed");
      }
      await fetchTemplates();
      form.reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ingestion failed");
    } finally {
      setUploading(false);
    }
  }, [fetchTemplates]);

  const handleCompare = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/templates/${selectedTemplate}/compare`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Comparison failed");
      const data = await res.json();
      setComparisonResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setUploading(false);
    }
  }, [selectedTemplate]);

  const sheets = [...new Set(cells.map(c => c.sheet))];
  const tags = [...new Set(cells.map(c =>
    c.semanticTag ? (c.semanticTag.pillar || c.semanticTag.role || "tagged") : "untagged"
  ))];

  const filteredCells = cells.filter(c => {
    if (sheetFilter !== "all" && c.sheet !== sheetFilter) return false;
    if (tagFilter !== "all") {
      if (tagFilter === "untagged" && c.semanticTag) return false;
      if (tagFilter === "formula" && !c.formula) return false;
      if (tagFilter !== "untagged" && tagFilter !== "formula") {
        const p = c.semanticTag?.pillar || c.semanticTag?.role || "";
        if (p !== tagFilter) return false;
      }
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      return c.address.toLowerCase().includes(lower) ||
        (c.formula || "").toLowerCase().includes(lower) ||
        String(c.value).toLowerCase().includes(lower);
    }
    return true;
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Formula Inspector</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dev/Expert view -- inspect ArangoDB formula graphs, cell dependencies, and accuracy
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-4 underline text-sm">dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        {(["templates", "cells", "structure", "graph", "accuracy"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Templates Tab */}
      {tab === "templates" && (
        <div className="space-y-6">
          {/* Upload */}
          <div className="border border-border rounded-lg p-6 bg-card">
            <h2 className="font-semibold mb-4">Ingest Toolkit Excel</h2>
            <form onSubmit={handleIngest} className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Excel File</label>
                <input type="file" name="file" accept=".xlsx,.xls" required
                  className="block text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:font-medium hover:file:bg-primary/90" />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Sector</label>
                <select name="sectorCode" className="bg-muted border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">Auto-detect</option>
                  <option value="RCOGP">RCOGP (Generic)</option>
                  <option value="ICT">ICT</option>
                  <option value="FSC">FSC</option>
                  <option value="AGRI">Agri</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Type</label>
                <select name="scorecardType" className="bg-muted border border-border rounded-md px-3 py-2 text-sm">
                  <option value="">Auto-detect</option>
                  <option value="Generic">Generic</option>
                  <option value="QSE">QSE</option>
                  <option value="EME">EME</option>
                </select>
              </div>
              <button type="submit" disabled={uploading}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50">
                {uploading ? "Ingesting..." : "Ingest"}
              </button>
            </form>
          </div>

          {/* Template List */}
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Source File</th>
                  <th className="text-left px-4 py-3 font-medium">Sector</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-right px-4 py-3 font-medium">Nodes</th>
                  <th className="text-right px-4 py-3 font-medium">Edges</th>
                  <th className="text-right px-4 py-3 font-medium">Formulas</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t._key} className="border-t border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => selectTemplate(t._key)}>
                    <td className="px-4 py-3 font-mono text-xs">{t.sourceFile}</td>
                    <td className="px-4 py-3">{t.sectorCode}</td>
                    <td className="px-4 py-3">{t.scorecardType}</td>
                    <td className="px-4 py-3 text-right">{t.nodeCount}</td>
                    <td className="px-4 py-3 text-right">{t.edgeCount}</td>
                    <td className="px-4 py-3 text-right">{t.formulaCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-primary text-xs">Inspect →</span>
                    </td>
                  </tr>
                ))}
                {templates.length === 0 && !loading && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No templates ingested yet. Upload a toolkit Excel above.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cells Tab */}
      {tab === "cells" && selectedTemplate && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <select value={sheetFilter} onChange={e => setSheetFilter(e.target.value)}
              className="bg-muted border border-border rounded-md px-3 py-2 text-sm">
              <option value="all">All Sheets ({sheets.length})</option>
              {sheets.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}
              className="bg-muted border border-border rounded-md px-3 py-2 text-sm">
              <option value="all">All Tags</option>
              <option value="formula">Has Formula</option>
              <option value="untagged">Untagged</option>
              {tags.filter(t => t !== "tagged" && t !== "untagged").map(t =>
                <option key={t} value={t}>{t}</option>
              )}
            </select>
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search cells..."
              className="bg-muted border border-border rounded-md px-3 py-2 text-sm w-60" />
            <span className="text-xs text-muted-foreground ml-auto">
              {filteredCells.length} / {cells.length} cells
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Cell List */}
            <div className="lg:col-span-2 border border-border rounded-lg overflow-auto max-h-[70vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Address</th>
                    <th className="text-left px-3 py-2 font-medium">Value</th>
                    <th className="text-left px-3 py-2 font-medium">Formula</th>
                    <th className="text-left px-3 py-2 font-medium">Tag</th>
                    <th className="text-right px-3 py-2 font-medium">Deps</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCells.slice(0, 500).map(c => {
                    const pillar = c.semanticTag?.pillar || "";
                    const colorClass = PILLAR_COLORS[pillar] || "";
                    return (
                      <tr key={c.address}
                        className={`border-t border-border/50 cursor-pointer transition-colors
                          ${selectedCell?.address === c.address ? "bg-primary/10" : "hover:bg-muted/30"}
                          ${c.formula && !c.semanticTag ? "bg-yellow-500/5" : ""}`}
                        onClick={() => setSelectedCell(c)}>
                        <td className="px-3 py-1.5 font-mono whitespace-nowrap">{c.address}</td>
                        <td className="px-3 py-1.5 max-w-[200px] truncate">
                          {typeof c.value === "number" ? c.value.toFixed(4) : String(c.value ?? "")}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-green-400 max-w-[300px] truncate">
                          {c.formula ? `=${c.formula}` : ""}
                        </td>
                        <td className="px-3 py-1.5">
                          {c.semanticTag && (
                            <span className={`px-2 py-0.5 rounded text-[10px] border ${colorClass || "bg-muted"}`}>
                              {c.semanticTag.pillar || ""} {c.semanticTag.role || ""}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{c.dependsOn.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredCells.length > 500 && (
                <div className="px-4 py-2 text-xs text-muted-foreground text-center bg-muted/30">
                  Showing 500 / {filteredCells.length} cells. Use filters to narrow.
                </div>
              )}
            </div>

            {/* Cell Detail Panel */}
            <div className="border border-border rounded-lg p-4 space-y-4 bg-card">
              <h3 className="font-semibold text-sm">Cell Detail</h3>
              {selectedCell ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Address:</span>{" "}
                    <span className="font-mono font-bold">{selectedCell.address}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sheet:</span> {selectedCell.sheet}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Value:</span>{" "}
                    <span className="font-mono">{JSON.stringify(selectedCell.value)}</span>
                  </div>
                  {selectedCell.formula && (
                    <div>
                      <span className="text-muted-foreground">Formula:</span>
                      <pre className="mt-1 p-2 bg-muted rounded text-green-400 font-mono text-[11px] overflow-auto">
                        ={selectedCell.formula}
                      </pre>
                    </div>
                  )}
                  {selectedCell.semanticTag && (
                    <div>
                      <span className="text-muted-foreground">Semantic Tag:</span>
                      <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-auto">
                        {JSON.stringify(selectedCell.semanticTag, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedCell.dependsOn.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">
                        Depends on ({selectedCell.dependsOn.length}):
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selectedCell.dependsOn.map(d => (
                          <button key={d}
                            onClick={() => {
                              const target = cells.find(c => c.address === d);
                              if (target) setSelectedCell(target);
                            }}
                            className="px-2 py-0.5 bg-muted rounded font-mono text-[10px] hover:bg-primary/20 transition-colors">
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => traceCell(selectedTemplate!, selectedCell.address, "backward")}
                      className="px-3 py-1.5 bg-muted rounded text-[11px] hover:bg-primary/20 transition-colors">
                      ← Trace Backward
                    </button>
                    <button onClick={() => traceCell(selectedTemplate!, selectedCell.address, "forward")}
                      className="px-3 py-1.5 bg-muted rounded text-[11px] hover:bg-primary/20 transition-colors">
                      Trace Forward →
                    </button>
                  </div>
                  {traceResult && (
                    <div>
                      <span className="text-muted-foreground">Trace Result:</span>
                      <pre className="mt-1 p-2 bg-muted rounded text-[11px] overflow-auto max-h-[200px]">
                        {JSON.stringify(traceResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">Click a cell to inspect it.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Structure Tab */}
      {tab === "structure" && structure && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Extracted Scorecard Structure</h2>
          <p className="text-sm text-muted-foreground">
            All pillars, indicators, and targets below were extracted from the Excel file.
            No hardcoded values.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {structure.pillars.map((p: PillarStructure) => {
              const colorClass = PILLAR_COLORS[p.code] || "bg-muted";
              return (
                <div key={p.code} className={`border rounded-lg p-4 space-y-3 ${colorClass.split(" ")[0]}/5 border-${colorClass.split(" ")[2]?.replace("border-", "") || "border"}`}>
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-sm">{p.name}</h3>
                    <span className="text-lg font-bold">{p.maxPoints}pts</span>
                  </div>
                  {p.hasSubMinimum && (
                    <span className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 rounded">
                      Sub-minimum: {(p.subMinimumThreshold * 100).toFixed(0)}%
                    </span>
                  )}
                  <div className="space-y-1">
                    {p.indicators.map(i => (
                      <div key={i.code} className="flex justify-between items-center text-xs py-1 border-t border-border/30">
                        <span className="truncate max-w-[60%]">{i.name}</span>
                        <div className="flex gap-2 text-muted-foreground">
                          {i.targets?.[0] && (
                            <span>
                              target: {(i.targets[0].targetValue * (i.targets[0].targetUnit === "percentage" && i.targets[0].targetValue <= 1 ? 100 : 1)).toFixed(1)}%
                            </span>
                          )}
                          <span className="font-bold text-foreground">{i.maxPoints}pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Graph Tab - visual dependency display */}
      {tab === "graph" && selectedTemplate && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Dependency Graph</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(
              cells.reduce((acc: Record<string, number>, c) => {
                const tag = c.semanticTag?.pillar || c.semanticTag?.role || "untagged";
                acc[tag] = (acc[tag] || 0) + 1;
                return acc;
              }, {})
            ).sort((a, b) => b[1] - a[1]).map(([tag, count]) => {
              const colorClass = PILLAR_COLORS[tag] || "bg-muted";
              return (
                <div key={tag} className={`border rounded-lg p-3 ${colorClass}`}>
                  <div className="text-xs text-muted-foreground">{tag}</div>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-[10px] text-muted-foreground">cells</div>
                </div>
              );
            })}
          </div>

          <div className="border border-border rounded-lg p-4 bg-card">
            <h3 className="font-semibold text-sm mb-3">Formula Cells (hidden calculations)</h3>
            <p className="text-xs text-muted-foreground mb-3">
              These cells contain formulas but may not have visible labels -- they are intermediate calculations.
            </p>
            <div className="overflow-auto max-h-[50vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Address</th>
                    <th className="text-left px-3 py-2">Formula</th>
                    <th className="text-left px-3 py-2">Value</th>
                    <th className="text-left px-3 py-2">Pillar</th>
                    <th className="text-right px-3 py-2">Deps</th>
                  </tr>
                </thead>
                <tbody>
                  {cells
                    .filter(c => c.formula)
                    .sort((a, b) => (b.dependsOn.length) - (a.dependsOn.length))
                    .slice(0, 200)
                    .map(c => (
                      <tr key={c.address} className="border-t border-border/50 hover:bg-muted/30 cursor-pointer"
                        onClick={() => { setSelectedCell(c); setTab("cells"); }}>
                        <td className="px-3 py-1.5 font-mono">{c.address}</td>
                        <td className="px-3 py-1.5 font-mono text-green-400 max-w-[400px] truncate">={c.formula}</td>
                        <td className="px-3 py-1.5">
                          {typeof c.value === "number" ? c.value.toFixed(4) : String(c.value ?? "")}
                        </td>
                        <td className="px-3 py-1.5">
                          {c.semanticTag?.pillar && (
                            <span className={`px-2 py-0.5 rounded text-[10px] ${PILLAR_COLORS[c.semanticTag.pillar] || "bg-muted"}`}>
                              {c.semanticTag.pillar}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">{c.dependsOn.length}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Accuracy Tab */}
      {tab === "accuracy" && selectedTemplate && (
        <div className="space-y-6">
          <div className="border border-border rounded-lg p-6 bg-card">
            <h2 className="font-semibold mb-4">Accuracy Comparison</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Upload a filled-in toolkit Excel to compare ArangoDB stored values vs Excel ground truth.
            </p>
            <form onSubmit={handleCompare} className="flex gap-4 items-end">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">Ground Truth Excel</label>
                <input type="file" name="truthFile" accept=".xlsx,.xls" required
                  className="block text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground" />
              </div>
              <button type="submit" disabled={uploading}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50">
                {uploading ? "Comparing..." : "Compare"}
              </button>
            </form>
          </div>

          {comparisonResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-400">{comparisonResult.accuracy}%</div>
                  <div className="text-sm text-muted-foreground">Accuracy</div>
                </div>
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-400">{comparisonResult.matches}</div>
                  <div className="text-sm text-muted-foreground">Matches</div>
                </div>
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-red-400">{comparisonResult.mismatches}</div>
                  <div className="text-sm text-muted-foreground">Mismatches</div>
                </div>
              </div>

              {comparisonResult.details.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400">
                    Mismatched Cells (top {comparisonResult.details.length})
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2">Address</th>
                        <th className="text-left px-3 py-2">Stored</th>
                        <th className="text-left px-3 py-2">Truth</th>
                        <th className="text-right px-3 py-2">Delta</th>
                        <th className="text-left px-3 py-2">Formula</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonResult.details.map((d, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-3 py-1.5 font-mono">{d.address}</td>
                          <td className="px-3 py-1.5">
                            {typeof d.storedValue === "number" ? d.storedValue.toFixed(4) : String(d.storedValue)}
                          </td>
                          <td className="px-3 py-1.5">
                            {typeof d.truthValue === "number" ? d.truthValue.toFixed(4) : String(d.truthValue)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-red-400">
                            {d.delta !== null ? d.delta.toFixed(4) : "-"}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-green-400 max-w-[300px] truncate">
                            {d.formula ? `=${d.formula}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
    </div>
  );
}
