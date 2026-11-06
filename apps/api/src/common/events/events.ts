/**
 * Domain events, published after the originating transaction commits.
 * Listeners (notifications, CRM pipeline, automations, waitlist, activity
 * timeline) react independently, so the booking/membership engines stay free
 * of side-effect code.
 */
export const Events = {
  ClientRegistered: 'client.registered',
  BookingCreated: 'booking.created',
  BookingCancelled: 'booking.cancelled',
  AttendanceMarked: 'attendance.marked',
  SessionCancelled: 'session.cancelled',
  SessionUpdated: 'session.updated',
  SeatReleased: 'session.seat_released',
  SessionFull: 'session.full',
  MembershipActivated: 'membership.activated',
  PaymentCreated: 'payment.created',
  PaymentConfirmed: 'payment.confirmed',
  TrialRequested: 'trial.requested',
  TrialScheduled: 'trial.scheduled',
  TrialCompleted: 'trial.completed',
  WaitlistOffered: 'waitlist.offered',
} as const;

export type ActorRef = { userId: string | null; source: 'CLIENT' | 'ADMIN' | 'TEACHER' | 'SYSTEM' };

export interface ClientRegisteredEvent {
  clientId: string;
  userId: string;
  referralCodeUsed: string | null;
}

export interface BookingCreatedEvent {
  bookingId: string;
  sessionId: string;
  clientId: string;
  kind: 'MEMBERSHIP' | 'TRIAL' | 'COMPLIMENTARY';
  actor: ActorRef;
  /** Set when an admin moved the client here from another booking */
  movedFromBookingId?: string;
}

export interface BookingCancelledEvent {
  bookingId: string;
  sessionId: string;
  clientId: string;
  isLate: boolean;
  visitReturned: boolean;
  actor: ActorRef;
  /** Send the client a cancellation notification (false for moves and client-initiated cancels) */
  notifyClient: boolean;
  movedToBookingId?: string;
}

export interface AttendanceMarkedEvent {
  bookingId: string;
  sessionId: string;
  clientId: string;
  status: 'PRESENT' | 'LATE' | 'ABSENT';
  previousStatus: 'PRESENT' | 'LATE' | 'ABSENT' | null;
  kind: 'MEMBERSHIP' | 'TRIAL' | 'COMPLIMENTARY';
  actor: ActorRef;
}

export interface SessionCancelledEvent {
  sessionId: string;
  affectedBookingIds: string[];
  reason: string | null;
  actor: ActorRef;
}

export interface SessionUpdatedEvent {
  sessionId: string;
  /** Human-readable changes relevant to booked clients, e.g. "time", "teacher", "room" */
  changes: Array<'time' | 'teacher' | 'room' | 'format'>;
  notifyClients: boolean;
  actor: ActorRef;
}

export interface SeatReleasedEvent {
  sessionId: string;
}

export interface SessionFullEvent {
  sessionId: string;
}

export interface MembershipActivatedEvent {
  membershipId: string;
  clientId: string;
  paymentId: string | null;
  isRenewal: boolean;
  actor: ActorRef;
}

export interface PaymentCreatedEvent {
  paymentId: string;
  clientId: string;
  actor: ActorRef;
}

export interface PaymentConfirmedEvent {
  paymentId: string;
  clientId: string;
  productType: 'MEMBERSHIP' | 'TRIAL' | 'OTHER';
  amount: number;
  actor: ActorRef;
}

export interface TrialRequestedEvent {
  trialId: string;
  leadId: string | null;
}

export interface TrialScheduledEvent {
  trialId: string;
  sessionId: string;
  clientId: string;
}

export interface TrialCompletedEvent {
  trialId: string;
  clientId: string | null;
  attended: boolean;
}

export interface WaitlistOfferedEvent {
  entryId: string;
  sessionId: string;
  clientId: string;
  expiresAt: Date;
}
