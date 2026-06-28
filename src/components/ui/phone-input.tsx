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
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      props.onKeyDown?.(e);
      if (e.defaultPrevented) return;
      const input = e.currentTarget;
      const val = input.value;
      const start = input.selectionStart ?? val.length;
      const end = input.selectionEnd ?? start;
      // Только если нет выделения (иначе обычное удаление выделенного куска)
      if (start !== end) return;

      const isDigit = (ch: string) => /\d/.test(ch);

      if (e.key === "Backspace") {
        // Сдвигаем точку удаления назад мимо форматирующих символов
        let pos = start;
        while (pos > 0 && !isDigit(val[pos - 1])) pos--;
        if (pos === 0) return; // нечего удалять
        e.preventDefault();
        const next = val.slice(0, pos - 1) + val.slice(start);
        onChange(formatRuPhone(next));
      } else if (e.key === "Delete") {
        let pos = start;
        while (pos < val.length && !isDigit(val[pos])) pos++;
        if (pos >= val.length) return;
        e.preventDefault();
        const next = val.slice(0, pos) + val.slice(pos + 1);
        onChange(formatRuPhone(next));
      }
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
        onKeyDown={handleKeyDown}
      />
    );
  },
);
PhoneInput.displayName = "PhoneInput";