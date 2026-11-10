import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { explainError, studio } from '@/lib/studioApi';
import { Panel, Page, useStudio, Loading, ErrorNote, StatusBadge, fmtDate, short } from './kit';
import { StepUpDialog } from './StepUpDialog';

/** Approval queue for submitted rule changes. */
export function Review() {
  const list = useStudio<any>('/changesets');
  const [selected, setSelected] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [effective, setEffective] = useState('');
  const [stepUp, setStepUp] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); await list.reload(); } catch (e) { setError(explainError(e)); } setBusy(false); };
  const pick = async (cs: any) => { setSelected(cs); setPlan(null); setDone(''); setAnnouncement(cs.announcement ?? ''); setEffective(cs.effectiveFrom ?? ''); if (cs.status === 'approved') await prepare(cs, cs.announcement ?? '', cs.effectiveFrom ?? ''); };
  const prepare = async (cs = selected, ann = announcement, eff = effective) => act(async () => setPlan(await studio('POST', `/changesets/${cs.id}/publish/prepare`, { announcement: ann || undefined, effectiveFrom: eff ? new Date(eff).toISOString() : undefined })));
  const decide = (d: 'approve' | 'reject' | 'request-changes') => act(async () => { const r = await studio<any>('POST', `/changesets/${selected.id}/${d}`, { comment }); setSelected(r); setComment(''); if (r.status === 'approved') await prepare(r); });
  const publish = async (token: string) => {
    setStepUp(false);
    await act(async () => {
      const r = await studio<any>('POST', `/changesets/${selected.id}/publish`, { stepUpToken: token, announcement, effectiveFrom: effective ? new Date(effective).toISOString() : undefined });
      setDone(`Published version ${r.version.version} of ${selected.scorecardId}.`); setSelected(r.changeset); setPlan(null);
    });
  };

  const queue = (list.data?.changesets ?? []).filter((c: any) => ['submitted', 'approved'].includes(c.status));
  return (
    <Page title="Pending approvals" subtitle="Review submitted rule changes before they are published.">
      <ErrorNote message={error || list.error} />
      {done && <Panel tone="ok"><p role="status" className="text-sm">{done}</p></Panel>}
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Panel title="Awaiting review">
          {list.loading ? <Loading /> : queue.length === 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-800">Nothing needs your review.</p>
              <p className="text-xs text-zinc-500">Submitted rule changes will appear here when they are ready for approval.</p>
            </div>
          ) : (
            <ul className="space-y-1">{queue.map((c: any) => (
              <li key={c.id}><button className={`w-full rounded border p-2 text-left text-sm ${selected?.id === c.id ? 'border-zinc-900' : 'border-zinc-200'} hover:bg-zinc-50`} onClick={() => pick(c)}>
                <span className="font-medium">{c.title}</span><span className="block text-xs text-zinc-500">{c.scorecardId} · {c.items.length} change(s)</span><StatusBadge status={c.status} />
              </button></li>
            ))}</ul>
          )}
        </Panel>

        {selected && (
          <div className="space-y-4">
            <Panel title={selected.title}>
              <p className="text-sm text-zinc-600">{selected.description}</p>
              <ul className="mt-2 divide-y divide-zinc-100 text-sm">{selected.items.map((i: any) => <li key={i.id} className="py-1"><code className="text-xs">{i.path}</code> → <strong>{i.value}</strong><span className="block text-xs text-zinc-500">{i.justification}</span></li>)}</ul>
              <p className="mt-2 text-xs text-zinc-500">Authors: {selected.authors.join(', ')}</p>
            </Panel>

            {selected.status === 'submitted' && (
              <Panel title="Your decision">
                <Textarea aria-label="Comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (required to reject or ask for changes)" />
                <div className="mt-2 flex gap-2">
                  <Button disabled={busy} onClick={() => decide('approve')}>Approve</Button>
                  <Button variant="outline" disabled={busy || comment.trim().length < 5} onClick={() => decide('request-changes')}>Request changes</Button>
                  <Button variant="outline" disabled={busy || comment.trim().length < 5} onClick={() => decide('reject')}>Reject</Button>
                </div>
              </Panel>
            )}

            {selected.status === 'approved' && (
              <Panel title="Publish">
                <label className="text-sm font-medium" htmlFor="ann">Announcement (what changed and why)</label>
                <Textarea id="ann" rows={3} value={announcement} onChange={(e) => setAnnouncement(e.target.value)} />
                <label className="mt-2 block text-sm font-medium" htmlFor="eff">Effective from (leave empty for "on publication")</label>
                <Input id="eff" type="datetime-local" value={effective} onChange={(e) => setEffective(e.target.value)} className="max-w-xs" />
                <Button className="mt-2" variant="outline" disabled={busy} onClick={() => prepare()}>Check readiness</Button>
                {plan && (
                  <ol className="mt-3 space-y-1 text-sm" aria-label="Publishing checks">
                    {plan.checks.map((c: any) => <li key={c.n}><span aria-hidden>{c.ok ? '✓' : '✗'}</span> <span className="sr-only">{c.ok ? 'passed' : 'failed'}</span> {c.n}. {c.id}{!c.ok && <span className="block text-xs text-red-800">{c.detail}</span>}</li>)}
                  </ol>
                )}
                <Button className="mt-3" disabled={busy || !plan?.ready} onClick={() => setStepUp(true)}>Publish version {plan?.nextVersion ?? ''}</Button>
                {plan && !plan.ready && <p className="mt-1 text-xs text-zinc-500">Publishing unlocks when every check passes.</p>}
              </Panel>
            )}
          </div>
        )}
      </div>
      {selected && plan && (
        <StepUpDialog open={stepUp} action="publish" title={`Publish ${selected.scorecardId} version ${plan.nextVersion}`}
          params={{ changesetId: selected.id, announcement, effectiveFrom: effective ? new Date(effective).toISOString() : undefined }}
          onCancel={() => setStepUp(false)} onToken={publish} />
      )}
    </Page>
  );
}

