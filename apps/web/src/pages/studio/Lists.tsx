import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { explainError, studio } from '@/lib/studioApi';
import { Panel, Page, useStudio, Loading, ErrorNote, fmtDate } from './kit';

function useSubmit(reload: () => Promise<void>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); await reload(); } catch (e) { setError(explainError(e)); } setBusy(false); };
  return { error, busy, run };
}

const SidSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const cards = useStudio<any>('/scorecards');
  return (
    <label className="text-sm">Scorecard{' '}
      <select className="rounded border border-zinc-300 bg-white p-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {(cards.data?.scorecards ?? [{ id: 'rcogp-generic', label: 'RCOGP Generic' }]).map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </label>
  );
};

/** 14.7 Developer change requests: rules the data model cannot express yet. */
export function ChangeRequests() {
  const list = useStudio<any>('/change-requests');
  const [sid, setSid] = useState('rcogp-generic');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { error, busy, run } = useSubmit(list.reload);
  return (
    <Page title="Change requests" subtitle="When a rule is not something an expert can edit (it changes the structure of a scorecard or needs code), ask a developer here.">
      <ErrorNote message={error || list.error} />
      <Panel title="New request">
        <div className="space-y-2">
          <SidSelect value={sid} onChange={setSid} />
          <Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" />
          <Textarea aria-label="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs to change and why (cite the ruling if you have one)" />
          <Button disabled={busy || title.trim().length < 3} onClick={() => run(async () => { await studio('POST', '/change-requests', { scorecardId: sid, title, description }); setTitle(''); setDescription(''); })}>Submit request</Button>
        </div>
      </Panel>
      <Panel title="Requests">
        {list.loading ? <Loading /> : (list.data?.changeRequests ?? []).length === 0 ? <p className="text-sm text-zinc-500">None yet.</p> : (
          <ul className="divide-y divide-zinc-100 text-sm">{list.data.changeRequests.map((c: any) => (
            <li key={c.id} className="flex items-start justify-between gap-2 py-2">
              <span><strong>{c.title}</strong> <span className="text-zinc-500">· {c.scorecardId} · {c.status}</span><span className="block text-xs text-zinc-500">{c.description}</span></span>
              <select aria-label={`Status of ${c.title}`} className="rounded border border-zinc-300 bg-white p-1 text-xs" value={c.status} onChange={(e) => run(() => studio('PATCH', `/change-requests/${c.id}`, { status: e.target.value }))}>
                {['open', 'in_progress', 'done', 'declined'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </li>
          ))}</ul>
        )}
      </Panel>
    </Page>
  );
}

/** 14.8 Rulings: the recorded questions and answers that justify rule values. */
export function Rulings() {
  const list = useStudio<any>('/rulings');
  const [f, setF] = useState({ scorecardId: 'rcogp-generic', question: '', answer: '', source: '' });
  const { error, busy, run } = useSubmit(list.reload);
  return (
    <Page title="Rulings" subtitle="Record the regulatory question, the answer and its source, so a rule value can always be traced to a ruling.">
      <ErrorNote message={error || list.error} />
      <Panel title="Add a ruling">
        <div className="space-y-2">
          <SidSelect value={f.scorecardId} onChange={(v) => setF({ ...f, scorecardId: v })} />
          <Input aria-label="Question" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} placeholder="Question" />
          <Textarea aria-label="Answer" rows={3} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} placeholder="Answer" />
          <Input aria-label="Source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Source (document, clause, date)" />
          <Button disabled={busy || f.question.length < 5 || f.answer.length < 5} onClick={() => run(async () => { await studio('POST', '/rulings', f); setF({ ...f, question: '', answer: '', source: '' }); })}>Save ruling</Button>
        </div>
      </Panel>
      <Panel title="Recorded rulings">
        {(list.data?.rulings ?? []).map((r: any) => <article key={r.id} className="border-b border-zinc-100 py-2 text-sm"><h3 className="font-medium">{r.question}</h3><p>{r.answer}</p><p className="text-xs text-zinc-500">{r.scorecardId} · {r.source || 'no source'} · {r.createdBy} · {fmtDate(r.createdAt)}</p></article>)}
        {!list.loading && (list.data?.rulings ?? []).length === 0 && <p className="text-sm text-zinc-500">None yet.</p>}
      </Panel>
    </Page>
  );
}

