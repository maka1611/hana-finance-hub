import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatRuPhone } from "@/lib/phone-format";

type PhoneInputProps = Omit<React.ComponentProps<"input">, "onChange" | "value" | "type"> & {
  value: string;
  onChange: (value: string) => void;
};

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, placeholder = "+7(___)___-__-__", ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(formatRuPhone(e.target.value));
    };
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (!value) onChange("+7");
      props.onFocus?.(e);
    };
    return (
      <Input
        {...props}
        ref={ref}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
      />
    );
  },
);
PhoneInput.displayName = "PhoneInput";