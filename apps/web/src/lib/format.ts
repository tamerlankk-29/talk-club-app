import { DateTime } from 'luxon';
import { activeLocale, intlLocale, messagesFor } from './i18n/active';
import { commonMessages } from './i18n/messages/common';

/** All times are shown in club time, whatever the device timezone is. */
export const CLUB_TZ = 'Asia/Almaty';

export function clubTime(iso: string | Date): DateTime {
  return (typeof iso === 'string' ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso)).setZone(CLUB_TZ).setLocale(intlLocale());
}

export function clubNow(): DateTime {
  return DateTime.now().setZone(CLUB_TZ).setLocale(intlLocale());
}

// Many browsers (and Chromium builds) ship without Kazakh date names and silently fall back
// to English, which also breaks hydration against the server. Kazakh names are kept here.
const KK_MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
const KK_MONTHS_SHORT = ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'];
const KK_WEEKDAYS = ['дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі', 'жексенбі'];
const KK_WEEKDAYS_SHORT = ['дс', 'сс', 'ср', 'бс', 'жм', 'сб', 'жс'];

/** Luxon toFormat that also works for Kazakh month and weekday names (MMMM, MMM, cccc, ccc). */
export function formatDate(dt: DateTime, pattern: string): string {
  if (activeLocale() !== 'kk') return dt.setLocale(intlLocale()).toFormat(pattern);
  const quoted = pattern.replace(/LLLL|MMMM|MMM|cccc|ccc/g, (token) => {
    const name =
      token === 'MMMM' || token === 'LLLL' ? KK_MONTHS[dt.month - 1] : token === 'MMM' ? KK_MONTHS_SHORT[dt.month - 1] : token === 'cccc' ? KK_WEEKDAYS[dt.weekday - 1] : KK_WEEKDAYS_SHORT[dt.weekday - 1];
    return `'${name}'`;
  });
  return dt.setLocale('en-GB').toFormat(quoted);
}

/** Number formatting locale; Kazakh uses the same digit grouping as Russian. */
function numberLocale(): string {
  return activeLocale() === 'kk' ? 'ru-RU' : intlLocale();
}

const KK_UNITS: [seconds: number, past: string, future: string][] = [
  [31_536_000, 'жыл бұрын', 'жылдан кейін'],
  [2_592_000, 'ай бұрын', 'айдан кейін'],
  [86_400, 'күн бұрын', 'күннен кейін'],
  [3600, 'сағат бұрын', 'сағаттан кейін'],
  [60, 'минут бұрын', 'минуттан кейін'],
];

function kkRelative(dt: DateTime): string {
  const seconds = dt.diffNow('seconds').seconds;
  const unit = KK_UNITS.find(([size]) => Math.abs(seconds) >= size);
  if (!unit) return 'қазір';
  return `${Math.round(Math.abs(seconds) / unit[0])} ${seconds < 0 ? unit[1] : unit[2]}`;
}

export const fmt = {
  time: (iso: string) => clubTime(iso).toFormat('HH:mm'),
  date: (iso: string) => formatDate(clubTime(iso), 'd MMMM yyyy'),
  dateShort: (iso: string) => formatDate(clubTime(iso), 'd MMM'),
  dayMonth: (iso: string) => formatDate(clubTime(iso), 'd MMMM'),
  weekdayDate: (iso: string) => formatDate(clubTime(iso), 'ccc, d MMM'),
  weekdayLong: (iso: string) => formatDate(clubTime(iso), 'cccc'),
  dateTime: (iso: string) => formatDate(clubTime(iso), 'd MMM yyyy, HH:mm'),
  sessionWhen: (iso: string) => `${dayLabel(iso)}, ${clubTime(iso).toFormat('HH:mm')}`,
  /** Local calendar date string (yyyy-MM-dd) → "Wednesday, 7 October" */
  localDate: (date: string) => formatDate(DateTime.fromISO(date, { zone: CLUB_TZ }), 'cccc, d MMMM'),
  number: (value: number) => value.toLocaleString(numberLocale()),
  money: (amount: number | null | undefined, currency = '₸') =>
    amount === null || amount === undefined ? '—' : `${Math.round(amount).toLocaleString(numberLocale())} ${currency}`,
  relative: (iso: string) => (activeLocale() === 'kk' ? kkRelative(clubTime(iso)) : (clubTime(iso).toRelative({ locale: activeLocale() }) ?? '')),
  phone: (e164: string | null | undefined) => {
    if (!e164) return '';
    const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
    return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
  },
  minutesAsHours: (minutes: number) => {
    const t = messagesFor(commonMessages);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? (m ? `${t.hours(h)} ${t.minutes(m)}` : t.hours(h)) : t.minutes(m);
  },
};

/** "Today", "Tomorrow", "Yesterday" or "Wed, 7 Oct". */
export function dayLabel(iso: string): string {
  const d = clubTime(iso).startOf('day');
  const today = clubNow().startOf('day');
  const diff = Math.round(d.diff(today, 'days').days);
  const t = messagesFor(commonMessages);
  if (diff === 0) return t.today;
  if (diff === 1) return t.tomorrow;
  if (diff === -1) return t.yesterday;
  return formatDate(d, 'ccc, d MMM');
}

export function localDayLabel(date: string): string {
  const d = DateTime.fromISO(date, { zone: CLUB_TZ });
  const today = clubNow().startOf('day');
  const diff = Math.round(d.diff(today, 'days').days);
  const t = messagesFor(commonMessages);
  if (diff === 0) return t.today;
  if (diff === 1) return t.tomorrow;
  return formatDate(d, 'cccc, d MMMM');
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
