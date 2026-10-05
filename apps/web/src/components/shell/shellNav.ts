/**
 * What the shell knows about where you are.
 *
 * Kept as data, and kept away from React, so the rail, the breadcrumbs and the
 * tests all read the same source. Every path here is absolute: the shell mounts
 * outside the nested toolkit routers precisely so it can reason in absolute
 * terms while they reason in their own.
 */

export interface ShellNavItem {
  /** Stable id, also the test id suffix. */
  id: string;
  label: string;
  href: string;
  /** Icon name from lucide, resolved by the rail. */
  icon: string;
  /** Shown only to platform staff. */
  adminOnly?: boolean;
  /** Hidden when the viewer has no ESG access. */
  esgOnly?: boolean;
}

export interface ShellNavSection {
  id: string;
  label: string;
  items: ShellNavItem[];
}

export const SHELL_NAV: ShellNavSection[] = [
  {
    id: 'products',
    label: 'Products',
    items: [
      { id: 'bbbee', label: 'B-BBEE', href: '/bbbee', icon: 'Award' },
      { id: 'esg', label: 'ESG', href: '/esg', icon: 'Leaf', esgOnly: true },
    ],
  },
  {
    id: 'suite',
    label: 'Suite',
    items: [
      { id: 'hub', label: 'Hub', href: '/hub', icon: 'Grid3X3' },
      { id: 'documents', label: 'Documents', href: '/documents', icon: 'FolderOpen' },
      { id: 'certificates', label: 'Certificates', href: '/certificates', icon: 'ShieldCheck' },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'access', label: 'People & access', href: '/access', icon: 'Users' },
      { id: 'settings', label: 'Settings', href: '/settings', icon: 'Settings' },
    ],
  },
];

/**
 * Routes that draw their own full-screen chrome and must not get a second set.
 *
 * The two toolkits each own a sidebar and a header of their own, and the
 * sign-in and marketing screens are not part of the signed-in product at all.
 */
const BARE_PREFIXES = [
  '/toolkit',
  '/esg/toolkit',
  '/auth',
  '/onboarding',
  '/invite',
  '/devmode',
  '/super-admin',
  '/builder',
  '/processor',
  '/products',
];

const BARE_EXACT = new Set(['/', '/about', '/contact', '/privacy', '/terms']);

/** True when the shell should render the page alone, with no rail and no bar. */
export function isBareRoute(path: string): boolean {
  const clean = path.split('?')[0].split('#')[0];
  if (BARE_EXACT.has(clean)) return true;
  return BARE_PREFIXES.some((p) => clean === p || clean.startsWith(`${p}/`));
}

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The trail for a path, read left to right.
 *
 * Breadcrumbs describe where a page SITS, which is the question "how do I get
 * back" really asks. The app used to answer it from a session key written by
 * whoever navigated last, so the same page offered different ways back
 * depending on how you arrived — and offered the wrong one entirely after a
 * refresh, or in a new tab.
 */
export function buildCrumbs(path: string, companyName?: string | null): Crumb[] {
  const clean = path.split('?')[0].split('#')[0];
  const seg = clean.split('/').filter(Boolean);
  const root: Crumb = { label: 'Hub', href: '/hub' };
  if (seg.length === 0 || seg[0] === 'hub') return [{ label: 'Hub' }];

  const company = (id?: string): Crumb => ({
    label: companyName || (id ? decodeURIComponent(id) : 'Company'),
  });

  switch (seg[0]) {
    case 'bbbee':
      if (seg[1] === 'new') {
        return [root, { label: 'B-BBEE', href: '/bbbee' }, { label: 'New scorecard' }];
      }
      // A company's document library sits under the company, under the product.
      if (seg[2] === 'documents') {
        return [root, { label: 'B-BBEE', href: '/bbbee' }, company(seg[1]), { label: 'Documents' }];
      }
      return [root, { label: 'B-BBEE' }];

    case 'dashboard':
      return [root, { label: 'Saved companies' }];

    case 'esg':
      if (seg[1] === 'new') {
        return [root, { label: 'ESG', href: '/esg' }, { label: 'New scorecard' }];
      }
      if (seg[1] === 'clients') return [root, { label: 'ESG' }];
      if (seg[2] === 'documents') {
        return [root, { label: 'ESG', href: '/esg' }, company(seg[1]), { label: 'Documents' }];
      }
      if (seg[1] === 'create') {
        const tail: Crumb[] = [root, { label: 'ESG', href: '/esg' }, company(seg[2])];
        if (seg[3] === 'summary') tail.push({ label: 'Summary' });
        else tail.push({ label: 'Workbook' });
        return tail;
      }
      return [root, { label: 'ESG' }];

    case 'create-scorecard': {
      const base: Crumb[] = [root, { label: 'B-BBEE', href: '/bbbee' }];
      if (!seg[1]) return [...base, { label: 'New scorecard' }];
      base.push(company(seg[1]));
      if (seg[2] === 'summary') base.push({ label: 'Summary' });
      else if (seg[2] === 'estimate') base.push({ label: 'Estimate' });
      else base.push({ label: 'Workbook' });
      return base;
    }

    case 'documents':
      if (seg[1] === 'unfiled') {
        return [root, { label: 'Documents', href: '/documents' }, { label: 'Not filed' }];
      }
      return seg[1]
        ? [root, { label: 'Documents', href: '/documents' }, { label: 'Document' }]
        : [root, { label: 'Documents' }];

    case 'certificates':
      return seg[1]
        ? [root, { label: 'Certificates', href: '/certificates' }, { label: 'Certificate' }]
        : [root, { label: 'Certificates' }];

    case 'access':
    case 'workspace':
      return [root, { label: 'People & access' }];

    case 'settings':
      return [root, { label: 'Settings' }];

    case 'company-profile':
      return [root, { label: 'Company profile' }];

    case 'admin':
      return [root, { label: 'Admin' }, { label: seg[1] ?? '' }].filter((c) => c.label);

    default:
      return [root, { label: seg[0] }];
  }
}

/** The rail item that should read as current for a path. */
export function activeNavId(path: string): string | null {
  const clean = path.split('?')[0].split('#')[0];
  const seg = clean.split('/').filter(Boolean);
  if (seg.length === 0 || seg[0] === 'hub') return 'hub';
  if (seg[0] === 'bbbee' || seg[0] === 'create-scorecard' || seg[0] === 'dashboard') return 'bbbee';
  if (seg[0] === 'esg') return 'esg';
  if (seg[0] === 'documents') return 'documents';
  if (seg[0] === 'certificates') return 'certificates';
  if (seg[0] === 'access' || seg[0] === 'workspace') return 'access';
  if (seg[0] === 'settings') return 'settings';
  return null;
}
