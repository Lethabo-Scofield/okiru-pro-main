import { escapeHtml, escapeXml } from "./slug";
import type { CertificateRecord } from "./data";

const SITE_NAME = "Okiru";
const BRAND_TAGLINE = "B-BBEE Certificate Hub";

function siteOrigin(host: string | undefined, proto: string | undefined): string {
  const safeHost = host || "okiru-pro.com";
  const safeProto = proto || "https";
  return `${safeProto}://${safeHost}`;
}

function pageShell(opts: {
  title: string;
  description: string;
  canonical: string;
  jsonLd?: string;
  bodyHtml: string;
  origin: string;
}): string {
  const { title, description, canonical, jsonLd, bodyHtml, origin } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta name="robots" content="index,follow" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #ffffff; color: #1a1a1a; line-height: 1.55; }
a { color: #0a66c2; text-decoration: none; }
a:hover { text-decoration: underline; }
header.site { border-bottom: 1px solid #e5e7eb; background: #ffffff; }
header.site .inner { max-width: 1100px; margin: 0 auto; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
header.site .brand { font-weight: 700; font-size: 18px; color: #111; }
header.site nav a { margin-left: 18px; color: #4b5563; font-size: 14px; }
main { max-width: 1100px; margin: 0 auto; padding: 32px 24px 64px; }
h1 { font-size: 32px; line-height: 1.2; margin: 0 0 8px; color: #0f172a; }
h2 { font-size: 22px; margin: 28px 0 12px; color: #0f172a; }
.subtitle { color: #6b7280; margin: 0 0 24px; font-size: 16px; }
.meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 24px 0; }
.meta-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
.meta-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin: 0 0 4px; }
.meta-value { font-size: 17px; font-weight: 600; color: #0f172a; margin: 0; }
.btn { display: inline-block; background: #0f172a; color: #fff !important; padding: 12px 22px; border-radius: 8px; font-weight: 600; margin-top: 12px; }
.btn:hover { background: #1e293b; text-decoration: none; }
.cert-list { list-style: none; padding: 0; margin: 16px 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.cert-list li { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; }
.cert-list li h3 { margin: 0 0 6px; font-size: 17px; }
.cert-list li p { margin: 4px 0; color: #475569; font-size: 14px; }
.badge { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.related { margin-top: 36px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
footer.site { border-top: 1px solid #e5e7eb; padding: 24px; text-align: center; color: #64748b; font-size: 13px; }
.intro { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 22px; margin-bottom: 18px; color: #334155; }
</style>
${jsonLd ? `<script type="application/ld+json">${jsonLd.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--")}</script>` : ""}
</head>
<body>
<header class="site">
  <div class="inner">
    <a class="brand" href="${escapeHtml(origin)}/">${escapeHtml(SITE_NAME)} — ${escapeHtml(BRAND_TAGLINE)}</a>
    <nav>
      <a href="${escapeHtml(origin)}/certificates/level-1">Level 1</a>
      <a href="${escapeHtml(origin)}/certificates/level-2">Level 2</a>
      <a href="${escapeHtml(origin)}/certificates/black-owned">Black Owned</a>
      <a href="${escapeHtml(origin)}/certificates">Search Hub</a>
    </nav>
  </div>
</header>
<main>${bodyHtml}</main>
<footer class="site">© ${new Date().getFullYear()} ${escapeHtml(SITE_NAME)} · ${escapeHtml(BRAND_TAGLINE)}</footer>
</body>
</html>`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(1)}%`;
}

function fmtScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(1)}`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
}

function downloadHref(origin: string, blobName: string | null): string | null {
  if (!blobName) return null;
  return `${origin}/api/certificates/download?file=${encodeURIComponent(blobName)}&mode=redirect`;
}

export function renderCertificateDetail(
  cert: CertificateRecord,
  related: CertificateRecord[],
  host: string | undefined,
  proto: string | undefined,
): string {
  const origin = siteOrigin(host, proto);
  const canonical = `${origin}/certificates/${cert.slug}`;
  const levelText = cert.bbbeeLevel != null ? `Level ${cert.bbbeeLevel}` : "Level —";
  const title = `B-BBEE Certificate – ${cert.companyName} | ${levelText} | ${SITE_NAME}`;
  const description = `View and download the B-BBEE certificate for ${cert.companyName}. ${levelText}, issued by ${cert.verificationAgency || "an accredited verification agency"}, valid until ${fmtDate(cert.expiryDate)}.`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "DigitalDocument",
    name: `B-BBEE Certificate - ${cert.companyName}`,
    creator: cert.verificationAgency || undefined,
    dateValid: cert.expiryDate || undefined,
    identifier: cert.certificateNumber || undefined,
    url: canonical,
    about: {
      "@type": "Organization",
      name: cert.companyName,
    },
  });

  const dl = downloadHref(origin, cert.blobName);

  const relatedHtml = related.length
    ? `<section class="related">
        <h2>Related certificates</h2>
        <ul class="cert-list">
          ${related
            .map(
              (r) => `<li>
            <span class="badge">Level ${escapeHtml(r.bbbeeLevel ?? "—")}</span>
            <h3><a href="${escapeHtml(origin)}/certificates/${escapeHtml(r.slug)}">${escapeHtml(r.companyName)}</a></h3>
            <p>Score: ${escapeHtml(fmtScore(r.bbbeeScore))} · Black ownership: ${escapeHtml(fmtPct(r.blackOwnership))}</p>
            <p>Valid until ${escapeHtml(fmtDate(r.expiryDate))}</p>
          </li>`,
            )
            .join("\n")}
        </ul>
      </section>`
    : "";

  const body = `
  <article>
    <p><a href="${escapeHtml(origin)}/certificates">← All certificates</a></p>
    <span class="badge">B-BBEE ${escapeHtml(levelText)}</span>
    <h1>${escapeHtml(cert.companyName)}</h1>
    <p class="subtitle">B-BBEE compliance certificate, issued by ${escapeHtml(cert.verificationAgency || "an accredited verification agency")}.</p>

    <div class="meta-grid">
      <div class="meta-item"><p class="meta-label">B-BBEE Level</p><p class="meta-value">${escapeHtml(cert.bbbeeLevel ?? "—")}</p></div>
      <div class="meta-item"><p class="meta-label">B-BBEE Score</p><p class="meta-value">${escapeHtml(fmtScore(cert.bbbeeScore))}</p></div>
      <div class="meta-item"><p class="meta-label">Black Ownership</p><p class="meta-value">${escapeHtml(fmtPct(cert.blackOwnership))}</p></div>
      <div class="meta-item"><p class="meta-label">Black Women Ownership</p><p class="meta-value">${escapeHtml(fmtPct(cert.blackWomenOwnership))}</p></div>
      <div class="meta-item"><p class="meta-label">Verification Agency</p><p class="meta-value">${escapeHtml(cert.verificationAgency || "—")}</p></div>
      <div class="meta-item"><p class="meta-label">Certificate Number</p><p class="meta-value">${escapeHtml(cert.certificateNumber || "—")}</p></div>
      <div class="meta-item"><p class="meta-label">Issue Date</p><p class="meta-value">${escapeHtml(fmtDate(cert.issueDate))}</p></div>
      <div class="meta-item"><p class="meta-label">Expiry Date</p><p class="meta-value">${escapeHtml(fmtDate(cert.expiryDate))}</p></div>
    </div>

    ${dl ? `<a class="btn" href="${escapeHtml(dl)}" rel="nofollow">Download PDF certificate</a>` : `<p class="subtitle">PDF download is not currently available for this certificate.</p>`}

    <section style="margin-top:28px">
      <h2>About this B-BBEE certificate</h2>
      <p>This certificate confirms that <strong>${escapeHtml(cert.companyName)}</strong> achieved a B-BBEE contributor status of <strong>${escapeHtml(levelText)}</strong> with an overall score of <strong>${escapeHtml(fmtScore(cert.bbbeeScore))}</strong>. The verification was performed by ${escapeHtml(cert.verificationAgency || "an accredited verification agency")} and the certificate is valid until ${escapeHtml(fmtDate(cert.expiryDate))}.</p>
      <p>Black ownership is recorded at ${escapeHtml(fmtPct(cert.blackOwnership))} and Black women ownership at ${escapeHtml(fmtPct(cert.blackWomenOwnership))}, in line with the Codes of Good Practice.</p>
    </section>

    ${relatedHtml}
  </article>`;

  return pageShell({ title, description, canonical, jsonLd, bodyHtml: body, origin });
}

export function renderLevelPage(
  level: number,
  certs: CertificateRecord[],
  host: string | undefined,
  proto: string | undefined,
): string {
  const origin = siteOrigin(host, proto);
  const canonical = `${origin}/certificates/level-${level}`;
  const title = `Level ${level} B-BBEE Companies in South Africa | ${SITE_NAME}`;
  const description = `Browse verified B-BBEE Level ${level} companies in South Africa. View ownership stats, verification agencies and download official B-BBEE certificates on ${SITE_NAME}.`;

  const intro = `<div class="intro">
    <p>A <strong>Level ${level} B-BBEE</strong> contributor status is awarded under the South African Codes of Good Practice based on a company's overall scorecard performance across ownership, management control, skills development, enterprise &amp; supplier development and socio-economic development. Below is a curated, verifiable directory of organisations whose most recent B-BBEE certificates show a Level ${level} rating. Each entry links to the full certificate, including the verification agency, certificate number and expiry date.</p>
  </div>`;

  const list = certs.length
    ? `<ul class="cert-list">${certs
        .map(
          (c) => `<li>
        <span class="badge">Level ${escapeHtml(c.bbbeeLevel ?? "—")}</span>
        <h3><a href="${escapeHtml(origin)}/certificates/${escapeHtml(c.slug)}">${escapeHtml(c.companyName)}</a></h3>
        <p>Score ${escapeHtml(fmtScore(c.bbbeeScore))} · Black ownership ${escapeHtml(fmtPct(c.blackOwnership))}</p>
        <p>Verified by ${escapeHtml(c.verificationAgency || "—")}</p>
        <p>Valid until ${escapeHtml(fmtDate(c.expiryDate))}</p>
      </li>`,
        )
        .join("\n")}</ul>`
    : `<p>No Level ${level} certificates are currently published. Please check back soon.</p>`;

  const body = `
    <h1>Level ${escapeHtml(level)} B-BBEE Companies</h1>
    <p class="subtitle">Verified Level ${escapeHtml(level)} B-BBEE certificates indexed on ${escapeHtml(SITE_NAME)}.</p>
    ${intro}
    <h2>Certificates (${certs.length})</h2>
    ${list}
  `;

  return pageShell({ title, description, canonical, bodyHtml: body, origin });
}

export function renderBlackOwnedPage(
  certs: CertificateRecord[],
  host: string | undefined,
  proto: string | undefined,
): string {
  const origin = siteOrigin(host, proto);
  const canonical = `${origin}/certificates/black-owned`;
  const title = `Black Owned Companies in South Africa – B-BBEE Certificates | ${SITE_NAME}`;
  const description = `Discover Black-owned South African companies with verified B-BBEE certificates. Each listing shows ownership percentages, B-BBEE level and verification details.`;

  const intro = `<div class="intro">
    <p>South Africa's <strong>Black Economic Empowerment</strong> framework recognises companies whose Black ownership is at least 51%. The companies below have current B-BBEE certificates indicating qualifying Black ownership. Each entry shows the verified ownership percentage, B-BBEE level, verification agency and certificate validity, and links through to the full certificate page where the original PDF can be downloaded.</p>
  </div>`;

  const list = certs.length
    ? `<ul class="cert-list">${certs
        .map(
          (c) => `<li>
        <span class="badge">Level ${escapeHtml(c.bbbeeLevel ?? "—")}</span>
        <h3><a href="${escapeHtml(origin)}/certificates/${escapeHtml(c.slug)}">${escapeHtml(c.companyName)}</a></h3>
        <p>Black ownership ${escapeHtml(fmtPct(c.blackOwnership))} · Black women ${escapeHtml(fmtPct(c.blackWomenOwnership))}</p>
        <p>Verified by ${escapeHtml(c.verificationAgency || "—")}</p>
        <p>Valid until ${escapeHtml(fmtDate(c.expiryDate))}</p>
      </li>`,
        )
        .join("\n")}</ul>`
    : `<p>No Black-owned certificates are currently published. Please check back soon.</p>`;

  const body = `
    <h1>Black Owned Companies</h1>
    <p class="subtitle">B-BBEE certificates from companies with 51%+ Black ownership.</p>
    ${intro}
    <h2>Certificates (${certs.length})</h2>
    ${list}
  `;

  return pageShell({ title, description, canonical, bodyHtml: body, origin });
}

export function renderNotFound(
  host: string | undefined,
  proto: string | undefined,
  message = "Certificate not found",
): string {
  const origin = siteOrigin(host, proto);
  const body = `
    <h1>${escapeHtml(message)}</h1>
    <p class="subtitle">We couldn't find the certificate you're looking for.</p>
    <p><a href="${escapeHtml(origin)}/certificates">Back to the Certificate Hub</a></p>
  `;
  return pageShell({
    title: `${message} | ${SITE_NAME}`,
    description: message,
    canonical: `${origin}/certificates`,
    bodyHtml: body,
    origin,
  });
}

export function renderSitemap(
  certs: CertificateRecord[],
  host: string | undefined,
  proto: string | undefined,
): string {
  const origin = siteOrigin(host, proto);
  const today = new Date().toISOString().slice(0, 10);

  const staticUrls = [
    { loc: `${origin}/`, priority: "1.0", changefreq: "weekly" },
    { loc: `${origin}/certificates`, priority: "0.9", changefreq: "daily" },
    { loc: `${origin}/certificates/level-1`, priority: "0.8", changefreq: "daily" },
    { loc: `${origin}/certificates/level-2`, priority: "0.8", changefreq: "daily" },
    { loc: `${origin}/certificates/level-3`, priority: "0.7", changefreq: "weekly" },
    { loc: `${origin}/certificates/level-4`, priority: "0.7", changefreq: "weekly" },
    { loc: `${origin}/certificates/black-owned`, priority: "0.8", changefreq: "daily" },
  ];

  const certUrls = certs.map((c) => ({
    loc: `${origin}/certificates/${c.slug}`,
    priority: "0.7",
    changefreq: "weekly",
    lastmod: c.updatedAt || today,
  }));

  const urlEntries = [
    ...staticUrls.map(
      (u) => `<url><loc>${escapeXml(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority><lastmod>${today}</lastmod></url>`,
    ),
    ...certUrls.map(
      (u) => `<url><loc>${escapeXml(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority><lastmod>${escapeXml(u.lastmod)}</lastmod></url>`,
    ),
  ].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

export function renderRobots(host: string | undefined, proto: string | undefined): string {
  const origin = siteOrigin(host, proto);
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth
Disallow: /admin/

Sitemap: ${origin}/sitemap.xml
`;
}
