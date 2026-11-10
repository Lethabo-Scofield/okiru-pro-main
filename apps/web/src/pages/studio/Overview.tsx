import { Link } from 'wouter';
import { Panel, Page, useStudio, Loading, ErrorNote, StatusBadge } from './kit';

/** Main Rules Studio entry: select a scorecard and make a controlled change. */
export default function Overview() {
  const access = useStudio<any>('/access');
  const cards = useStudio<any>('/scorecards');
  const drafts = useStudio<any>('/changesets');

  if (access.loading || cards.loading) return <Loading />;
  const open = (drafts.data?.changesets ?? []).filter((c: any) => ['draft', 'submitted', 'approved', 'changes_requested'].includes(c.status));

  return (
    <Page title="Rules" subtitle="Select a scorecard to update its scoring rules.">
      <ErrorNote message={access.error || cards.error} />
      <Panel title="Choose a scorecard">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(cards.data?.scorecards ?? []).map((s: any) => (
            <li key={s.id}>
              <Link href={`/studio/s/${s.id}`} className="block rounded border border-zinc-200 p-3 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900">
                <span className="font-medium text-zinc-900">{s.label}</span>
                <span className="block text-xs text-zinc-500">{s.id} · {s.rules} editable rules</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Open drafts">
        {open.length === 0 ? <p className="text-sm text-zinc-500">No open drafts.</p> : (
          <ul className="divide-y divide-zinc-100">
            {open.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span><Link href={`/studio/s/${c.scorecardId}`} className="font-medium underline">{c.title}</Link> <span className="text-zinc-500">· {c.scorecardId} · {c.items.length} change(s)</span></span>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
