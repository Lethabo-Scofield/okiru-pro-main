import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImpactReport } from '@toolkit/lib/rules/impact/runImpact';

export interface PreviewState { running: boolean; report: ImpactReport | null; error: string | null }

/** Debounced preview in a module Web Worker; falls back to an error message if workers are unavailable. */
export function useImpactPreview(scorecardId: string, base: unknown, proposed: unknown, enabled = true): PreviewState {
  const [state, setState] = useState<PreviewState>({ running: false, report: null, error: null });
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);

  const post = useCallback((payload: unknown) => {
    if (typeof Worker === 'undefined') { setState({ running: false, report: null, error: 'Web Workers are not available in this browser.' }); return; }
    if (!worker.current) {
      worker.current = new Worker(new URL('./impactWorker.ts', import.meta.url), { type: 'module' });
      worker.current.onmessage = (e: MessageEvent<any>) => {
        if (e.data.id !== seq.current) return; // a newer request superseded this one
        setState(e.data.ok ? { running: false, report: e.data.report, error: null } : { running: false, report: null, error: e.data.error });
      };
      worker.current.onerror = () => setState({ running: false, report: null, error: 'The preview worker failed.' });
    }
    seq.current += 1;
    worker.current.postMessage({ id: seq.current, ...(payload as object) });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setState((s) => ({ ...s, running: true }));
    const t = setTimeout(() => post({ scorecardId, base, proposed }), 250);
    return () => clearTimeout(t);
  }, [scorecardId, JSON.stringify(base), JSON.stringify(proposed), enabled, post]);

  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);
  return state;
}
