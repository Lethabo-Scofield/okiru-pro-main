/**
 * The parser's browser-facing security posture, in one testable place.
 *
 * Kept out of server.ts because that module boots a listener on import, and a
 * policy nobody can write a test against is a policy that drifts.
 */
import type { HelmetOptions } from 'helmet';

/**
 * Who may call this service from a BROWSER.
 *
 * Nothing legitimately does. In every deployed environment `/api/parser/*` is
 * served on the web app's own host and proxied server-to-server by
 * apps/web/server/apiProxy.ts, so the browser's request is same-origin and
 * never subject to CORS at all; the PayFast ITN is server-to-server and carries
 * no Origin either. The one caller that genuinely needs cross-origin is a local
 * dev client running on another port.
 *
 * So the old default was backwards. `origin: true` reflects whatever Origin
 * asked, and paired with `credentials: true` that let ANY website make
 * credentialed requests to the parser and read the replies — quotes, extraction
 * results, everything — out of a visitor's browser.
 *
 *  - PARSER_ALLOWED_ORIGINS set  → exactly those origins, in any environment.
 *  - unset, production           → closed. No browser origin is allowed.
 *  - unset, anything else        → open, so local development still works.
 */
export function resolveCorsOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string[] | boolean {
  const configured = (env.PARSER_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  return env.NODE_ENV === 'production' ? false : true;
}

/**
 * Helmet options for a service that answers with JSON and server-sent events
 * only — no HTML, no static files, no templates.
 *
 * That makes `default-src 'none'` free: there is nothing legitimate for a
 * document context to load, so a response that somehow ended up rendered as one
 * could not fetch or execute anything. The header was disabled outright before,
 * which cost the protection without buying anything back.
 */
export function parserHelmetOptions(): HelmetOptions {
  return {
    contentSecurityPolicy: {
      // Without this, helmet MERGES its defaults over the directives below and
      // the served policy carries `script-src 'self'` and a `style-src` with
      // 'unsafe-inline' — sensible for an app that renders pages, but it means
      // the header no longer says what this one is here to say. Exactly four
      // directives, all of them denials, so the policy is auditable at a glance.
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    // Called by our own server, never embedded by a third party.
    crossOriginResourcePolicy: { policy: 'same-site' },
  };
}
