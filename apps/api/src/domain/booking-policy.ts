import type { ErrorCode } from '../common/errors/error-codes';
import { checkLevel, LevelEnforcement } from './level-policy';
import { MembershipCandidate, pickMembership } from './membership-rules';

/**
 * The booking decision, as a pure function. The same rules produce the
 * "can I book this?" hints in the schedule and the final check inside the
 * booking transaction (where the inputs are read under row locks).
 */
export interface BookingPolicySettings {
  cutoffMinutesBeforeStart: number;
  openDaysAhead: number;
  levelEnforcement: LevelEnforcement;
  levelTolerance: number;
  allowOverlappingBookings: boolean;
  trialsEnabled: boolean;
}

export interface BookingOverrides {
  /** Ignore booking window, closed booking and "already started" (walk-ins, corrections). */
  window?: boolean;
  level?: boolean;
  category?: boolean;
  overlap?: boolean;
  capacity?: boolean;
  /** Allow a trial for a client who already used one. */
  trialLimit?: boolean;
}

export interface BookingPolicyInput {
  now: Date;
  kind: 'MEMBERSHIP' | 'TRIAL' | 'COMPLIMENTARY';
  session: {
    id: string;
    programId: string;
    status: 'SCHEDULED' | 'CANCELLED';
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    bookingClosed: boolean;
    trialsAllowed: boolean;
    format: string;
    groupTypeId: string | null;
    allowedCategories: string[];
    levelMinPosition: number | null;
    levelMaxPosition: number | null;
  };
  /** Seats taken by active bookings. */
  booked: number;
  /** Seats reserved by outstanding waitlist offers (including this client's own offer). */
  held: number;
  /** The client holds an unexpired waitlist offer for this session. */
  holdsOffer: boolean;
  client: { category: string; levelPosition: number | null };
  /** The client already has an active booking for this very session. */
  alreadyBooked: boolean;
  /** Other active upcoming bookings of the client (for overlap detection). */
  otherBookings: Array<{ startsAt: Date; endsAt: Date }>;
  memberships: MembershipCandidate[];
  trialEligible: boolean;
  settings: BookingPolicySettings;
  overrides?: BookingOverrides;
}

export type BookingPolicyResult =
  | {
      ok: true;
      membership: MembershipCandidate | null;
      levelWarning: 'TOO_LOW' | 'TOO_HIGH' | null;
      capacityOverride: boolean;
    }
  | { ok: false; code: ErrorCode; levelWarning: 'TOO_LOW' | 'TOO_HIGH' | null; details?: Record<string, unknown> };

const MEMBERSHIP_REASON_CODES: Record<string, ErrorCode> = {
  NONE: 'BOOKING_NO_ACTIVE_MEMBERSHIP',
  NO_VISITS: 'BOOKING_NO_VISITS_LEFT',
  EXPIRES_BEFORE_SESSION: 'BOOKING_MEMBERSHIP_EXPIRES_BEFORE_SESSION',
  NOT_STARTED_BY_SESSION: 'BOOKING_NO_ACTIVE_MEMBERSHIP',
  PLAN_NOT_VALID_FOR_SESSION: 'BOOKING_PLAN_NOT_VALID_FOR_SESSION',
  NOT_ACTIVE: 'BOOKING_NO_ACTIVE_MEMBERSHIP',
  WRONG_PROGRAM: 'BOOKING_NO_ACTIVE_MEMBERSHIP',
};

export function evaluateBooking(input: BookingPolicyInput): BookingPolicyResult {
  const { session: s, settings, now } = input;
  const o = input.overrides ?? {};
  let levelWarning: 'TOO_LOW' | 'TOO_HIGH' | null = null;
  const fail = (code: ErrorCode, details?: Record<string, unknown>): BookingPolicyResult => ({ ok: false, code, levelWarning, details });

  // Session availability & booking window
  if (s.status === 'CANCELLED') return fail('BOOKING_SESSION_CANCELLED');
  if (!o.window) {
    if (now.getTime() >= s.startsAt.getTime()) return fail('BOOKING_SESSION_STARTED');
    if (s.bookingClosed) return fail('BOOKING_CLOSED');
    if (now.getTime() > s.startsAt.getTime() - settings.cutoffMinutesBeforeStart * 60_000) return fail('BOOKING_CLOSED');
    if (settings.openDaysAhead > 0 && now.getTime() < s.startsAt.getTime() - settings.openDaysAhead * 86_400_000) {
      return fail('BOOKING_NOT_OPEN_YET', { opensAt: new Date(s.startsAt.getTime() - settings.openDaysAhead * 86_400_000) });
    }
  }

  // Duplicate
  if (input.alreadyBooked) return fail('BOOKING_ALREADY_BOOKED');

  // Who may join this group
  if (!o.category && s.allowedCategories.length && !s.allowedCategories.includes(input.client.category)) {
    return fail('BOOKING_CATEGORY_NOT_ALLOWED');
  }

  // Level
  if (settings.levelEnforcement !== 'off') {
    const level = checkLevel({
      clientPosition: input.client.levelPosition,
      minPosition: s.levelMinPosition,
      maxPosition: s.levelMaxPosition,
      tolerance: settings.levelTolerance,
    });
    if (!level.ok) {
      levelWarning = level.reason;
      if (settings.levelEnforcement === 'block' && !o.level) return fail('BOOKING_LEVEL_MISMATCH', { reason: level.reason });
    }
  }

  // Overlapping sessions
  if (!settings.allowOverlappingBookings && !o.overlap) {
    const clash = input.otherBookings.some(
      (b) => b.startsAt.getTime() < s.endsAt.getTime() && b.endsAt.getTime() > s.startsAt.getTime(),
    );
    if (clash) return fail('BOOKING_OVERLAP');
  }

  // Capacity (a seat held for this client's own waitlist offer is theirs to take)
  let capacityOverride = false;
  const heldForOthers = Math.max(0, input.held - (input.holdsOffer ? 1 : 0));
  const free = s.capacity - input.booked - heldForOthers;
  if (free <= 0) {
    if (o.capacity) capacityOverride = true;
    else if (s.capacity - input.booked > 0) return fail('BOOKING_OFFER_RESERVED');
    else return fail('BOOKING_SESSION_FULL');
  }

  // How the visit is paid for
  if (input.kind === 'MEMBERSHIP') {
    const picked = pickMembership(input.memberships, {
      programId: s.programId,
      startsAt: s.startsAt,
      format: s.format,
      groupTypeId: s.groupTypeId,
    });
    if (!picked.membership) return fail(MEMBERSHIP_REASON_CODES[picked.reason] ?? 'BOOKING_NO_ACTIVE_MEMBERSHIP');
    return { ok: true, membership: picked.membership, levelWarning, capacityOverride };
  }
  if (input.kind === 'TRIAL') {
    if (!settings.trialsEnabled) return fail('BOOKING_TRIALS_DISABLED');
    if (!s.trialsAllowed && !o.window) return fail('BOOKING_TRIAL_NOT_ALLOWED');
    if (!input.trialEligible && !o.trialLimit) return fail('BOOKING_TRIAL_ALREADY_USED');
  }
  return { ok: true, membership: null, levelWarning, capacityOverride };
}
