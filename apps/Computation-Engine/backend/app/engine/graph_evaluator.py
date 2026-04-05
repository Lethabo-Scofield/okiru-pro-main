from typing import Any, Dict, List, Optional, Set, Tuple

from app.engine.addressing import normalize_address
from app.core.logger import get_logger

import networkx as nx

logger = get_logger("ComputeEngine.GraphEvaluator")


class ModelArtifact:

    def __init__(self, artifact_doc: Dict[str, Any]):
        """
        Args:
            artifact_doc: Document from model_artifacts collection with structure:
                {
                    "cells": {...},
                    "formulas": {...},
                    "graph": {"nodes": [...], "edges": [...]},
                    "inputs": [...],
                    "outputs": [...],
                }
        """
        self.cells = artifact_doc.get("cells", {})
        self.formulas = artifact_doc.get("formulas", {})
        self.graph_data = artifact_doc.get("graph", {"nodes": [], "edges": []})
        self.inputs = artifact_doc.get("inputs", [])
        self.outputs = artifact_doc.get("outputs", [])
        self.default_sheet = self.graph_data.get("default_sheet")

        self._graph = self._build_nx_graph()
    
    def _build_nx_graph(self) -> nx.DiGraph:
        G = nx.DiGraph()
        
        # Add all nodes
        for node in self.graph_data.get("nodes", []):
            G.add_node(node)
        
        # Add edges
        for edge in self.graph_data.get("edges", []):
            src = edge["from"]
            dst = edge["to"]
            G.add_edge(src, dst)
        
        return G
    
    @property
    def graph(self) -> nx.DiGraph:
        """Get NetworkX graph for analysis."""
        return self._graph
    
    def get_topological_order(self) -> List[str]:
        """Get cells in evaluation order (topological sort)."""
        try:
            return list(nx.topological_sort(self._graph))
        except nx.NetworkXError as e:
            raise RuntimeError(f"Dependency graph has cycle: {e}") from e
    
    def get_dependencies(self, cell: str) -> Set[str]:
        """Get all cells that this cell depends on (predecessors)."""
        return set(nx.ancestors(self._graph, cell))
    
    def get_dependents(self, cell: str) -> Set[str]:
        """Get all cells that depend on this cell (successors)."""
        return set(nx.descendants(self._graph, cell))


