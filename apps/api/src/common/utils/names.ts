export function fullName(first: string | null | undefined, last: string | null | undefined): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(' ');
}

export function initials(first: string | null | undefined, last: string | null | undefined): string {
  return [first?.trim()?.[0], last?.trim()?.[0]].filter(Boolean).join('').toUpperCase();
}
