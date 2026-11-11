import { Prisma } from '@prisma/client';
import { assessCancellation, CancellationPolicy } from '../../domain/cancellation-policy';
import { visibleOnlineUrl } from '../../domain/online-link';
import { sessionInclude, SessionReadService, SessionViewContext } from '../sessions/session-read.service';
import { BookingDto } from './dto/booking.dto';

export const bookingInclude = {
  session: { include: sessionInclude },
  attendance: true,
  membership: { select: { planName: true, visitsRemaining: true } },
  feedback: { select: { id: true } },
} satisfies Prisma.BookingInclude;

export type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export function toBookingDto(
  row: BookingRow,
  read: SessionReadService,
  ctx: SessionViewContext,
  policy: CancellationPolicy,
): BookingDto {
  const session = read.toDto(row.session, ctx);
  const active = row.status === 'BOOKED';
  let cancellation: BookingDto['cancellation'] = null;
  if (active) {
    const a = assessCancellation({
      sessionStartsAt: row.session.startsAt,
      bookedAt: row.bookedAt,
      now: ctx.now,
      policy,
      tz: row.session.location.timezone,
      visitDeducted: row.visitDeducted,
    });
    cancellation = {
      deadline: a.deadline,
      isLate: a.isLate,
      visitWillBeReturned: a.visitReturned,
      canCancel: !a.sessionStarted && row.session.status === 'SCHEDULED',
    };
  }
  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    source: row.source,
    bookedAt: row.bookedAt,
    cancelledAt: row.cancelledAt,
    cancellationSource: row.cancellationSource,
    cancelReason: row.cancelReason,
    visitDeducted: row.visitDeducted,
    visitReturned: row.visitReturned,
    membershipId: row.membershipId,
    membershipName: row.membership?.planName ?? null,
    session,
    ...(row.activeSlot ? visibleOnlineUrl(row.session, ctx.now) : { onlineUrl: null, onlineUrlOpensAt: null }),
    attendance: row.attendance
      ? { status: row.attendance.status, method: row.attendance.method, markedAt: row.attendance.markedAt }
      : null,
    cancellation,
    hasFeedback: !!row.feedback,
  };
}