def evaluate_model(
    artifact: ModelArtifact,
    overrides: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Evaluate a compiled model with optional cell overrides.
    
    Performs a single topological pass through the dependency graph,
    evaluating each cell in dependency order.
    
    Args:
        artifact: ModelArtifact loaded from database
        overrides: Optional dict of {cell_address: value} to override
        
    Returns:
        Tuple of (results_dict, stats_dict) where:
        - results_dict: {cell: value} for all computed cells
        - stats_dict: evaluation statistics
    """
    overrides = overrides or {}

    # Normalize override keys to canonical addresses
    if artifact.default_sheet:
        overrides = {
            normalize_address(k, default_sheet=artifact.default_sheet): v
            for k, v in overrides.items()
        }

    # Validate override cells exist
    invalid_overrides = set(overrides.keys()) - set(artifact.cells.keys())
    if invalid_overrides:
        raise ValueError(f"Cannot override non-existent cells: {invalid_overrides}")

    logger.info(f"Evaluating model with {len(overrides)} overrides")
    
    # Initialize state with cell values
    # Only use stored values for input cells (no formulas)
    # Computed values will be evaluated from formulas
    state: Dict[str, Any] = {}
    for cell_addr, cell_info in artifact.cells.items():
        if cell_addr in overrides:
            # Use override value
            state[cell_addr] = overrides[cell_addr]
        elif cell_info.get("formula"):
            # For cells with formulas, initialize as None so they get computed
            state[cell_addr] = None
        else:
            # For input cells (no formula), use stored value
            state[cell_addr] = cell_info.get("value")
    
# Determine which cells need to be recomputed.
    # Only cells impacted by overrides (and their dependents) should be recalculated.
    affected_cells: Set[str] = set(overrides.keys())
    if affected_cells:
        for cell in list(affected_cells):
            dependents = artifact.get_dependents(cell)
            affected_cells.update(dependents)

    topo_order = artifact.get_topological_order()
    evaluated_count = 0

    for cell_addr in topo_order:
        # Skip if overridden
        if cell_addr in overrides:
            continue

        # Skip if not impacted by overrides (and we have no reason to recompute)
        if affected_cells and cell_addr not in affected_cells:
            continue

        cell_info = artifact.cells.get(cell_addr)
        if not cell_info:
            continue

        formula = cell_info.get("formula")
        if not formula:
            continue

        try:
            result = _evaluate_formula(formula, state, default_sheet=artifact.default_sheet)
            state[cell_addr] = result
            evaluated_count += 1
        except Exception as e:
            logger.warning(f"Failed to evaluate {cell_addr}: {formula} -> {e}")
            state[cell_addr] = "#VALUE!"

    stats = {
        "total_cells": len(artifact.cells),
        "evaluated": evaluated_count,
        "overridden": len(overrides),
        "inputs": len(artifact.inputs),
        "outputs": len(artifact.outputs),
    }

    logger.info(f"Evaluation complete: %s", stats)

    return state, stats


def _evaluate_formula(formula: str, state: Dict[str, Any], default_sheet: Optional[str] = None) -> Any:
    """Evaluate a formula string using current cell state.
    
    Supports basic arithmetic, comparisons, and Excel functions.
    
    Args:
        formula: Formula string (e.g., "=A1+B2*2" or "=AVERAGE(A1:A3)")
        state: Current cell values {cell_addr: value}
        
    Returns:
        Evaluated result
    """
    import re
    
    expr = formula.lstrip("=").strip()
    if not expr:
        return None
    
    # Replace cell references with values
    # Pattern: A1, Sheet!A1, $A$1, etc.
    def replace_cell_ref(match):
        cell_ref = match.group(0)
        # Remove $ signs for absolute references
        cell_ref_clean = cell_ref.replace("$", "")

        # Normalize to canonical address (Sheet!Cell)
        try:
            key = normalize_address(cell_ref_clean, default_sheet=default_sheet)
        except ValueError:
            key = cell_ref_clean

        value = state.get(key)

        # Handle missing or None values
        if value is None:
            return "0"

        # Ensure numeric values
        if isinstance(value, (int, float)):
            return str(value)
        elif isinstance(value, str):
            # Skip error strings like "#VALUE!"
            if value.startswith("#"):
                return "0"
            # Try to convert text to number
            try:
                return str(float(value))
            except:
                return "0"
        else:
            # Try to handle other types
            try:
                return str(float(value))
            except:
                return "0"
    
    cell_pattern = r'\$?[A-Z]+\$?[0-9]+|[A-Za-z0-9_]+!\$?[A-Z]+\$?[0-9]+'
    expr = re.sub(cell_pattern, replace_cell_ref, expr)
    
    # Handle Excel function conversion to Python functions
    # AVERAGE(a,b,c) → avg(a,b,c)
    expr = re.sub(r'\bAVERAGE\s*\(', 'avg(', expr, flags=re.IGNORECASE)
    # MAX(a,b,c) → max(a,b,c)
    expr = re.sub(r'\bMAX\s*\(', 'max(', expr, flags=re.IGNORECASE)
    # MIN(a,b,c) → min(a,b,c)
    expr = re.sub(r'\bMIN\s*\(', 'min(', expr, flags=re.IGNORECASE)
    # SUM(a,b,c) → sum_xl(a,b,c)
    expr = re.sub(r'\bSUM\s*\(', 'sum_xl(', expr, flags=re.IGNORECASE)
    # IF(condition, true_val, false_val) → if_xl(condition, true_val, false_val)
    expr = re.sub(r'\bIF\s*\(', 'if_xl(', expr, flags=re.IGNORECASE)
    
    # Define helper functions for Excel-style operations
    def avg(*values):
        """Average of values (can be multiple args or a list)."""
        vals = []
        for v in values:
            if isinstance(v, (list, tuple)):
                vals.extend(v)
            else:
                vals.append(v)
        numeric_vals = [float(v) for v in vals if isinstance(v, (int, float)) or (isinstance(v, str) and v.replace('.','',1).isdigit())]
        return sum(numeric_vals) / len(numeric_vals) if numeric_vals else 0
    
    def sum_xl(*values):
        """Sum of values (Excel style)."""
        vals = []
        for v in values:
            if isinstance(v, (list, tuple)):
                vals.extend(v)
            else:
                vals.append(v)
        return sum(float(v) for v in vals if isinstance(v, (int, float)) or (isinstance(v, str) and v.replace('.','',1).isdigit()))

    def if_xl(condition, true_val, false_val):
        """Excel IF statement equivalent."""
        try:
            return true_val if condition else false_val
        except Exception:
            return "#VALUE!"
    
    # Evaluate expression safely
    try:
        # Only allow safe built-in functions
        safe_dict = {
            "abs": abs,
            "round": round,
            "max": max,
            "min": min,
            "sum": sum,
            "avg": avg,
            "sum_xl": sum_xl,
            "if_xl": if_xl,
            "__builtins__": {},
        }
        result = eval(expr, safe_dict)
        return result
    except Exception as e:
        # Propagate Excel-style errors to allow the frontend to detect failures.
        # Returning 0 can silently hide issues.
        logger.warning(f"Failed to evaluate expression: {expr} -> {e}")
        return "#VALUE!"
