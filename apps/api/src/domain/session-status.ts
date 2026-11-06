/**
 * Display status of a session, derived from stored state + time + occupancy.
 * Only SCHEDULED / CANCELLED are persisted; everything else is computed so it
 * can never drift out of date.
 */
export type SessionDisplayStatus =
  | 'SCHEDULED'
  | 'OPEN'
  | 'ALMOST_FULL'
  | 'FULL'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface SessionStatusInput {
  status: 'SCHEDULED' | 'CANCELLED';
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  /** Seats taken by active bookings. */
  booked: number;
  /** Seats held by outstanding waitlist offers. */
  held: number;
  bookingClosed: boolean;
  /** Booking opens this many days before the start (null = always open). */
  openDaysAhead: number | null;
  almostFullThreshold: number;
  now: Date;
}

export function seatsAvailable(capacity: number, booked: number, held: number): number {
  return Math.max(0, capacity - booked - held);
}

export function bookingOpensAt(startsAt: Date, openDaysAhead: number | null): Date | null {
  if (openDaysAhead === null || openDaysAhead <= 0) return null;
  return new Date(startsAt.getTime() - openDaysAhead * 86_400_000);
}

export function computeSessionStatus(s: SessionStatusInput): SessionDisplayStatus {
  if (s.status === 'CANCELLED') return 'CANCELLED';
  const now = s.now.getTime();
  if (now >= s.endsAt.getTime()) return 'COMPLETED';
  if (now >= s.startsAt.getTime()) return 'STARTED';
  const available = seatsAvailable(s.capacity, s.booked, s.held);
  if (available <= 0) return 'FULL';
  const opensAt = bookingOpensAt(s.startsAt, s.openDaysAhead);
  if (s.bookingClosed || (opensAt && now < opensAt.getTime())) return 'SCHEDULED';
  if (available <= s.almostFullThreshold) return 'ALMOST_FULL';
  return 'OPEN';
}
