/**
 * Certificate / document numbering.
 *
 * Both exporters previously built their own number as
 *   `OKR-${year}-${Math.floor(Math.random() * 9999)}`
 * which meant:
 *   - downloading the same scorecard twice produced two different certificate
 *     numbers, so the number identified nothing;
 *   - the Certificate PDF and the Verification Report disagreed with each
 *     other about the number for one and the same measurement;
 *   - the verification report's "Doc No" (derived from it) inherited both
 *     problems.
 *
 * A certificate number has to be stable for a given entity and measurement
 * period, and identical across every document describing that measurement.
 * It is derived here, in one place, from inputs that do not change.
 */

/**
 * FNV-1a, 32-bit. Chosen for being tiny, dependency-free and deterministic
 * across runtimes — not for cryptographic strength, which is not wanted here.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash * 16777619 without overflowing into float territory
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface CertificateNumberInputs {
  /** Stable identifier for the entity. */
  clientId?: string | null;
  /** Falls back to the entity name when there is no id yet. */
  clientName?: string | null;
  /** The measurement this certificate describes. */
  financialYear?: string | null;
  measurementPeriodStart?: string | null;
  measurementPeriodEnd?: string | null;
}

/**
 * Deterministic certificate number for an entity + measurement period.
 *
 * Same inputs -> same number, every time, in every document.
 * Returns `OKR-<measurement year>-<4 digits>`.
 */
export function deriveCertificateNumber(inputs: CertificateNumberInputs): string {
  const identity = String(inputs.clientId || inputs.clientName || "unknown-entity").trim();
  const period = [
    String(inputs.financialYear ?? "").trim(),
    String(inputs.measurementPeriodStart ?? "").trim(),
    String(inputs.measurementPeriodEnd ?? "").trim(),
  ].join("|");

  // Year prefix follows the measurement, not the download date — a report
  // re-issued in January must not renumber the prior year's measurement.
  const yearFromPeriod =
    String(inputs.measurementPeriodEnd ?? "").match(/^(\d{4})/)?.[1]
    ?? String(inputs.financialYear ?? "").match(/(\d{4})/)?.[1]
    ?? String(new Date().getFullYear());

  const suffix = String(fnv1a(`${identity}::${period}`) % 10000).padStart(4, "0");
  return `OKR-${yearFromPeriod}-${suffix}`;
}
