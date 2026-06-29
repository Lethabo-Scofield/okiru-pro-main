import { useState, useCallback } from "react";

/**
 * Minimal inline-field-error helper used by the Toolkit pillar forms. Replaces
 * the toast-only validation flagged across the audit (A12, B16). Forms call
 * `set('name', true)` (or `setMany({ name: true, shares: true })`) when their
 * handler detects an invalid field, then spread `props('name')` onto the input.
 *
 *   const errs = useFieldErrors();
 *   const onSave = () => {
 *     if (!form.name.trim()) { errs.set('name', true); return; }
 *     ...
 *   };
 *   <Input {...errs.props('name')} value={form.name} onChange={(e) => {
 *     setForm({ ...form, name: e.target.value });
 *     errs.clear('name');
 *   }} />
 *   {errs.has('name') && <FieldError id="name-error">Name is required.</FieldError>}
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const set = useCallback((key: string, on = true) => {
    setErrors((prev) => (prev[key] === on ? prev : { ...prev, [key]: on }));
  }, []);

  const setMany = useCallback((patch: Record<string, boolean>) => {
    setErrors((prev) => ({ ...prev, ...patch }));
  }, []);

  const clear = useCallback((key: string) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  const has = useCallback((key: string) => Boolean(errors[key]), [errors]);

  const any = Object.values(errors).some(Boolean);

  /**
   * Props to spread onto an Input/Select: `aria-invalid` + a className that
   * paints a destructive border when the field is errored, plus an
   * `aria-describedby` pointing at the matching <FieldError id> (if present).
   */
  const props = useCallback((key: string) => ({
    "aria-invalid": has(key) || undefined,
    "aria-describedby": has(key) ? `${key}-error` : undefined,
    className: has(key) ? "border-destructive focus-visible:ring-destructive" : undefined,
  }), [has]);

  return { errors, set, setMany, clear, reset, has, any, props };
}
