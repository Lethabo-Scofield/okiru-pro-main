/**
 * Microsoft Clarity — session recordings and heatmaps, switched on at runtime.
 *
 * The project id comes from the CLARITY_PROJECT_ID environment variable and is
 * injected into index.html as the page is served, so turning Clarity on (or
 * off) is a pod restart, not a rebuild. Unset or malformed means no snippet at
 * all: nothing loads from clarity.ms and nothing is recorded.
 *
 * Privacy is enforced in the page, not in the Clarity dashboard: index.html
 * marks <body> with data-clarity-mask="True", which masks every piece of text
 * in recordings and heatmaps — ID numbers, salaries, shareholder names and the
 * documents themselves included. A dashboard setting can be changed by anyone
 * with access to it; the attribute ships with the code.
 */

/** Clarity project ids are short lowercase alphanumerics (e.g. "k2x9abc1de"). */
const PROJECT_ID = /^[a-z0-9]{6,20}$/i;

export function clarityProjectId(raw: string | undefined | null): string | null {
  const id = (raw ?? "").trim();
  return PROJECT_ID.test(id) ? id : null;
}

/** Clarity's own loader, verbatim apart from the validated id. */
export function claritySnippet(projectId: string): string {
  return (
    `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};` +
    `t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;` +
    `y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);` +
    `})(window,document,"clarity","script","${projectId}");</script>`
  );
}

/** The served index.html: Clarity's loader placed just before </head> when enabled. */
export function withClarity(indexHtml: string, rawProjectId: string | undefined | null): string {
  const projectId = clarityProjectId(rawProjectId);
  if (!projectId) return indexHtml;
  const at = indexHtml.indexOf("</head>");
  if (at === -1) return indexHtml;
  return indexHtml.slice(0, at) + claritySnippet(projectId) + "\n  " + indexHtml.slice(at);
}
