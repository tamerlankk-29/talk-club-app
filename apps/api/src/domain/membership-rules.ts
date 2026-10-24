import { zoned } from '../common/utils/time';

/**
 * Membership validity: purchased on day D with validity N days → valid through
 * the end of local day D + N ("Purchased 24 September → Expiration 29 October"
 * for a 35-day plan). Visits can be used in any rhythm until then; unused visits
 * are never expired early.
 */
export function computeMembershipExpiry(startsAt: Date, validityDays: number, tz: string): Date {
  return zoned(startsAt, tz).startOf('day').plus({ days: validityDays }).endOf('day').toJSDate();
}

export function extendExpiry(expiresAt: Date, days: number, tz: string): Date {
  return zoned(expiresAt, tz).plus({ days }).endOf('day').toJSDate();
}

export type MembershipDisplayStatus = 'ACTIVE' | 'USED_UP' | 'EXPIRED' | 'CANCELLED' | 'NOT_STARTED';

export function membershipDisplayStatus(
  m: { status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED'; startsAt: Date; expiresAt: Date; visitsRemaining: number },
  now: Date,
): MembershipDisplayStatus {
  if (m.status === 'CANCELLED') return 'CANCELLED';
  if (m.status === 'EXPIRED' || now.getTime() > m.expiresAt.getTime()) return 'EXPIRED';
  if (now.getTime() < m.startsAt.getTime()) return 'NOT_STARTED';
  if (m.visitsRemaining <= 0) return 'USED_UP';
  return 'ACTIVE';
}

export interface MembershipCandidate {
  id: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  programId: string;
  startsAt: Date;
  expiresAt: Date;
  visitsRemaining: number;
  /** Session formats the plan is valid for; empty = all. */
  planFormats: string[];
  /** Group types the plan is restricted to; empty = all. */
  planGroupTypeIds: string[];
}

export interface SessionForMembership {
  programId: string;
  startsAt: Date;
  format: string;
  groupTypeId: string | null;
}

export type MembershipUsability =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'NOT_ACTIVE'
        | 'WRONG_PROGRAM'
        | 'NO_VISITS'
        | 'EXPIRES_BEFORE_SESSION'
        | 'NOT_STARTED_BY_SESSION'
        | 'PLAN_NOT_VALID_FOR_SESSION';
    };

export function membershipUsableFor(m: MembershipCandidate, s: SessionForMembership): MembershipUsability {
  if (m.status !== 'ACTIVE') return { ok: false, reason: 'NOT_ACTIVE' };
  if (m.programId !== s.programId) return { ok: false, reason: 'WRONG_PROGRAM' };
  if (s.startsAt.getTime() >= m.expiresAt.getTime()) return { ok: false, reason: 'EXPIRES_BEFORE_SESSION' };
  if (s.startsAt.getTime() < m.startsAt.getTime()) return { ok: false, reason: 'NOT_STARTED_BY_SESSION' };
  if (m.planFormats.length && !m.planFormats.includes(s.format)) {
    return { ok: false, reason: 'PLAN_NOT_VALID_FOR_SESSION' };
  }
  if (m.planGroupTypeIds.length && (!s.groupTypeId || !m.planGroupTypeIds.includes(s.groupTypeId))) {
    return { ok: false, reason: 'PLAN_NOT_VALID_FOR_SESSION' };
  }
  if (m.visitsRemaining <= 0) return { ok: false, reason: 'NO_VISITS' };
  return { ok: true };
}

/**
 * Chooses which membership pays for a booking: the usable one that expires
 * first (so visits that would be lost soonest are used first).
 * Returns the chosen membership or the most relevant reason none fits.
 */
export function pickMembership(
  memberships: MembershipCandidate[],
  session: SessionForMembership,
): { membership: MembershipCandidate } | { membership: null; reason: Exclude<MembershipUsability, { ok: true }>['reason'] | 'NONE' } {
  const usable = memberships
    .filter((m) => membershipUsableFor(m, session).ok)
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.visitsRemaining - b.visitsRemaining);
  if (usable.length) return { membership: usable[0] };

  const active = memberships.filter((m) => m.status === 'ACTIVE' && m.programId === session.programId);
  if (!active.length) return { membership: null, reason: 'NONE' };
  // Report the reason from the "closest" candidate, most informative first.
  const priority = ['NO_VISITS', 'EXPIRES_BEFORE_SESSION', 'PLAN_NOT_VALID_FOR_SESSION', 'NOT_STARTED_BY_SESSION'] as const;
  const reasons = active.map((m) => membershipUsableFor(m, session)).filter((r) => !r.ok) as Array<
    Exclude<MembershipUsability, { ok: true }>
  >;
  for (const p of priority) {
    if (reasons.some((r) => r.reason === p)) return { membership: null, reason: p };
  }
  return { membership: null, reason: 'NONE' };
}
