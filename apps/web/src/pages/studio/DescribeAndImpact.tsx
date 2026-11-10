import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { explainError, studio } from '@/lib/studioApi';
import { Panel, Page, useStudio, Loading, ErrorNote, VerdictBadge } from './kit';

/** 14.3 Describe a change: optional AI help. Without a provider this says so and points at manual editing. */
export function Describe({ sid }: { sid: string }) {
  const avail = useStudio<any>('/ai/availability');
  const drafts = useStudio<any>(`/changesets?scorecardId=${sid}`, [sid]);
  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const draft = (drafts.data?.changesets ?? []).find((c: any) => ['draft', 'changes_requested'].includes(c.status));

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(explainError(e)); } setBusy(false); };

  if (avail.loading) return <Loading />;
  return (
    <Page title="Describe a change" subtitle="Say what should change in plain language. The assistant proposes concrete rule edits; nothing is applied until you accept, and every edit is re-checked against the rule registry.">
      <ErrorNote message={error || avail.error} />
      {!avail.data?.available ? (
        <Panel tone="warn" title="AI assistance is not available">
          <p className="text-sm">{avail.data?.reason}</p>
          <p className="mt-2 text-sm">You can still make the change by hand in the <Link className="underline" href={`/studio/s/${sid}`}>scorecard workspace</Link>.</p>
        </Panel>
      ) : !draft ? (
        <Panel tone="warn"><p className="text-sm">Open a draft in the <Link className="underline" href={`/studio/s/${sid}`}>workspace</Link> first.</p></Panel>
      ) : (
        <>
          <Panel>
            <p className="mb-2 text-xs text-zinc-500">{avail.data.dataPolicy}</p>
            <label htmlFor="prompt" className="text-sm font-medium">What should change?</label>
            <Textarea id="prompt" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Guarantees should count at 50% of their value toward supplier development" />
            <Button className="mt-2" disabled={busy || prompt.trim().length < 10} onClick={() => act(async () => setProposal(await studio('POST', `/changesets/${draft.id}/propose`, { prompt })))}>Propose rule edits</Button>
          </Panel>
          {proposal && (
            <Panel title="Proposal (not applied)">
              {proposal.items.length === 0 ? <p className="text-sm">The assistant found no matching rule.</p> : (
                <ul className="space-y-1 text-sm">{proposal.items.map((i: any) => <li key={i.ruleKey}><code className="text-xs">{i.ruleKey}</code> → <strong>{i.value}</strong><span className="block text-xs text-zinc-500">{i.justification}</span></li>)}</ul>
              )}
              {proposal.rejectedByValidation.length > 0 && <p className="mt-2 text-xs text-amber-800">{proposal.rejectedByValidation.length} suggestion(s) were dropped by validation (unknown, developer-only or out-of-range rules).</p>}
              <div className="mt-3 flex gap-2">
                <Button disabled={busy || proposal.items.length === 0} onClick={() => act(async () => { await studio('POST', `/proposals/${proposal.id}/accept`); setProposal(null); })}>Accept into draft</Button>
                <Button variant="outline" disabled={busy} onClick={() => act(async () => { await studio('POST', `/proposals/${proposal.id}/reject`); setProposal(null); })}>Reject</Button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Accepting makes you an author of this change, so you will not be able to approve it.</p>
            </Panel>
          )}
        </>
      )}
    </Page>
  );
}

