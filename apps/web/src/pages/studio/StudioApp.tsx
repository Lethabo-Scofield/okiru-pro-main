import { Link, Route, Switch, useLocation } from 'wouter';
import { useStudio, Loading, Panel } from './kit';
import Overview from './Overview';
import Workspace from './Workspace';
import { Describe, Impact } from './DescribeAndImpact';
import { Review, Versions } from './ReviewAndVersions';
import { ChangeRequests, Rulings, Notes, Activity, Notifications } from './Lists';

const NAV: Array<[string, string]> = [
  ['/studio', 'Rules'], ['/studio/review', 'Pending approvals'], ['/studio/activity', 'Logs'],
];

function Shell({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  return (
    <div className="studio-light min-h-screen bg-white text-zinc-900">
      <style>{`
        .studio-light { color-scheme: light; }
        body:has(.studio-light), #root:has(.studio-light) { background-color: #ffffff !important; color: #18181b !important; }
        .studio-light, .studio-light main, .studio-light section { background-color: #ffffff !important; color: #18181b; }
        .studio-light .bg-zinc-950, .studio-light .bg-zinc-900 { background-color: #ffffff !important; }
        .studio-light .text-zinc-100 { color: #18181b !important; }
        .studio-light input, .studio-light textarea, .studio-light select { background-color: #ffffff !important; color: #18181b !important; border-color: #d4d4d8 !important; }
      `}</style>
      <a href="#studio-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-white focus:p-2">Skip to content</a>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
        <nav aria-label="Rules Studio" className="md:w-56 md:shrink-0">
          <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Okiru Rules Studio</p>
          <ul className="space-y-1">
            {NAV.map(([href, label]) => (
              <li key={href}><Link href={href} aria-current={loc === href ? 'page' : undefined}
                style={loc === href ? { backgroundColor: '#18181b', color: '#ffffff' } : undefined}
                className={`block rounded px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${loc === href ? '' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'}`}>{label}</Link></li>
            ))}
          </ul>
          <Link href="/hub" className="mt-4 block text-xs text-zinc-500 underline dark:text-zinc-400">Back to Okiru</Link>
        </nav>
        <main id="studio-main" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/** Rules Studio. Visible only to users holding a Studio grant; the server enforces every action regardless. */
export default function StudioApp() {
  const access = useStudio<any>('/access');
  if (access.loading) return <Shell><Loading /></Shell>;
  if (access.error || !access.data?.hasAccess) {
    return (
      <Shell>
        <Panel tone="warn" title="No access to the Rules Studio">
          <p className="text-sm">The Rules Studio is limited to authorised B-BBEE experts, reviewers and administrators. Ask an Okiru administrator for a Studio grant.</p>
        </Panel>
      </Shell>
    );
  }
  return (
    <Shell>
      <Switch>
        <Route path="/studio" component={Overview} />
        <Route path="/studio/review" component={Review} />
        <Route path="/studio/versions" component={Versions} />
        <Route path="/studio/change-requests" component={ChangeRequests} />
        <Route path="/studio/rulings" component={Rulings} />
        <Route path="/studio/notes" component={Notes} />
        <Route path="/studio/activity" component={Activity} />
        <Route path="/studio/notifications" component={Notifications} />
        <Route path="/studio/s/:sid">{(p: any) => <Workspace sid={p.sid} />}</Route>
        <Route path="/studio/s/:sid/describe">{(p: any) => <Describe sid={p.sid} />}</Route>
        <Route path="/studio/s/:sid/impact/:runId">{(p: any) => <Impact sid={p.sid} runId={p.runId} />}</Route>
        <Route><Panel title="Not found"><p className="text-sm">That Studio page does not exist.</p></Panel></Route>
      </Switch>
    </Shell>
  );
}
