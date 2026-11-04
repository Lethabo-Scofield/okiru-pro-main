/**
 * Studio UI smoke tests. jsdom is not usable in this workspace, so these render to static
 * markup (react-dom/server): they prove every screen mounts without throwing, shows its
 * accessible landmarks, and that the pure helpers format values and errors correctly.
 * Behaviour (clicks, step-up, publish) is covered by the API acceptance and route tests.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import { formatValue, explainError, StudioApiError, UNIT_LABEL } from '@/lib/studioApi';
import { Page, Panel, StatusBadge, VerdictBadge, fmtDate, short } from '../kit';
import Overview from '../Overview';
import Workspace from '../Workspace';
import { Describe, Impact } from '../DescribeAndImpact';
import { Review, Versions } from '../ReviewAndVersions';
import { ChangeRequests, Rulings, Notes, Activity, Notifications } from '../Lists';
import StudioApp from '../StudioApp';

const render = (node: React.ReactNode, path = '/studio') => renderToStaticMarkup(<Router ssrPath={path}>{node}</Router>);

describe('Studio helpers', () => {
  it('formats stored values by unit (fractions as %, percents as-is, points plain)', () => {
    expect(formatValue(0.25, 'fraction')).toBe('25%');
    expect(formatValue(0.03, 'factor')).toBe('3%');
    expect(formatValue(3.5, 'percent')).toBe('3.5%');
    expect(formatValue(8, 'points')).toBe('8');
    expect(formatValue(undefined, 'points')).toBe('-');
    expect(Object.keys(UNIT_LABEL)).toEqual(['fraction', 'percent', 'points', 'factor']);
  });

  it('explains API errors, listing the failed publishing checks', () => {
    const e = new StudioApiError(422, 'checks_failed', 'Cannot publish', { checks: [{ ok: true, id: 'a', detail: 'ok' }, { ok: false, id: 'independent-approval', detail: '0 of 1 required' }] });
    expect(explainError(e)).toContain('independent-approval: 0 of 1 required');
    expect(explainError(new Error('boom'))).toBe('boom');
    expect(explainError('weird')).toBe('Something went wrong');
  });

  it('formats dates and hashes defensively', () => {
    expect(fmtDate(null)).toBe('-');
    expect(short('abcdef0123456789')).toBe('abcdef0123');
    expect(short(undefined)).toBe('-');
  });
});

describe('Studio building blocks', () => {
  it('Page exposes a labelled region with a heading', () => {
    const html = render(<Page title="Overview" subtitle="Sub">x</Page>);
    expect(html).toContain('aria-labelledby="page-title"');
    expect(html).toContain('<h1 id="page-title"');
  });

  it('badges carry text, not just colour', () => {
    expect(render(<VerdictBadge verdict="unexplained" />)).toContain('unexplained');
    expect(render(<StatusBadge status="changes_requested" />)).toContain('changes requested');
    expect(render(<Panel tone="danger" title="Heads up">body</Panel>)).toContain('Heads up');
  });
});

describe('Studio screens mount', () => {
  const screens: Array<[string, React.ReactNode]> = [
    ['Overview', <Overview />],
    ['Workspace', <Workspace sid="rcogp-generic" />],
    ['Describe', <Describe sid="rcogp-generic" />],
    ['Impact', <Impact sid="rcogp-generic" runId="r1" />],
    ['Review', <Review />],
    ['Versions', <Versions />],
    ['ChangeRequests', <ChangeRequests />],
    ['Rulings', <Rulings />],
    ['Notes', <Notes />],
    ['Activity', <Activity />],
    ['Notifications', <Notifications />],
  ];
  it.each(screens)('%s renders without throwing', (_name, node) => {
    expect(() => render(node)).not.toThrow();
  });

  it('the app shell has navigation landmarks and a skip link, and never renders Studio content before access is known', () => {
    const html = render(<StudioApp />);
    expect(html).toContain('aria-label="Rules Studio"');
    expect(html).toContain('Skip to content');
    expect(html).toContain('id="studio-main"');
    expect(html).not.toContain('Open drafts');
  });
});