/** 14.4 Impact preview: the server's authoritative run - verdicts, lines, acknowledgements, invariants. */
export function Impact({ sid, runId }: { sid: string; runId: string }) {
  const run = useStudio<any>(`/impact/${runId}`, [runId]);
  const [verdict, setVerdict] = useState('');
  const lines = useStudio<any>(`/impact/${runId}/lines${verdict ? `?verdict=${verdict}` : ''}`, [runId, verdict]);
  const [why, setWhy] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (run.loading) return <Loading what="Loading the impact run" />;
  const r = run.data;
  const review = r?.review;
  const ack = async (ruleKey: string) => {
    setBusy(true); setError('');
    try { await studio('POST', `/impact/${runId}/acknowledge`, { ruleKey, justification: why[ruleKey] ?? '' }); await run.reload(); } catch (e) { setError(explainError(e)); }
    setBusy(false);
  };
  const submit = async () => {
    setBusy(true); setError('');
    try { await studio('POST', `/changesets/${r.changesetId}/submit`); window.location.assign('/studio/review'); } catch (e) { setError(explainError(e)); }
    setBusy(false);
  };

  return (
    <Page title="Impact preview" subtitle={`Authoritative server calculation for ${sid}. This is the run that counts.`}
      actions={<Link href={`/studio/s/${sid}`}><Button variant="outline">Back to workspace</Button></Link>}>
      <ErrorNote message={error || run.error || (r?.status === 'failed' ? r.error : '')} />
      {review && (
        <>
          <Panel title="Result">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {(['match', 'deliberate', 'unexplained', 'missing'] as const).map((v) => (
                <div key={v}><dt className="text-xs uppercase text-zinc-500">{v}</dt><dd className="text-lg font-semibold">{review.counts[v]}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-sm">{review.report.summary.fixturesChanged} of {review.report.summary.fixturesRun} synthetic scorecards change · {review.report.summary.levelsChanged} level movement(s) · largest total change {review.report.summary.maxAbsTotalDelta} pts.</p>
            {review.blocking.length > 0 && <ErrorNote message={`Blocking: ${review.blocking.join(' · ')}`} />}
          </Panel>

          {review.requiresAcknowledgement.length > 0 && (
            <Panel title="Acknowledge the deliberate differences">
              <ul className="space-y-3">
                {review.requiresAcknowledgement.map((k: string) => (
                  <li key={k} className="text-sm">
                    <code className="text-xs">{k}</code>
                    {r.acknowledgements[k] ? <p className="text-emerald-800">Acknowledged: {r.acknowledgements[k].justification}</p> : (
                      <div className="mt-1 flex gap-2">
                        <Textarea aria-label={`Justification for ${k}`} rows={2} value={why[k] ?? ''} onChange={(e) => setWhy({ ...why, [k]: e.target.value })} placeholder="Why is this difference intended? (10+ characters)" />
                        <Button disabled={busy || (why[k] ?? '').trim().length < 10} onClick={() => ack(k)}>Acknowledge</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Invariants">
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {[...review.invariants, review.level1].map((i: any) => <li key={i.id}><span aria-hidden>{i.ok ? '✓' : '✗'}</span> <span className="sr-only">{i.ok ? 'passed' : 'failed'}</span> {i.id}{!i.ok && <span className="block text-xs text-red-800">{i.detail}</span>}</li>)}
            </ul>
          </Panel>

          <Panel title="Lines">
            <div className="mb-2 flex gap-2 text-sm" role="group" aria-label="Filter by verdict">
              {['', 'deliberate', 'unexplained', 'missing', 'match'].map((v) => <Button key={v || 'all'} size="sm" variant={verdict === v ? 'default' : 'outline'} onClick={() => setVerdict(v)}>{v || 'all'}</Button>)}
            </div>
            {lines.loading ? <Loading /> : (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Scoring lines affected</caption>
                <thead><tr className="text-xs uppercase text-zinc-500"><th scope="col">Synthetic case</th><th scope="col">Element</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Change</th><th scope="col">Verdict</th></tr></thead>
                <tbody>{(lines.data?.lines ?? []).map((l: any, i: number) => (
                  <tr key={i} className="border-t border-zinc-100"><td>{l.profile}</td><td>{l.pillar}</td><td>{l.base}</td><td>{l.proposed}</td><td>{l.delta > 0 ? '+' : ''}{l.delta}</td><td><VerdictBadge verdict={l.verdict} /></td></tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
          <div><Button onClick={submit} disabled={busy || review.blocking.length > 0 || review.requiresAcknowledgement.some((k: string) => !r.acknowledgements[k])}>Submit for review</Button></div>
        </>
      )}
    </Page>
  );
}