/** 14.9 Notes. */
export function Notes() {
  const list = useStudio<any>('/notes');
  const [text, setText] = useState('');
  const { error, busy, run } = useSubmit(list.reload);
  return (
    <Page title="Notes" subtitle="Working notes for the rules team. Do not paste client information here.">
      <ErrorNote message={error || list.error} />
      <Panel>
        <Textarea aria-label="Note" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <Button className="mt-2" disabled={busy || text.trim().length < 3} onClick={() => run(async () => { await studio('POST', '/notes', { text }); setText(''); })}>Add note</Button>
      </Panel>
      <Panel>{(list.data?.notes ?? []).map((n: any) => <p key={n.id} className="border-b border-zinc-100 py-2 text-sm">{n.text}<span className="block text-xs text-zinc-500">{n.createdBy} · {fmtDate(n.createdAt)}</span></p>)}</Panel>
    </Page>
  );
}

const actionLabel = (action: unknown) => String(action ?? 'Studio activity')
  .replace(/^client\./, '')
  .replace(/[._-]+/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

const targetLabel = (target: unknown) => {
  const value = String(target ?? '').trim();
  return value || 'Studio';
};

/** Human-readable activity timeline. Raw audit details remain available through the API. */
export function Activity() {
  const list = useStudio<any>('/activity?limit=200');
  const [check, setCheck] = useState<any>(null);
  const [error, setError] = useState('');
  return (
    <Page title="Logs" subtitle="A clear history of rule changes, reviews, and publishing activity."
      actions={<Button variant="outline" onClick={async () => { setError(''); try { setCheck(await studio('GET', '/audit/integrity')); } catch (e) { setError(explainError(e)); } }}>Verify records</Button>}>
      <ErrorNote message={error || list.error} />
      {check && (
        <Panel tone={check.ledger.ok && check.audit.ok ? 'ok' : 'danger'} title="Integrity">
          <p role="status" className="text-sm">{check.ledger.ok && check.audit.ok ? `All ${check.audit.events} audit events and every published ledger verify.` : 'Integrity problems were found. Critical alarms were raised.'}</p>
          {!check.ledger.ok && check.ledger.scorecards.filter((s: any) => !s.ok).map((s: any) => <p key={s.scorecardId} className="text-sm text-red-800">{s.scorecardId}: {s.failures.length} problem(s)</p>)}
        </Panel>
      )}
      <Panel title="Recent activity">
        {list.loading ? <Loading /> : (list.data?.events ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500">No Studio activity recorded yet.</p>
        ) : (
          <ol className="divide-y divide-zinc-100">
            {(list.data?.events ?? []).map((e: any) => (
              <li key={e.seq} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600" aria-label={`Event ${e.seq}`}>{e.seq}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <strong className="text-sm text-zinc-900">{actionLabel(e.action)}</strong>
                    <time className="text-xs text-zinc-500">{fmtDate(e.at)}</time>
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">{targetLabel(e.target)} <span className="mx-1 text-zinc-300">·</span> by {e.actor || 'System'}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </Page>
  );
}

/** 14.11 Notifications. */
export function Notifications() {
  const list = useStudio<any>('/notifications');
  const { error, run } = useSubmit(list.reload);
  const sev: Record<string, string> = { critical: 'border-red-300 bg-red-50', warning: 'border-amber-300 bg-amber-50', info: 'border-zinc-200 bg-white' };
  return (
    <Page title="Notifications" subtitle="Alerts about reviews, publications, backups and integrity. Critical alarms also go to the team webhook.">
      <ErrorNote message={error || list.error} />
      {(list.data?.deliveryProblems ?? []).length > 0 && <Panel tone="danger" title="Alarm delivery problems"><p className="text-sm">{list.data.deliveryProblems.length} critical alarm(s) could not be delivered to the webhook after retries. Check the webhook destination.</p></Panel>}
      {list.loading ? <Loading /> : (list.data?.notifications ?? []).map((n: any): ReactNode => (
        <div key={n.id} className={`rounded border p-3 text-sm ${sev[n.severity] ?? sev.info} ${n.read ? 'opacity-70' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <span><strong>{n.type}</strong> — {n.message}<span className="block text-xs text-zinc-500">{fmtDate(n.createdAt)}{n.dueAt ? ` · due ${fmtDate(n.dueAt)}` : ''}</span></span>
            {!n.read && <Button size="sm" variant="ghost" onClick={() => run(() => studio('POST', `/notifications/${n.id}/read`))}>Mark read</Button>}
          </div>
        </div>
      ))}
      {!list.loading && (list.data?.notifications ?? []).length === 0 && <p className="text-sm text-zinc-500">Nothing yet.</p>}
    </Page>
  );
}
