const checkDigit = (digits: string, length: number): number => {
  const sum = Array.from({ length }, (_, index) => Number(digits[index]) * (length + 1 - index)).reduce(
    (total, value) => total + value,
    0,
  );
  return ((sum * 10) % 11) % 10;
};

export const normalizeCpf = (raw: unknown): string | null => {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const valid =
    digits.length === 11 &&
    !/^(\d)\1+$/.test(digits) &&
    checkDigit(digits, 9) === Number(digits[9]) &&
    checkDigit(digits, 10) === Number(digits[10]);
  return valid ? digits : null;
};