/** 14.6 Versions and backups: timeline, compare, restore, freeze, emergency rollback, backups. */
export function Versions() {
  const cards = useStudio<any>('/scorecards');
  const [sid, setSid] = useState('rcogp-generic');
  const timeline = useStudio<any>(`/scorecards/${sid}/timeline`, [sid]);
  const backups = useStudio<any>('/backups/status');
  const snaps = useStudio<any>('/backups/snapshots');
  const [cmp, setCmp] = useState<any>(null);
  const [action, setAction] = useState<null | { kind: 'freeze' | 'unfreeze' | 'emergency-rollback'; toVersion?: number | 'shipped' }>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); setMsg(''); try { await fn(); await Promise.all([timeline.reload(), backups.reload(), snaps.reload()]); } catch (e) { setError(explainError(e)); } setBusy(false); };
  const restoreDraft = (to: number | 'shipped') => act(async () => { await studio('POST', `/scorecards/${sid}/restore`, { toVersion: to, reason }); setMsg('A restore draft was created. It goes through impact, approval and publishing like any change.'); });
  const compare = (from: number, to: number) => act(async () => setCmp(await studio('GET', `/scorecards/${sid}/compare?from=${from}&to=${to}`)));
  const versions = timeline.data?.versions ?? [];
  const frozen = (timeline.data?.freezeEvents ?? []).slice(-1)[0]?.action === 'freeze';

  const params = action?.kind === 'emergency-rollback' ? { scorecardId: sid, toVersion: action.toVersion } : { scope: sid };
  const onToken = async (token: string) => {
    const a = action!; setAction(null);
    await act(async () => {
      if (a.kind === 'freeze') await studio('POST', '/freeze', { scope: sid, reason, stepUpToken: token });
      else if (a.kind === 'unfreeze') await studio('POST', '/unfreeze', { scope: sid, reason, stepUpToken: token });
      else { const r = await studio<any>('POST', `/scorecards/${sid}/emergency-rollback`, { toVersion: a.toVersion, reason, stepUpToken: token }); setMsg(r.mode === 'rolled_back' ? `Rolled back as version ${r.version.version}. An independent review is now due.` : `Target incompatible: frozen on ${r.serveVersion === 0 ? 'the shipped rules' : `version ${r.serveVersion}`}.`); }
    });
  };

  return (
    <Page title="Versions and backups" subtitle="Published history is append-only: restoring or rolling back always creates a new version.">
      <ErrorNote message={error || timeline.error} />
      {msg && <Panel tone="ok"><p role="status" className="text-sm">{msg}</p></Panel>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label>Scorecard <select className="ml-1 rounded border border-zinc-300 bg-white p-1" value={sid} onChange={(e) => { setSid(e.target.value); setCmp(null); }}>{(cards.data?.scorecards ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        {frozen && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800" role="status">Frozen</span>}
      </div>

      <Panel title="Reason (required for restore, freeze and rollback)">
        <Input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (10+ characters)" />
        <div className="mt-2 flex flex-wrap gap-2">
          {!frozen ? <Button variant="outline" disabled={busy || reason.trim().length < 5} onClick={() => setAction({ kind: 'freeze' })}>Freeze this scorecard</Button>
            : <Button variant="outline" disabled={busy || reason.trim().length < 5} onClick={() => setAction({ kind: 'unfreeze' })}>Unfreeze</Button>}
          <Button variant="outline" disabled={busy || reason.trim().length < 10} onClick={() => restoreDraft('shipped')}>Draft a restore to the shipped rules</Button>
        </div>
      </Panel>

      <Panel title="Timeline">
        {timeline.loading ? <Loading /> : versions.length === 0 ? <p className="text-sm text-zinc-500">Nothing published yet: this scorecard uses the shipped rules (version 0).</p> : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Published versions</caption>
            <thead><tr className="text-xs uppercase text-zinc-500"><th scope="col">Version</th><th scope="col">Kind</th><th scope="col">Effective</th><th scope="col">By</th><th scope="col">Announcement</th><th scope="col">Hash</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{[...versions].reverse().map((v: any) => (
              <tr key={v.version} className="border-t border-zinc-100 align-top">
                <td className="font-medium">{v.version}</td><td>{v.kind}{v.restoredFromVersion ? ` of v${v.restoredFromVersion}` : ''}</td><td>{fmtDate(v.effectiveFrom)}</td><td>{v.publishedBy}</td><td className="max-w-xs">{v.announcement}</td><td><code className="text-xs">{short(v.configHash)}</code></td>
                <td className="space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => compare(0, v.version)}>vs shipped</Button>
                  <Button size="sm" variant="ghost" disabled={busy || reason.trim().length < 10} onClick={() => restoreDraft(v.version)}>Restore…</Button>
                  <Button size="sm" variant="ghost" disabled={busy || reason.trim().length < 10} onClick={() => setAction({ kind: 'emergency-rollback', toVersion: v.version })}>Emergency rollback</Button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {cmp && <div className="mt-3 text-sm"><h3 className="font-medium">v{cmp.from} → v{cmp.to}</h3>{cmp.changes.length === 0 ? <p>No rule differences.</p> : <ul>{cmp.changes.map((c: any) => <li key={c.ruleKey}><code className="text-xs">{c.path}</code>: {String(c.from)} → <strong>{String(c.to)}</strong></li>)}</ul>}</div>}
      </Panel>

      <Panel title="Backups" tone={backups.data?.stale ? 'warn' : 'plain'}>
        {backups.error ? <p className="text-sm text-zinc-500">Backup status is limited to approvers and admins.</p> : backups.data && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-zinc-500">Off-site store</dt><dd>{backups.data.offsiteTarget ?? 'Not configured'}</dd></div>
            <div><dt className="text-xs uppercase text-zinc-500">Signing key</dt><dd>{backups.data.signingConfigured ? 'Configured' : 'Missing'}</dd></div>
            <div><dt className="text-xs uppercase text-zinc-500">Last verified snapshot</dt><dd>{fmtDate(backups.data.lastVerifiedSnapshotAt)}</dd></div>
            <div><dt className="text-xs uppercase text-zinc-500">Protected publishing</dt><dd>{backups.data.protectedPublishingAvailable ? 'Available' : 'Disabled'}</dd></div>
          </dl>
        )}
        {(snaps.data?.snapshots ?? []).length > 0 && (
          <ul className="mt-2 text-xs text-zinc-600">{snaps.data.snapshots.slice(-5).reverse().map((s: any) => <li key={s.id}>{fmtDate(s.createdAt)} · {s.kind} · {s.scorecardId ?? 'all'} · <code>{short(s.contentHash)}</code> · verified {fmtDate(s.verifiedAt)}</li>)}</ul>
        )}
      </Panel>

      {action && <StepUpDialog open title={action.kind === 'emergency-rollback' ? `Emergency rollback of ${sid}` : `${action.kind === 'freeze' ? 'Freeze' : 'Unfreeze'} ${sid}`} action={action.kind} params={params} onCancel={() => setAction(null)} onToken={onToken} />}
      <p className="text-xs text-zinc-500">Looking for the incident procedure? <Link className="underline" href="/studio/activity">Activity and audit</Link></p>
    </Page>
  );
}
