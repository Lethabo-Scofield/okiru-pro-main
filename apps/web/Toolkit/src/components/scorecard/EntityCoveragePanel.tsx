/**
 * Entity Coverage Panel
 *
 * Shows entity-to-cell mapping coverage before calculation:
 *   - Mapped entities (green)
 *   - Missing entities (red)
 *   - Low confidence matches (yellow)
 *
 * Uses the /api/entity-mappings/{sector}/{type} endpoint.
 */

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, ChevronDown, ChevronRight, MapPin, Target } from "lucide-react";
import { Button } from "@toolkit/components/ui/button";
import { Progress } from "@toolkit/components/ui/progress";
import { Badge } from "@toolkit/components/ui/badge";
import { cn } from "@toolkit/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface CellMatch {
  address: string;
  confidence: number;
  reason: string;
  fuzzyScore?: number;
  isPrimary: boolean;
}

interface EntityCellMapping {
  entityName: string;
  pillarCode: string;
  fieldType: string;
  cellAddresses: string[];
  cellMatches: CellMatch[];
  confidence: number;
  matchReason: string;
}

interface EntityCoverageData {
  sectorCode: string;
  scorecardType: string;
  graphKey: string;
  mappings: EntityCellMapping[];
  coverage: {
    totalEntities: number;
    mappedEntities: number;
    unmappedEntities: string[];
    coveragePercent: number;
  };
}

interface EntityCoveragePanelProps {
  sectorCode: string;
  scorecardType: string;
  entityMap?: Record<string, unknown>;
  onCoverageChange?: (coverage: { hasCoverage: boolean; percentage: number }) => void;
  className?: string;
}

type FilterType = "all" | "mapped" | "unmapped" | "low-confidence";

