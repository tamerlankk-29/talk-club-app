/**
 * Phone numbers are the primary client identifier. They are stored in E.164
 * (+77011234567) and displayed in Kazakhstan format (+7 701 123 45 67).
 *
 * Accepted input: "+7 701 123 45 67", "8 (701) 123-45-67", "87011234567",
 * "7011234567", "+77011234567" and other international numbers in E.164.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Kazakhstan / Russia (+7): 11 digits starting with 7 or 8, or 10 local digits.
  if (!hasPlus || digits.startsWith('7')) {
    if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
      return `+7${digits.slice(1)}`;
    }
    if (digits.length === 10 && !hasPlus) {
      return `+7${digits}`;
    }
  }

  // Other countries: must be written with a leading "+".
  if (hasPlus && digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) {
    return `+${digits}`;
  }
  return null;
}

export function isValidPhone(input: string | null | undefined): boolean {
  return normalizePhone(input) !== null;
}

/** "+77011234567" → "+7 701 123 45 67" (other countries are returned unchanged). */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const match = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (!match) return e164;
  return `+7 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
}

/** Masks a phone for logs and non-privileged views: +7 701 *** ** 67 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const formatted = formatPhone(e164);
  return formatted.replace(/(\+7 \d{3}) \d{3} \d{2} (\d{2})/, '$1 *** ** $2');
}
