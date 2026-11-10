import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { explainError, formatValue, studio, UNIT_LABEL } from '@/lib/studioApi';
import { Panel, Page, useStudio, Loading, ErrorNote, StatusBadge } from './kit';
import { useImpactPreview } from './useImpactPreview';

/** 14.2 Scorecard workspace: the real rules, their shipped/published/draft values, and a live preview. */
export default function Workspace({ sid }: { sid: string }) {
  const [, navigate] = useLocation();
  const registry = useStudio<any>(`/scorecards/${sid}/registry`, [sid]);
  const values = useStudio<any>(`/scorecards/${sid}/values`, [sid]);
  const drafts = useStudio<any>(`/changesets?scorecardId=${sid}`, [sid]);
  const [draftId, setDraftId] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string>('');
  const [value, setValue] = useState('');
  const [why, setWhy] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const editable = (drafts.data?.changesets ?? []).filter((c: any) => ['draft', 'changes_requested', 'submitted', 'approved'].includes(c.status));
  const draft = editable.find((c: any) => c.id === draftId) ?? editable[0];

  const published = useMemo(() => Object.fromEntries((values.data?.values ?? []).map((v: any) => [v.key, v])), [values.data]);
  const base = draft?.baseOverrides ?? { source: {}, calculator: {} };
  const proposed = useMemo(() => {
    const p = { source: { ...base.source }, calculator: { ...base.calculator } } as any;
    for (const it of draft?.items ?? []) p[it.layer][it.path] = it.value;
    return p;
  }, [draft]);
  const preview = useImpactPreview(sid, base, proposed, !!draft && (draft.items?.length ?? 0) > 0);

  const groups = useMemo(() => {
    const g = new Map<string, any[]>();
    for (const r of registry.data?.rules ?? []) {
      if (filter && !`${r.label} ${r.element} ${r.key}`.toLowerCase().includes(filter.toLowerCase())) continue;
      g.set(r.element, [...(g.get(r.element) ?? []), r]);
    }
    return Array.from(g.entries());
  }, [registry.data, filter]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await Promise.all([drafts.reload(), values.reload()]); } catch (e) { setError(explainError(e)); }
    setBusy(false);
  };
  const newDraft = () => run(async () => {
    const cs = await studio<any>('POST', `/scorecards/${sid}/changesets`, { title: newTitle });
    setDraftId(cs.id); setCreating(false); setNewTitle('');
  });
  const saveItem = (rule: any) => run(async () => {
    await studio('POST', `/changesets/${draft.id}/items`, { ruleKey: rule.key, value: Number(value), justification: why, rev: draft.rev });
    setEditing(''); setValue(''); setWhy('');
  });
  const removeItem = (id: string) => run(() => studio('DELETE', `/changesets/${draft.id}/items/${id}?rev=${draft.rev}`));
  const runImpact = () => run(async () => {
    const r = await studio<any>('POST', `/changesets/${draft.id}/impact`);
    navigate(`/studio/s/${sid}/impact/${r.id}`);
  });

  if (registry.loading) return <Loading what="Loading rules" />;
  const draftValue = (key: string) => draft?.items?.find((i: any) => i.ruleKey === key)?.value;

  return (
    <Page
      title={values.data ? `${sid}` : 'Scorecard'}
      subtitle={`Published version ${values.data?.publishedVersion ?? 0}${values.data?.publishedVersion === 0 ? ' (the shipped rules)' : ''}. Values below come from the calculator configuration the Toolkit actually scores with.`}
      actions={<>
        <Link href={`/studio/s/${sid}/describe`}><Button variant="outline">Describe a change</Button></Link>
        <Button onClick={() => setCreating(true)} disabled={busy}>New draft</Button>
      </>}
    >
      <ErrorNote message={error || registry.error || values.error} />

      {creating && (
        <Panel title="New draft">
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="draft-title">Draft name</label>
            <Input id="draft-title" className="max-w-md" autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder='Name it, e.g. "Guarantees count at 50%"' onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim().length >= 3) void newDraft(); }} />
            <Button onClick={newDraft} disabled={busy || newTitle.trim().length < 3}>Create draft</Button>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </Panel>
      )}

      <Panel title="Draft">
        {editable.length === 0 ? <p className="text-sm text-zinc-600">No open draft. Create one to change a rule.</p> : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">Working on
              <select className="rounded border border-zinc-300 bg-white p-1" value={draft?.id} onChange={(e) => setDraftId(e.target.value)}>
                {editable.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            {draft && <StatusBadge status={draft.status} />}
            {draft && <span className="text-zinc-500">{draft.items.length} change(s)</span>}
            {draft && draft.items.length > 0 && <Button onClick={runImpact} disabled={busy}>Run authoritative impact</Button>}
          </div>
        )}
        {draft?.items?.length > 0 && (
          <ul className="mt-3 divide-y divide-zinc-100 text-sm">
            {draft.items.map((it: any) => (
              <li key={it.id} className="flex items-start justify-between gap-2 py-2">
                <span><code className="text-xs">{it.path}</code> → <strong>{it.value}</strong><span className="block text-xs text-zinc-500">{it.justification}{it.source === 'ai' ? ' · AI-assisted' : ''}</span></span>
                <Button variant="ghost" size="sm" onClick={() => removeItem(it.id)} disabled={busy} aria-label={`Remove change to ${it.path}`}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {draft?.items?.length > 0 && (
        <Panel title="Quick preview (this browser, advisory)" tone="plain">
          {preview.running && <Loading what="Calculating" />}
          {preview.error && <ErrorNote message={preview.error} />}
          {preview.report && (
            <p className="text-sm">
              {preview.report.summary.fixturesChanged} of {preview.report.summary.fixturesRun} synthetic scorecards change; {preview.report.summary.levelsChanged} change level;
              largest total movement {preview.report.summary.maxAbsTotalDelta} points. Elements affected: {preview.report.summary.affectedPillars.join(', ') || 'none'}.
              <span className="block text-xs text-zinc-500">Only the server's run can unlock submission.</span>
            </p>
          )}
        </Panel>
      )}

      <div>
        <label className="sr-only" htmlFor="rule-filter">Filter rules</label>
        <Input id="rule-filter" placeholder="Filter rules..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />
      </div>

      {groups.map(([element, rules]) => (
        <Panel key={element} title={element}>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{element} rules</caption>
            <thead><tr className="text-xs uppercase text-zinc-500"><th scope="col" className="py-1">Rule</th><th scope="col">Unit</th><th scope="col">Shipped</th><th scope="col">Published</th><th scope="col">Draft</th><th scope="col"><span className="sr-only">Edit</span></th></tr></thead>
            <tbody>
              {rules.map((r: any) => {
                const pv = published[r.key];
                const dv = draftValue(r.key);
                const isEditing = editing === r.key;
                return (
                  <tr key={r.key} className="border-t border-zinc-100 align-top">
                    <td className="py-2 pr-2">{r.label}{r.editability === 'developer' && <span className="ml-1 rounded bg-zinc-100 px-1 text-xs text-zinc-600" title="Changes the structure of the scorecard - raise a developer change request">developer</span>}</td>
                    <td className="pr-2 text-xs text-zinc-500">{UNIT_LABEL[r.unit] ?? r.unit}</td>
                    <td className="pr-2">{formatValue(pv?.shipped, r.unit)}</td>
                    <td className="pr-2">{formatValue(pv?.published, r.unit)}</td>
                    <td className="pr-2 font-medium">{dv === undefined ? '' : formatValue(dv, r.unit)}</td>
                    <td className="text-right">
                      {r.editability === 'developer' ? <Link href="/studio/change-requests" className="text-xs underline">Request</Link> : !draft ? null : isEditing ? (
                        <div className="flex flex-col gap-1 text-left">
                          <Input aria-label={`New value for ${r.label}`} type="number" step="any" min={r.min} max={r.max} value={value} onChange={(e) => setValue(e.target.value)} placeholder={`${r.min} to ${r.max}`} />
                          <Textarea aria-label="Why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? (10+ characters)" rows={2} />
                          <div className="flex gap-1"><Button size="sm" onClick={() => saveItem(r)} disabled={busy || value === '' || why.trim().length < 10}>Add to draft</Button><Button size="sm" variant="outline" onClick={() => setEditing('')}>Cancel</Button></div>
                        </div>
                      ) : <Button size="sm" variant="outline" onClick={() => { setEditing(r.key); setValue(String(dv ?? pv?.published ?? '')); setWhy(''); }}>Edit</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ))}
    </Page>
  );
}
