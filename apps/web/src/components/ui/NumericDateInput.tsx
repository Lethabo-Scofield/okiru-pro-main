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
    const [invalid, setInvalid] = React.useState(false);

    React.useEffect(() => {
      setDisplay(isoToNumericDateDisplay(value));
      setInvalid(false);
    }, [value]);

    const commit = (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setInvalid(false);
        onChange("");
        return;
      }
      const iso = numericDateDisplayToIso(trimmed);
      if (iso) {
        setInvalid(false);
        onChange(iso);
      } else {
        setInvalid(true);
      }
    };

    return (
      <>
        <input
          {...rest}
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
          onBlur={(e) => {
            commit(e.target.value);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(display);
            }
          }}
          aria-invalid={invalid || undefined}
          className={cn(className)}
        />
        {invalid && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            Enter a valid date as dd/mm/yyyy.
          </p>
        )}
      </>
    );
  },
);
