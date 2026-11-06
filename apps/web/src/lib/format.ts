import { DateTime } from 'luxon';

/** All times are shown in club time, whatever the device timezone is. */
export const CLUB_TZ = 'Asia/Almaty';

export function clubTime(iso: string | Date): DateTime {
  return (typeof iso === 'string' ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso)).setZone(CLUB_TZ).setLocale('en-GB');
}

export function clubNow(): DateTime {
  return DateTime.now().setZone(CLUB_TZ).setLocale('en-GB');
}

export const fmt = {
  time: (iso: string) => clubTime(iso).toFormat('HH:mm'),
  date: (iso: string) => clubTime(iso).toFormat('d MMMM yyyy'),
  dateShort: (iso: string) => clubTime(iso).toFormat('d MMM'),
  dayMonth: (iso: string) => clubTime(iso).toFormat('d MMMM'),
  weekdayDate: (iso: string) => clubTime(iso).toFormat('ccc, d MMM'),
  weekdayLong: (iso: string) => clubTime(iso).toFormat('cccc'),
  dateTime: (iso: string) => clubTime(iso).toFormat('d MMM yyyy, HH:mm'),
  sessionWhen: (iso: string) => `${dayLabel(iso)}, ${clubTime(iso).toFormat('HH:mm')}`,
  /** Local calendar date string (yyyy-MM-dd) → "Wednesday, 7 October" */
  localDate: (date: string) => DateTime.fromISO(date, { zone: CLUB_TZ }).setLocale('en-GB').toFormat('cccc, d MMMM'),
  money: (amount: number | null | undefined, currency = '₸') =>
    amount === null || amount === undefined ? '—' : `${Math.round(amount).toLocaleString('en-US')} ${currency}`,
  relative: (iso: string) => clubTime(iso).toRelative({ locale: 'en' }) ?? '',
  phone: (e164: string | null | undefined) => {
    if (!e164) return '';
    const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
    return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
  },
  minutesAsHours: (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  },
};

/** "Today", "Tomorrow", "Yesterday" or "Wed, 7 Oct". */
export function dayLabel(iso: string): string {
  const d = clubTime(iso).startOf('day');
  const today = clubNow().startOf('day');
  const diff = Math.round(d.diff(today, 'days').days);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toFormat('ccc, d MMM');
}

export function localDayLabel(date: string): string {
  const d = DateTime.fromISO(date, { zone: CLUB_TZ });
  const today = clubNow().startOf('day');
  const diff = Math.round(d.diff(today, 'days').days);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.setLocale('en-GB').toFormat('cccc, d MMMM');
}

/**
 * Input phone formatting while typing: "+7 701 123 45 67".
 * Accepts "+7 701…", "8 701…", "7701…" (11 digits) and the bare national "701…".
 */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw.trim().startsWith('+') ? '+' : '';
  let national: string;
  if (raw.trim().startsWith('+')) national = digits.startsWith('7') ? digits.slice(1) : digits;
  else if (digits.startsWith('8')) national = digits.slice(1);
  else if (digits.length >= 11 && digits.startsWith('7')) national = digits.slice(1);
  else national = digits;
  national = national.slice(0, 10);
  let out = '+7';
  if (national.length) out += ` ${national.slice(0, 3)}`;
  if (national.length > 3) out += ` ${national.slice(3, 6)}`;
  if (national.length > 6) out += ` ${national.slice(6, 8)}`;
  if (national.length > 8) out += ` ${national.slice(8, 10)}`;
  return out;
}

export function phoneDigitsComplete(formatted: string): boolean {
  return formatted.replace(/\D/g, '').length === 11;
}

/** Value for <input type="datetime-local">, shown in club time whatever the device timezone. */
export function toClubInput(iso: string | null | undefined): string {
  return iso ? clubTime(iso).toFormat("yyyy-MM-dd'T'HH:mm") : '';
}

/** Club-time datetime-local value → ISO instant for the API. */
export function fromClubInput(value: string): string {
  return DateTime.fromISO(value, { zone: CLUB_TZ }).toUTC().toISO()!;
}
