import { describe, expect, it } from "vitest";
import { isIndexableCertificate, type CertificateRecord } from "../data";
import { renderSitemap } from "../templates";

function certificate(overrides: Partial<CertificateRecord> = {}): CertificateRecord {
  return {
    slug: "acme-123",
    companyName: "Acme (Pty) Ltd",
    bbbeeLevel: 2,
    bbbeeScore: null,
    blackOwnership: 51,
    blackWomenOwnership: null,
    verificationAgency: null,
    certificateNumber: "CERT-123",
    expiryDate: "2027-06-30",
    issueDate: null,
    blobName: null,
    status: "valid",
    updatedAt: "2026-08-04T12:30:00.000Z",
    verified: true,
    metadataComplete: true,
    ...overrides,
  };
}

describe("isIndexableCertificate", () => {
  const now = new Date("2026-08-07T12:00:00.000Z");

  it("accepts a complete, verified, current certificate", () => {
    expect(isIndexableCertificate(certificate(), now)).toBe(true);
  });

  it.each([
    ["missing slug", { slug: "" }],
    ["missing company", { companyName: "" }],
    ["missing level", { bbbeeLevel: null }],
    ["expired status", { status: "expired" as const }],
    ["incomplete metadata", { metadataComplete: false }],
    ["unverified metadata", { verified: false }],
    ["past expiry date", { expiryDate: "2026-08-06" }],
  ])("rejects %s", (_label, overrides) => {
    expect(isIndexableCertificate(certificate(overrides), now)).toBe(false);
  });

  it("keeps a certificate indexable through its expiry date", () => {
    expect(isIndexableCertificate(certificate({ expiryDate: "2026-08-07" }), now)).toBe(true);
  });
});

describe("renderSitemap", () => {
  it("renders canonical public pages, backed directories, and certificate lastmod", () => {
    const xml = renderSitemap([certificate()], "app.okiru.co.za", "https");

    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://app.okiru.co.za/products/bbbee-toolkit</loc>");
    expect(xml).toContain("<loc>https://app.okiru.co.za/certificates/level-2</loc>");
    expect(xml).toContain("<loc>https://app.okiru.co.za/certificates/black-owned</loc>");
    expect(xml).toContain("<loc>https://app.okiru.co.za/certificates/acme-123</loc>");
    expect(xml).toContain("<lastmod>2026-08-04</lastmod>");
    expect(xml).not.toContain("/certificates/level-1</loc>");
  });

  it("omits empty directories and invalid certificate lastmod values", () => {
    const xml = renderSitemap(
      [certificate({ blackOwnership: 20, updatedAt: "not-a-date" })],
      "app.okiru.co.za",
      "https",
    );

    expect(xml).not.toContain("/certificates/black-owned</loc>");
    const certificateEntry = xml.match(/<url><loc>https:\/\/app\.okiru\.co\.za\/certificates\/acme-123<\/loc>.*?<\/url>/)?.[0];
    expect(certificateEntry).toBeDefined();
    expect(certificateEntry).not.toContain("<lastmod>");
  });

  it("escapes XML-sensitive host content", () => {
    const xml = renderSitemap([], "example.com?a=1&b=2", "https");
    expect(xml).toContain("https://example.com?a=1&amp;b=2/");
  });
});
