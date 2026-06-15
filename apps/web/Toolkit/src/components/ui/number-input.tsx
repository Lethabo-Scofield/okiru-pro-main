import * as React from "react";

import { Input } from "@toolkit/components/ui/input";

type BaseInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
>;

export interface NumberInputProps extends BaseInputProps {
  /** The numeric value. `undefined`/`0` render as an empty field (see `zeroAsEmpty`). */
  value: number | undefined | null;
  /** Called with the parsed number on every valid edit. Empty input emits 0. */
  onValueChange: (value: number) => void;
  /**
   * Render 0 as an empty field so the input isn't permanently stuck showing "0"
   * (the root cause of the "can't type / have to click 3 times" reports). When a
   * literal 0 is a meaningful entry you want to display, set this to false.
   */
  zeroAsEmpty?: boolean;
}

/**
 * Controlled numeric input that allows free typing.
 *
 * A naive `<Input type="number" value={n} onChange={e => set(Number(e.target.value))}>`
 * binds the field to a number that defaults to 0, so the field shows a stuck "0"
 * the user must delete before any digit registers — and intermediate states like
 * "" or "1." get coerced away mid-keystroke. This component keeps a local string
 * buffer while the field is focused so every keystroke is preserved, then emits the
 * parsed number to the parent. On blur the buffer is dropped and the canonical
 * numeric value is shown.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, zeroAsEmpty = true, onBlur, inputMode, ...props }, ref) => {
    const [buffer, setBuffer] = React.useState<string | null>(null);

    const display =
      buffer !== null
        ? buffer
        : value === undefined || value === null || (zeroAsEmpty && value === 0)
          ? ""
          : String(value);

    return (
      <Input
        {...props}
        ref={ref}
        type="number"
        inputMode={inputMode ?? "decimal"}
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          setBuffer(raw);
          const next = raw === "" ? 0 : Number(raw);
          if (!Number.isNaN(next)) onValueChange(next);
        }}
        onBlur={(e) => {
          setBuffer(null);
          onBlur?.(e);
        }}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";
