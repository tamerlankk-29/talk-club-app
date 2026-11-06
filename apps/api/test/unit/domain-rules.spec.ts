import { DateTime } from 'luxon';
import { formatPhone, normalizePhone } from '../../src/common/utils/phone';
import { renderTemplate } from '../../src/common/utils/template';
import { transliterate } from '../../src/common/utils/transliterate';
import { evaluateBooking, BookingPolicyInput } from '../../src/domain/booking-policy';
import { checkLevel, levelRangeLabel } from '../../src/domain/level-policy';
import { computeMembershipExpiry, membershipDisplayStatus, pickMembership, MembershipCandidate } from '../../src/domain/membership-rules';
import { generateOccurrences } from '../../src/domain/recurrence';
import { computeSessionStatus } from '../../src/domain/session-status';

const TZ = 'Asia/Almaty';
const at = (s: string) => DateTime.fromFormat(s, 'yyyy-MM-dd HH:mm', { zone: TZ }).toJSDate();

describe('membership rules', () => {
  it('is valid for 35 days: purchased 24 September → valid through 29 October', () => {
    const expiry = computeMembershipExpiry(at('2026-09-24 14:10'), 35, TZ);
    expect(DateTime.fromJSDate(expiry, { zone: TZ }).toFormat('yyyy-MM-dd HH:mm:ss')).toBe('2026-10-29 23:59:59');
  });

  it('derives the display status', () => {
    const base = { status: 'ACTIVE' as const, startsAt: at('2026-10-01 10:00'), expiresAt: at('2026-11-05 23:59'), visitsRemaining: 3 };
    expect(membershipDisplayStatus(base, at('2026-10-10 10:00'))).toBe('ACTIVE');
    expect(membershipDisplayStatus({ ...base, visitsRemaining: 0 }, at('2026-10-10 10:00'))).toBe('USED_UP');
    expect(membershipDisplayStatus(base, at('2026-11-06 00:00'))).toBe('EXPIRED');
    expect(membershipDisplayStatus({ ...base, status: 'CANCELLED' }, at('2026-10-10 10:00'))).toBe('CANCELLED');
  });

  it('uses the membership that expires first', () => {
    const m = (id: string, expires: string, visits = 3): MembershipCandidate => ({
      id, status: 'ACTIVE', programId: 'p', startsAt: at('2026-09-01 10:00'), expiresAt: at(expires), visitsRemaining: visits, planFormats: [], planGroupTypeIds: [],
    });
    const session = { programId: 'p', startsAt: at('2026-10-07 18:30'), format: 'OFFLINE', groupTypeId: null };
    const picked = pickMembership([m('late', '2026-11-20 23:59'), m('soon', '2026-10-20 23:59'), m('empty', '2026-10-10 23:59', 0)], session);
    expect(picked.membership?.id).toBe('soon');
    expect(pickMembership([m('empty', '2026-10-10 23:59', 0)], session)).toEqual({ membership: null, reason: 'NO_VISITS' });
    expect(pickMembership([m('old', '2026-10-06 23:59')], session)).toEqual({ membership: null, reason: 'EXPIRES_BEFORE_SESSION' });
    expect(pickMembership([], session)).toEqual({ membership: null, reason: 'NONE' });
  });

  it('respects plan restrictions to group types and formats', () => {
    const business: MembershipCandidate = {
      id: 'b', status: 'ACTIVE', programId: 'p', startsAt: at('2026-09-01 10:00'), expiresAt: at('2026-11-01 23:59'), visitsRemaining: 5, planFormats: ['OFFLINE'], planGroupTypeIds: ['business'],
    };
    expect(pickMembership([business], { programId: 'p', startsAt: at('2026-10-07 18:30'), format: 'OFFLINE', groupTypeId: 'speaking' })).toEqual({ membership: null, reason: 'PLAN_NOT_VALID_FOR_SESSION' });
    expect(pickMembership([business], { programId: 'p', startsAt: at('2026-10-07 18:30'), format: 'OFFLINE', groupTypeId: 'business' }).membership?.id).toBe('b');
  });
});

