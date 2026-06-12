import * as React from "react";
import { cn } from "@/lib/utils";
import {
  isoToNumericDateDisplay,
  numericDateDisplayToIso,
} from "@/lib/numericDateInput";

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  /** Stored value: yyyy-mm-dd or dd/mm/yyyy */
  value: string;
  onChange: (isoValue: string) => void;
};

/**
 * Date input using dd/m/yyyy text entry (numeric month — never "Jan").
 * Persists canonical yyyy-mm-dd via onChange.
 */
export const NumericDateInput = React.forwardRef<HTMLInputElement, Props>(
  function NumericDateInput(
    {
      value,
      onChange,
      className,
      disabled,
      placeholder = "dd/mm/yyyy",
      onBlur,
      ...rest
    },
    ref,
  ) {
    const [display, setDisplay] = React.useState(() => isoToNumericDateDisplay(value));
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
      setDisplay(isoToNumericDateDisplay(value));
      setError(null);
    }, [value]);

    const commit = (raw: string): boolean => {
      const trimmed = raw.trim();
      if (!trimmed) {
        onChange("");
        setError(null);
        return true;
      }
      const iso = numericDateDisplayToIso(trimmed);
      if (iso) {
        onChange(iso);
        setDisplay(isoToNumericDateDisplay(iso));
        setError(null);
        return true;
      }
      setError("Enter a valid date as dd/mm/yyyy.");
      return false;
    };

    return (
      <span className="block">
        <input
          {...rest}
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={display}
          aria-invalid={error ? true : rest["aria-invalid"]}
          onChange={(e) => {
            setDisplay(e.target.value);
            if (error) setError(null);
          }}
          onBlur={(e) => {
            commit(e.target.value);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(display);
            }
          }}
          className={cn(className)}
        />
        {error ? (
          <span role="alert" className="mt-1 block text-xs text-destructive">
            {error}
          </span>
        ) : null}
      </span>
    );
  },
);
