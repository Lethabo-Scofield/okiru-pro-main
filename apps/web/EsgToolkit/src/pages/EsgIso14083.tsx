/** ISO_14083 — reporting-only; excluded from E_Data GHG totals. */
export default function EsgIso14083() {
  return (
    <div className="space-y-4" data-testid="esg-iso-14083">
      <h1 className="text-[22px] font-semibold text-[var(--esg-text)]">ISO 14083</h1>
      <div className="esg-glass p-5 border-l-2 border-[var(--esg-acc-blue)]">
        <p className="text-[13px] text-[var(--esg-text2)]">
          Freight GHG reporting (ISO 14083) is a <strong className="text-[var(--esg-text)]">parallel track</strong> for
          disclosure. Values are not added to E_Data Scope 1+2 totals or Validation cross-checks in v1.7.
        </p>
      </div>
      <p className="text-[12px] text-[var(--esg-text3)]">
        Use Fleet_Register and ISO_14083 sheet for transport intensity reporting only.
      </p>
    </div>
  );
}
