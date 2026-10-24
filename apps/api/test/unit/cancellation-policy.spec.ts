import { DateTime } from 'luxon';
import { assessCancellation, cancellationDeadline, CancellationPolicy } from '../../src/domain/cancellation-policy';

const TZ = 'Asia/Almaty';
const at = (s: string) => DateTime.fromFormat(s, 'yyyy-MM-dd HH:mm', { zone: TZ }).toJSDate();
const policy: CancellationPolicy = { mode: 'PREVIOUS_DAY_AT', previousDayTime: '20:00', hoursBefore: 24, graceMinutesAfterBooking: 0 };

describe('cancellation policy', () => {
  it('uses 20:00 club time on the previous day (Wednesday 18:30 → Tuesday 20:00)', () => {
    expect(cancellationDeadline(at('2026-10-07 18:30'), policy, TZ).toISOString()).toBe(at('2026-10-06 20:00').toISOString());
  });

  it('computes the deadline in the club timezone regardless of the server timezone', () => {
    // 20:00 in Almaty (UTC+5) is 15:00 UTC.
    expect(cancellationDeadline(at('2026-10-07 12:30'), policy, TZ).toISOString()).toBe('2026-10-06T15:00:00.000Z');
  });

  it('treats a cancellation exactly at the deadline as on time', () => {
    const a = assessCancellation({ sessionStartsAt: at('2026-10-07 18:30'), bookedAt: at('2026-10-01 10:00'), now: at('2026-10-06 20:00'), policy, tz: TZ, visitDeducted: true });
    expect(a).toMatchObject({ isLate: false, visitReturned: true, sessionStarted: false });
  });

  it('marks a cancellation after the deadline as late and keeps the visit', () => {
    const a = assessCancellation({ sessionStartsAt: at('2026-10-07 18:30'), bookedAt: at('2026-10-01 10:00'), now: at('2026-10-06 20:01'), policy, tz: TZ, visitDeducted: true });
    expect(a).toMatchObject({ isLate: true, visitReturned: false });
  });

  it('reports a started session', () => {
    const a = assessCancellation({ sessionStartsAt: at('2026-10-07 18:30'), bookedAt: at('2026-10-01 10:00'), now: at('2026-10-07 18:31'), policy, tz: TZ, visitDeducted: true });
    expect(a.sessionStarted).toBe(true);
  });

  it('supports an "hours before" policy', () => {
    const hours: CancellationPolicy = { ...policy, mode: 'HOURS_BEFORE', hoursBefore: 12 };
    expect(cancellationDeadline(at('2026-10-07 18:30'), hours, TZ).toISOString()).toBe(at('2026-10-07 06:30').toISOString());
  });

  it('honours an optional grace period right after booking', () => {
    const grace: CancellationPolicy = { ...policy, graceMinutesAfterBooking: 15 };
    const base = { sessionStartsAt: at('2026-10-07 18:30'), bookedAt: at('2026-10-07 09:00'), policy: grace, tz: TZ, visitDeducted: true };
    expect(assessCancellation({ ...base, now: at('2026-10-07 09:10') })).toMatchObject({ isLate: false, withinGrace: true, visitReturned: true });
    expect(assessCancellation({ ...base, now: at('2026-10-07 09:20') })).toMatchObject({ isLate: true, withinGrace: false });
  });

  it('never returns a visit that was not deducted (trial / complimentary bookings)', () => {
    const a = assessCancellation({ sessionStartsAt: at('2026-10-07 18:30'), bookedAt: at('2026-10-01 10:00'), now: at('2026-10-05 10:00'), policy, tz: TZ, visitDeducted: false });
    expect(a).toMatchObject({ isLate: false, visitReturned: false });
  });
});