describe('session status', () => {
  const base = {
    status: 'SCHEDULED' as const, startsAt: at('2026-10-07 18:30'), endsAt: at('2026-10-07 20:00'), capacity: 7, booked: 0, held: 0,
    bookingClosed: false, openDaysAhead: 21, almostFullThreshold: 2, now: at('2026-10-05 10:00'),
  };
  it.each([
    [{}, 'OPEN'],
    [{ booked: 5 }, 'ALMOST_FULL'],
    [{ booked: 7 }, 'FULL'],
    [{ booked: 6, held: 1 }, 'FULL'],
    [{ bookingClosed: true }, 'SCHEDULED'],
    [{ now: at('2026-09-01 10:00') }, 'SCHEDULED'],
    [{ now: at('2026-10-07 18:45') }, 'STARTED'],
    [{ now: at('2026-10-07 20:00') }, 'COMPLETED'],
    [{ status: 'CANCELLED' as const }, 'CANCELLED'],
  ])('%o → %s', (patch, expected) => {
    expect(computeSessionStatus({ ...base, ...patch })).toBe(expected);
  });
});

describe('level policy', () => {
  it('allows levels inside the range and within tolerance', () => {
    expect(checkLevel({ clientPosition: 3, minPosition: 3, maxPosition: 4, tolerance: 0 })).toEqual({ ok: true });
    expect(checkLevel({ clientPosition: 2, minPosition: 3, maxPosition: 4, tolerance: 1 })).toEqual({ ok: true });
    expect(checkLevel({ clientPosition: 1, minPosition: 3, maxPosition: 4, tolerance: 1 })).toEqual({ ok: false, reason: 'TOO_LOW' });
    expect(checkLevel({ clientPosition: 5, minPosition: 1, maxPosition: 3, tolerance: 1 })).toEqual({ ok: false, reason: 'TOO_HIGH' });
    expect(checkLevel({ clientPosition: null, minPosition: 3, maxPosition: 4, tolerance: 0 })).toEqual({ ok: true });
  });
  it('labels level ranges', () => {
    expect(levelRangeLabel({ name: 'Intermediate', rank: 40 }, { name: 'Intermediate', rank: 40 })).toBe('Intermediate');
    expect(levelRangeLabel({ name: 'Pre-Intermediate', rank: 30 }, null)).toBe('Pre-Intermediate+');
    expect(levelRangeLabel({ name: 'Elementary', rank: 20 }, { name: 'Intermediate', rank: 40 })).toBe('Elementary – Intermediate');
    expect(levelRangeLabel(null, null)).toBe('All levels');
  });
});

