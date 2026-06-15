/**
 * Derive gender from a South African ID number (13 digits).
 * Digit 7 (index 6): 0–4 = Female, 5–9 = Male.
 */
export function deriveGenderFromSaId(id: unknown): "Male" | "Female" | null {
  const digits = String(id ?? "").replace(/\D/g, "");
  if (digits.length !== 13) return null;
  const genderDigit = Number(digits[6]);
  if (!Number.isFinite(genderDigit)) return null;
  return genderDigit < 5 ? "Female" : "Male";
}
