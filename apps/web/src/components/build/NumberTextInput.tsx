import * as React from "react";
import { Input } from "@toolkit/components/ui/input";

type NumberTextInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange"
> & {
  value: number | null | undefined;
  onNumberChange: (value: number) => void;
};

export function NumberTextInput({
  value,
  onNumberChange,
  inputMode = "decimal",
  ...props
}: NumberTextInputProps) {
  const numericDisplay =
    value === null || value === undefined || Number.isNaN(value) || value === 0 ? "" : String(value);
  const [display, setDisplay] = React.useState(numericDisplay);
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setDisplay(numericDisplay);
  }, [focused, numericDisplay]);

  const commit = (rawValue: string) => {
    const raw = rawValue.replace(/,/g, "").trim();
    onNumberChange(raw === "" || raw === "-" || raw === "." || raw === "-." ? 0 : Number(raw));
  };

  const normaliseDisplay = (rawValue: string) => {
    const raw = rawValue.replace(/,/g, "").trim();
    if (raw === "" || raw === "-" || raw === "." || raw === "-.") return "";
    const next = Number(raw);
    return Number.isFinite(next) && next !== 0 ? String(next) : "";
  };

  return (
    <Input
      {...props}
      type="text"
      inputMode={inputMode}
      value={display}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onChange={(e) => {
        const next = e.target.value;
        if (/^-?\d*(?:[.]\d*)?$/.test(next.replace(/,/g, "").trim())) {
          setDisplay(next);
          commit(next);
        }
      }}
        onBlur={(e) => {
          setFocused(false);
          setDisplay(normaliseDisplay(e.currentTarget.value));
          props.onBlur?.(e);
        }}
      />
  );
}