describe('booking policy', () => {
  const membership: MembershipCandidate = {
    id: 'm', status: 'ACTIVE', programId: 'p', startsAt: at('2026-10-01 10:00'), expiresAt: at('2026-11-05 23:59'), visitsRemaining: 3, planFormats: [], planGroupTypeIds: [],
  };
  const input = (patch: Partial<BookingPolicyInput> = {}): BookingPolicyInput => ({
    now: at('2026-10-05 10:00'),
    kind: 'MEMBERSHIP',
    session: {
      id: 's', programId: 'p', status: 'SCHEDULED', startsAt: at('2026-10-07 18:30'), endsAt: at('2026-10-07 20:00'), capacity: 7,
      bookingClosed: false, trialsAllowed: true, format: 'OFFLINE', groupTypeId: null, allowedCategories: [], levelMinPosition: null, levelMaxPosition: null,
    },
    booked: 3, held: 0, holdsOffer: false, client: { category: 'ADULT', levelPosition: 3 }, alreadyBooked: false, otherBookings: [],
    memberships: [membership], trialEligible: false,
    settings: { cutoffMinutesBeforeStart: 0, openDaysAhead: 21, levelEnforcement: 'block', levelTolerance: 1, allowOverlappingBookings: false, trialsEnabled: true },
    ...patch,
  });

  it('accepts a valid booking and picks the membership', () => {
    expect(evaluateBooking(input())).toMatchObject({ ok: true, membership: { id: 'm' } });
  });
  it.each([
    [{ alreadyBooked: true }, 'BOOKING_ALREADY_BOOKED'],
    [{ booked: 7 }, 'BOOKING_SESSION_FULL'],
    [{ booked: 6, held: 1 }, 'BOOKING_OFFER_RESERVED'],
    [{ memberships: [] }, 'BOOKING_NO_ACTIVE_MEMBERSHIP'],
    [{ memberships: [{ ...membership, visitsRemaining: 0 }] }, 'BOOKING_NO_VISITS_LEFT'],
    [{ now: at('2026-10-07 18:31') }, 'BOOKING_SESSION_STARTED'],
    [{ otherBookings: [{ startsAt: at('2026-10-07 19:00'), endsAt: at('2026-10-07 20:30') }] }, 'BOOKING_OVERLAP'],
    [{ client: { category: 'ADULT', levelPosition: 0 }, session: { ...input().session, levelMinPosition: 3, levelMaxPosition: 4 } }, 'BOOKING_LEVEL_MISMATCH'],
    [{ client: { category: 'ADULT', levelPosition: 3 }, session: { ...input().session, allowedCategories: ['TEEN'] } }, 'BOOKING_CATEGORY_NOT_ALLOWED'],
    [{ session: { ...input().session, status: 'CANCELLED' as const } }, 'BOOKING_SESSION_CANCELLED'],
    [{ session: { ...input().session, bookingClosed: true } }, 'BOOKING_CLOSED'],
    [{ now: at('2026-09-01 10:00') }, 'BOOKING_NOT_OPEN_YET'],
  ])('rejects %o with %s', (patch, code) => {
    expect(evaluateBooking(input(patch as Partial<BookingPolicyInput>))).toMatchObject({ ok: false, code });
  });
  it('lets the holder of a waitlist offer take the held seat', () => {
    expect(evaluateBooking(input({ booked: 6, held: 1, holdsOffer: true })).ok).toBe(true);
  });
  it('admins can override capacity', () => {
    expect(evaluateBooking(input({ booked: 7, overrides: { capacity: true } }))).toMatchObject({ ok: true, capacityOverride: true });
  });
  it('allows a level mismatch in warn mode with a warning', () => {
    const result = evaluateBooking(input({
      client: { category: 'ADULT', levelPosition: 0 },
      session: { ...input().session, levelMinPosition: 3, levelMaxPosition: 4 },
      settings: { ...input().settings, levelEnforcement: 'warn' },
    }));
    expect(result).toMatchObject({ ok: true, levelWarning: 'TOO_LOW' });
  });
  it('trial bookings need eligibility', () => {
    expect(evaluateBooking(input({ kind: 'TRIAL', memberships: [], trialEligible: true })).ok).toBe(true);
    expect(evaluateBooking(input({ kind: 'TRIAL', memberships: [], trialEligible: false }))).toMatchObject({ ok: false, code: 'BOOKING_TRIAL_ALREADY_USED' });
  });
});

describe('recurring schedule', () => {
  it('generates Mon/Wed/Fri 18:30 occurrences in club time', () => {
    const occ = generateOccurrences(
      { daysOfWeek: [1, 3, 5], startTime: '18:30', durationMinutes: 90, validFrom: '2026-10-01', validUntil: null },
      '2026-10-05',
      '2026-10-11',
      TZ,
    );
    expect(occ.map((o) => o.localDate)).toEqual(['2026-10-05', '2026-10-07', '2026-10-09']);
    expect(occ[0].startsAt.toISOString()).toBe('2026-10-05T13:30:00.000Z');
    expect(occ[0].endsAt.toISOString()).toBe('2026-10-05T15:00:00.000Z');
  });
  it('respects validity bounds', () => {
    const occ = generateOccurrences(
      { daysOfWeek: [1], startTime: '12:30', durationMinutes: 90, validFrom: '2026-10-12', validUntil: '2026-10-19' },
      '2026-10-01',
      '2026-12-31',
      TZ,
    );
    expect(occ.map((o) => o.localDate)).toEqual(['2026-10-12', '2026-10-19']);
  });
});

describe('utilities', () => {
  it.each([
    ['+7 701 123 45 67', '+77011234567'],
    ['8 (701) 123-45-67', '+77011234567'],
    ['87011234567', '+77011234567'],
    ['7011234567', '+77011234567'],
    ['+44 20 7946 0958', '+442079460958'],
    ['12345', null],
    ['', null],
  ])('normalizes phone %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
  it('formats Kazakhstan numbers', () => {
    expect(formatPhone('+77011234567')).toBe('+7 701 123 45 67');
  });
  it('renders templates safely', () => {
    expect(renderTemplate('Hi {{firstName}}, {{ missing }}see you at {{time}}', { firstName: 'Tamerlan', time: '18:30' })).toBe('Hi Tamerlan, see you at 18:30');
  });
  it('transliterates names for referral codes', () => {
    expect(transliterate('Тамерлан').toUpperCase()).toBe('TAMERLAN');
    expect(transliterate('Әсел Жанұзақ')).toBe('Asel Zhanuzaq');
  });
});
