// Russian phone formatting: +7(XXX)XXX-XX-XX
export function formatRuPhone(input: string): string {
  let digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  // Normalize leading: 8 -> 7; if starts with other digit, prepend 7
  if (digits[0] === "8") digits = "7" + digits.slice(1);
  else if (digits[0] !== "7") digits = "7" + digits;
  digits = digits.slice(0, 11); // 7 + 10
  const a = digits.slice(1, 4);
  const b = digits.slice(4, 7);
  const c = digits.slice(7, 9);
  const d = digits.slice(9, 11);
  let out = "+7";
  if (a) out += `(${a}`;
  if (a.length === 3) out += ")";
  if (b) out += b;
  if (c) out += `-${c}`;
  if (d) out += `-${d}`;
  return out;
}

export function normalizeRuPhone(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  let d = digits;
  if (d[0] === "8") d = "7" + d.slice(1);
  else if (d[0] !== "7") d = "7" + d;
  d = d.slice(0, 11);
  return "+" + d;
}