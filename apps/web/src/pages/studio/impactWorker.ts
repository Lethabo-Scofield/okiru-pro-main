/// <reference lib="webworker" />
/**
 * Browser Web Worker: the FAST preview. It runs the very same runImpact() the server runs,
 * so the numbers match, but its result is advisory only - the server's run is the only one
 * that can unlock submission, approval or publication.
 */
import { runImpact } from '@toolkit/lib/rules/impact/runImpact';

self.onmessage = (e: MessageEvent<{ id: number; scorecardId: any; base: any; proposed: any }>) => {
  const { id, scorecardId, base, proposed } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, ok: true, report: runImpact(scorecardId, base, proposed) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
