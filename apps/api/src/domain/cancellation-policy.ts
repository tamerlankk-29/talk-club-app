import { parseClock, zoned } from '../common/utils/time';

/**
 * Cancellation rule (configurable in Settings → Booking rules):
 *   PREVIOUS_DAY_AT — free cancellation until a fixed local time on the day before
 *                     the session (Talk Club default: 20:00 the previous day).
 *   HOURS_BEFORE    — free cancellation until N hours before the start.
 * Optional grace period: a booking cancelled within N minutes of being made is
 * always free (0 = disabled, the default).
 */
export interface CancellationPolicy {
  mode: 'PREVIOUS_DAY_AT' | 'HOURS_BEFORE';
  previousDayTime: string;
  hoursBefore: number;
  graceMinutesAfterBooking: number;
}

export interface CancellationAssessment {
  /** Last instant at which cancellation is free. */
  deadline: Date;
  /** True when cancelling now counts as a late cancellation. */
  isLate: boolean;
  /** True when the grace period after booking makes this cancellation free despite the deadline. */
  withinGrace: boolean;
  /** Whether a visit deducted for this booking goes back to the membership. */
  visitReturned: boolean;
  /** The session has started — clients can no longer cancel (admins still can). */
  sessionStarted: boolean;
}

export function cancellationDeadline(sessionStartsAt: Date, policy: CancellationPolicy, tz: string): Date {
  if (policy.mode === 'HOURS_BEFORE') {
    return new Date(sessionStartsAt.getTime() - policy.hoursBefore * 3_600_000);
  }
  const { hour, minute } = parseClock(policy.previousDayTime);
  return zoned(sessionStartsAt, tz)
    .minus({ days: 1 })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate();
}

export function assessCancellation(input: {
  sessionStartsAt: Date;
  bookedAt: Date;
  now: Date;
  policy: CancellationPolicy;
  tz: string;
  visitDeducted: boolean;
}): CancellationAssessment {
  const deadline = cancellationDeadline(input.sessionStartsAt, input.policy, input.tz);
  const sessionStarted = input.now.getTime() >= input.sessionStartsAt.getTime();
  const pastDeadline = input.now.getTime() > deadline.getTime();
  const graceMs = Math.max(0, input.policy.graceMinutesAfterBooking) * 60_000;
  const withinGrace =
    pastDeadline && !sessionStarted && graceMs > 0 && input.now.getTime() - input.bookedAt.getTime() <= graceMs;
  const isLate = pastDeadline && !withinGrace;
  return {
    deadline,
    isLate,
    withinGrace,
    sessionStarted,
    visitReturned: input.visitDeducted && !isLate,
  };
}