export function EntityCoveragePanel({
  sectorCode,
  scorecardType,
  entityMap,
  onCoverageChange,
  className,
}: EntityCoveragePanelProps) {
  const [coverage, setCoverage] = useState<EntityCoverageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());

  // Fetch entity mapping
  const fetchCoverage = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/entity-mappings/${sectorCode}/${scorecardType}`);

      if (!response.ok) {
        if (response.status === 404) {
          // No mapping exists yet - try to build it
          await buildMapping();
          return;
        }
        throw new Error(`Failed to fetch coverage: ${response.statusText}`);
      }

      const data = await response.json();
      setCoverage(data.mapping);

      onCoverageChange?.({
        hasCoverage: data.mapping.coverage.coveragePercent > 0,
        percentage: data.mapping.coverage.coveragePercent,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load coverage");
      onCoverageChange?.({ hasCoverage: false, percentage: 0 });
    } finally {
      setLoading(false);
    }
  };

  // Build entity mapping
  const buildMapping = async () => {
    try {
      const response = await fetch(`/api/entity-mappings/build/${sectorCode}/${scorecardType}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Failed to build mapping: ${response.statusText}`);
      }

      const data = await response.json();
      setCoverage(data.mapping);

      onCoverageChange?.({
        hasCoverage: data.mapping.coverage.coveragePercent > 0,
        percentage: data.mapping.coverage.coveragePercent,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build mapping");
      onCoverageChange?.({ hasCoverage: false, percentage: 0 });
    }
  };

  // Initial load
  useEffect(() => {
    fetchCoverage();
  }, [sectorCode, scorecardType]);

  const toggleEntity = (entityName: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityName)) next.delete(entityName);
      else next.add(entityName);
      return next;
    });
  };

  // Filter entities
  const getFilteredEntities = () => {
    if (!coverage) return [];

    const allEntities = coverage.mappings;

    switch (filter) {
      case "mapped":
        return allEntities;
      case "low-confidence":
        return allEntities.filter((e) => e.confidence < 0.7);
      case "unmapped":
        return coverage.coverage.unmappedEntities.map((name) => ({
          entityName: name,
          pillarCode: "unknown",
          fieldType: "unknown",
          cellAddresses: [],
          cellMatches: [],
          confidence: 0,
          matchReason: "Not mapped",
        }));
      default:
        return [
          ...allEntities,
          ...coverage.coverage.unmappedEntities.map((name) => ({
            entityName: name,
            pillarCode: "unknown",
            fieldType: "unknown",
            cellAddresses: [],
            cellMatches: [],
            confidence: 0,
            matchReason: "Not mapped",
          })),
        ];
    }
  };

  const getStatusIcon = (confidence: number, isMapped: boolean) => {
    if (!isMapped) {
      return <XCircle className="w-5 h-5 text-destructive" />;
    }
    if (confidence >= 0.7) {
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    }
    return <AlertTriangle className="w-5 h-5 text-amber-500" />;
  };

  const getStatusColor = (confidence: number, isMapped: boolean) => {
    if (!isMapped) return "bg-destructive/10 border-destructive/20";
    if (confidence >= 0.7) return "bg-emerald-50 border-emerald-200";
    return "bg-amber-50 border-amber-200";
  };

  const getStatusBadge = (confidence: number, isMapped: boolean) => {
    if (!isMapped) {
      return (
        <Badge variant="destructive" className="text-xs">
          Missing
        </Badge>
      );
    }
    if (confidence >= 0.7) {
      return (
        <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
          High Confidence
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
        Low Confidence
      </Badge>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-8", className)}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm text-muted-foreground">Loading entity coverage...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("p-4", className)}>
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" className="mt-2 h-7" onClick={fetchCoverage}>
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!coverage) {
    return (
      <div className={cn("p-4", className)}>
        <Button onClick={fetchCoverage} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Load Coverage
        </Button>
      </div>
    );
  }

  const filteredEntities = getFilteredEntities();
  const coveragePercent = coverage.coverage.coveragePercent;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Entity Coverage</h3>
          <p className="text-sm text-muted-foreground">
            {coverage.coverage.mappedEntities} of {coverage.coverage.totalEntities} entities mapped
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCoverage} disabled={loading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className={cn(
            coveragePercent >= 70 ? "text-emerald-600" : coveragePercent >= 50 ? "text-amber-600" : "text-destructive"
          )}>
            {coveragePercent}% coverage
          </span>
          <span className="text-muted-foreground">
            {coverage.coverage.unmappedEntities.length} missing
          </span>
        </div>
        <Progress value={coveragePercent} className="h-2" />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { key: "all", label: "All", count: coverage.coverage.totalEntities },
          { key: "mapped", label: "Mapped", count: coverage.coverage.mappedEntities },
          { key: "unmapped", label: "Missing", count: coverage.coverage.unmappedEntities.length },
          { key: "low-confidence", label: "Low Confidence", count: coverage.mappings.filter((e) => e.confidence < 0.7).length },
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={filter === tab.key ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter(tab.key as FilterType)}
            className="text-xs h-7"
          >
            {tab.label}
            <Badge variant="outline" className="ml-1 text-xs px-1 py-0">
              {tab.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Entity List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        <AnimatePresence>
          {filteredEntities.map((entity) => {
            const isMapped = entity.cellAddresses.length > 0;
            const isExpanded = expandedEntities.has(entity.entityName);

            return (
              <motion.div
                key={entity.entityName}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className={cn(
                  "border rounded-lg overflow-hidden",
                  getStatusColor(entity.confidence, isMapped)
                )}
              >
                {/* Entity Header */}
                <button
                  onClick={() => toggleEntity(entity.entityName)}
                  className="w-full p-3 flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  {getStatusIcon(entity.confidence, isMapped)}

                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{entity.entityName}</span>
                      {getStatusBadge(entity.confidence, isMapped)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {entity.pillarCode !== "unknown" ? `${entity.pillarCode} • ` : ""}
                      {entity.fieldType}
                    </p>
                  </div>

                  {isMapped && (
                    <div className="text-right">
                      <p className="text-xs font-medium">{(entity.confidence * 100).toFixed(0)}%</p>
                      <p className="text-xs text-muted-foreground">confidence</p>
                    </div>
                  )}

                  {isMapped && (
                    isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )
                  )}
                </button>

                {/* Expanded Cell Matches */}
                <AnimatePresence>
                  {isExpanded && entity.cellMatches.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t bg-white/50"
                    >
                      <div className="p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Mapped to cells:
                        </p>
                        {entity.cellMatches.map((match, index) => (
                          <div
                            key={match.address}
                            className={cn(
                              "flex items-center gap-2 text-sm p-2 rounded",
                              match.isPrimary ? "bg-primary/5" : "bg-muted/50"
                            )}
                          >
                            {match.isPrimary ? (
                              <Target className="w-4 h-4 text-primary" />
                            ) : (
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                            )}
                            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                              {match.address}
                            </code>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs ml-auto",
                                match.confidence >= 0.7
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : "bg-amber-100 text-amber-700 border-amber-200"
                              )}
                            >
                              {(match.confidence * 100).toFixed(0)}%
                            </Badge>
                          </div>
                        ))}
                        {entity.matchReason && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Match reason: {entity.matchReason}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Coverage Warning */}
      {coveragePercent < 70 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-800">
            Low entity coverage may result in inaccurate score calculations.
            Consider providing more complete data or verifying entity mappings.
          </p>
        </div>
      )}
    </div>
  );
}

export default EntityCoveragePanel;
