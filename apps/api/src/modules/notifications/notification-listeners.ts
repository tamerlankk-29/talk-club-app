import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AttendanceMarkedEvent,
  BookingCancelledEvent,
  BookingCreatedEvent,
  ClientRegisteredEvent,
  Events,
  MembershipActivatedEvent,
  PaymentConfirmedEvent,
  PaymentCreatedEvent,
  SessionCancelledEvent,
  SessionFullEvent,
  SessionUpdatedEvent,
  TrialRequestedEvent,
  WaitlistOfferedEvent,
} from '../../common/events/events';
import { formatClock } from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationVarsService } from './notification-vars.service';
import { NotificationsService } from './notifications.service';

/**
 * Translates domain events into client notifications and staff alerts.
 * Each handler is isolated: a failure is logged and never affects the
 * operation that produced the event.
 */
@Injectable()
export class NotificationListeners {
  private readonly logger = new Logger(NotificationListeners.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly vars: NotificationVarsService,
  ) {}

  private async safe(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error(`${name} notification failed: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  @OnEvent(Events.BookingCreated)
  onBookingCreated(e: BookingCreatedEvent) {
    return this.safe('booking.created', async () => {
      const v = await this.vars.booking(e.bookingId);
      if (!v) return;
      const templateKey = e.movedFromBookingId
        ? 'booking.moved'
        : e.kind === 'TRIAL'
          ? 'trial.scheduled'
          : e.actor.source === 'CLIENT'
            ? 'booking.confirmed'
            : 'booking.created_by_club';
      await this.notifications.notifyClient(e.clientId, { templateKey, vars: v, data: { bookingId: e.bookingId, sessionId: e.sessionId } });
      if (e.kind === 'TRIAL' && e.actor.source === 'CLIENT') {
        await this.notifications.notifyStaff('newTrial', 'admin.new_trial', {
          name: v.clientName,
          phone: v.phone,
          details: `booked a trial: ${v.sessionTitle}, ${v.dateTime}`,
        }, 'trials.manage');
      }
    });
  }

  @OnEvent(Events.BookingCancelled)
  onBookingCancelled(e: BookingCancelledEvent) {
    return this.safe('booking.cancelled', async () => {
      if (e.movedToBookingId) return;
      const v = await this.vars.booking(e.bookingId);
      if (!v) return;
      const booking = await this.prisma.booking.findUnique({ where: { id: e.bookingId }, select: { visitDeducted: true } });
      const visitNote = e.visitReturned
        ? 'Your visit was returned to your membership.'
        : booking?.visitDeducted
          ? 'The visit was not returned (late cancellation).'
          : '';
      if (e.actor.source === 'CLIENT') {
        await this.notifications.notifyClient(e.clientId, { templateKey: 'booking.cancelled', vars: { ...v, visitNote } });
        await this.notifications.notifyStaff('cancellation', 'admin.cancellation', {
          ...v,
          cancellationType: e.isLate ? 'Late cancellation' : 'Cancellation',
        }, 'bookings.view');
      } else if (e.notifyClient) {
        await this.notifications.notifyClient(e.clientId, { templateKey: 'booking.cancelled_by_club', vars: { ...v, visitNote } });
      }
    });
  }

  @OnEvent(Events.SessionCancelled)
  onSessionCancelled(e: SessionCancelledEvent) {
    return this.safe('session.cancelled', async () => {
      for (const bookingId of e.affectedBookingIds) {
        const v = await this.vars.booking(bookingId);
        if (v) await this.notifications.notifyClient(v.clientId, { templateKey: 'session.cancelled', vars: v, data: { sessionId: e.sessionId } });
      }
    });
  }

  @OnEvent(Events.SessionUpdated)
  onSessionUpdated(e: SessionUpdatedEvent) {
    return this.safe('session.updated', async () => {
      if (!e.notifyClients) return;
      const bookings = await this.prisma.booking.findMany({ where: { sessionId: e.sessionId, status: 'BOOKED' }, select: { id: true } });
      for (const b of bookings) {
        const v = await this.vars.booking(b.id);
        if (v) await this.notifications.notifyClient(v.clientId, { templateKey: 'session.changed', vars: v, data: { changes: e.changes } });
      }
    });
  }

  @OnEvent(Events.WaitlistOffered)
  onWaitlistOffered(e: WaitlistOfferedEvent) {
    return this.safe('waitlist.offered', async () => {
      const entry = await this.prisma.waitlistEntry.findUnique({ where: { id: e.entryId } });
      if (!entry) return;
      const v = await this.vars.session(e.sessionId);
      const held = entry.status === 'OFFERED';
      await this.notifications.notifyClient(e.clientId, {
        templateKey: held ? 'waitlist.offer' : 'waitlist.open',
        vars: { ...v, expiresTime: formatClock(e.expiresAt, v.tz), entryId: e.entryId },
        data: { waitlistEntryId: e.entryId, sessionId: e.sessionId, expiresAt: e.expiresAt.toISOString() },
      });
      const waiting = await this.prisma.waitlistEntry.count({ where: { sessionId: e.sessionId, activeSlot: true } });
      await this.notifications.notifyStaff('waitlistOpportunity', 'admin.waitlist', { ...v, waiting }, 'bookings.view');
    });
  }

  @OnEvent(Events.PaymentCreated)
  onPaymentCreated(e: PaymentCreatedEvent) {
    return this.safe('payment.created', async () => {
      const v = await this.vars.payment(e.paymentId);
      if (!v) return;
      if (e.actor.source === 'ADMIN') {
        await this.notifications.notifyClient(e.clientId, { templateKey: 'payment.requested', vars: v });
      } else if (v.provider === 'manual') {
        await this.notifications.notifyStaff('paymentReceived', 'admin.payment_pending', v, 'payments.manage');
      }
    });
  }

  @OnEvent(Events.PaymentConfirmed)
  onPaymentConfirmed(e: PaymentConfirmedEvent) {
    return this.safe('payment.confirmed', async () => {
      const v = await this.vars.payment(e.paymentId);
      if (!v) return;
      await this.notifications.notifyClient(e.clientId, { templateKey: 'payment.confirmed', vars: v });
      if (e.actor.source !== 'ADMIN') {
        await this.notifications.notifyStaff('paymentReceived', 'admin.payment_received', v, 'payments.view');
      }
    });
  }

  @OnEvent(Events.MembershipActivated)
  onMembershipActivated(e: MembershipActivatedEvent) {
    return this.safe('membership.activated', async () => {
      const v = await this.vars.membership(e.membershipId);
      if (v) await this.notifications.notifyClient(e.clientId, { templateKey: 'membership.activated', vars: v });
    });
  }

  @OnEvent(Events.ClientRegistered)
  onClientRegistered(e: ClientRegisteredEvent) {
    return this.safe('client.registered', async () => {
      const v = await this.vars.client(e.clientId);
      await this.notifications.notifyClient(e.clientId, { templateKey: 'client.welcome', vars: v });
      await this.notifications.notifyStaff('newRegistration', 'admin.new_registration', v, 'clients.view');
    });
  }

  @OnEvent(Events.TrialRequested)
  onTrialRequested(e: TrialRequestedEvent) {
    return this.safe('trial.requested', async () => {
      const trial = await this.prisma.trial.findUnique({ where: { id: e.trialId }, include: { level: true } });
      if (!trial) return;
      await this.notifications.notifyStaff('newTrial', 'admin.new_trial', {
        name: trial.name,
        phone: trial.phone,
        details: `trial request${trial.level ? ` (${trial.level.name})` : ''}${trial.comment ? ` — ${trial.comment}` : ''}`,
      }, 'trials.manage');
    });
  }

  @OnEvent(Events.SessionFull)
  onSessionFull(e: SessionFullEvent) {
    return this.safe('session.full', async () => {
      const v = await this.vars.session(e.sessionId);
      await this.notifications.notifyStaff('sessionFull', 'admin.session_full', v, 'schedule.view');
    });
  }

  @OnEvent(Events.AttendanceMarked)
  onAttendanceMarked(e: AttendanceMarkedEvent) {
    return this.safe('attendance.marked', async () => {
      if (e.status !== 'ABSENT' || e.previousStatus !== null) return;
      const v = await this.vars.booking(e.bookingId);
      if (v) await this.notifications.notifyStaff('noShow', 'admin.no_show', v, 'bookings.view');
    });
  }
}
