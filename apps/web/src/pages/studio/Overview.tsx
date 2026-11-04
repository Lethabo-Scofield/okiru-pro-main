import { Link } from 'wouter';
import { Panel, Page, useStudio, Loading, ErrorNote, StatusBadge, fmtDate } from './kit';

/** 14.1 Overview: what is live, what is frozen, what is waiting for review, are backups healthy. */
export default function Overview() {
  const access = useStudio<any>('/access');
  const cards = useStudio<any>('/scorecards');
  const drafts = useStudio<any>('/changesets');
  const backups = useStudio<any>('/backups/status');
  const heads = useStudio<any>('/notifications');
  const readiness = useStudio<any>('/readiness');

  if (access.loading || cards.loading) return <Loading />;
  const open = (drafts.data?.changesets ?? []).filter((c: any) => ['draft', 'submitted', 'approved', 'changes_requested'].includes(c.status));

  return (
    <Page title="Overview" subtitle="Controlled changes to the scoring rules. Nothing here changes live scoring until it is reviewed, approved, backed up and published.">
      <ErrorNote message={access.error || cards.error} />
      {access.data && !access.data.launched && (
        <Panel tone="warn" title="Publishing is not launched">
          <p className="text-sm">The Studio is running in rehearsal: published rules are not served to clients yet (<code>RULES_LAUNCHED=false</code>). Drafts, impact runs and reviews all work.</p>
        </Panel>
      )}
      {access.data && !access.data.protectedPublishing && (
        <Panel tone="danger" title="Protected publishing is unavailable">
          <p className="text-sm">A signing key and an off-site backup store are both required before anything can be published. Nothing can go live until they are configured.</p>
        </Panel>
      )}
      {backups.data?.stale && (
        <Panel tone="warn" title="Backups need attention">
          <p className="text-sm">No verified backup in the last 36 hours. Last verified: {fmtDate(backups.data.lastVerifiedSnapshotAt)}.</p>
        </Panel>
      )}
      {(heads.data?.deliveryProblems?.length ?? 0) > 0 && (
        <Panel tone="danger" title="Alarm delivery problems">
          <p className="text-sm">{heads.data.deliveryProblems.length} alarm(s) could not be delivered to the webhook. See <Link href="/studio/notifications" className="underline">Notifications</Link>.</p>
        </Panel>
      )}

      {readiness.data && (
        <Panel title={readiness.data.productionReady ? 'Launch readiness: ready for production' : readiness.data.rehearsal ? 'Launch readiness: REHEARSAL (not production)' : 'Launch readiness: not ready'} tone={readiness.data.productionReady ? 'ok' : 'warn'}>
          <p className="mb-2 text-xs text-zinc-600">Published rules are only served to clients when every blocker is green and RULES_LAUNCHED is true. Today the API is serving: <strong>{readiness.data.effectiveLaunched ? 'published rules' : 'the shipped rules'}</strong>.</p>
          <ul className="space-y-1 text-sm">
            {readiness.data.checks.map((c: any) => (
              <li key={c.id}><span aria-hidden>{c.ok ? '✓' : c.severity === 'blocker' ? '✗' : '!'}</span> <span className="sr-only">{c.ok ? 'ok' : c.severity}</span> <strong>{c.label}</strong>
                {!c.ok && <span className="block text-xs text-zinc-600">{c.detail} — {c.fix}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Scorecards">
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
