---
name: SPA GA4 tracking
description: Avoiding duplicate page_view events in a single-page app using gtag.js
---
When a SPA sends its own `page_view` on every route change (e.g. a wouter
`useLocation` effect), the gtag.js `config` call in the HTML head must pass
`{ send_page_view: false }`. Otherwise the automatic page_view from `config`
plus the tracker's first-render event double-counts the initial page load.

**Why:** gtag `config` fires an automatic page_view by default; the manual
tracker also fires on mount.
**How to apply:** one owner of page_view — either suppress gtag's automatic one
and let the SPA tracker send all of them, or keep gtag's and skip the tracker's
first emit.
