# Security disclosure pack

`build_security_disclosure.cjs` builds
`Okiru_Security_and_POPIA_Disclosure.pdf` — the vendor due-diligence pack we
hand to a client's IT function. Content lives in `security_disclosure.json`;
the generator only lays it out.

    node docs/security/build_security_disclosure.cjs [outPath]

## The rule for this document

Every statement must be verified against the live system before it goes in. A
security disclosure gets tested: the reader asks for a restore, requests the
sub-processor list, and checks whether the region you claimed is the region the
resource is actually in. One overstatement and the whole document is treated as
marketing.

It states gaps as plainly as controls, in section 9, with a risk rating and a
remediation. A due-diligence reader who finds an unlisted gap assumes there are
others; a reader who sees them listed is being given something they can assess.

**Re-verify before each reissue.** The v1.0 content was read off production on
16 September 2026 — Azure resource configuration, the AKS cluster, deployed
configuration key names, the backup store and the source repository.
