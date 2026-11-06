import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClockService } from '../../common/clock/clock.service';
import { ONLINE_LINK_LEAD_MINUTES } from '../../domain/online-link';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationVarsService } from './notification-vars.service';
import { NotificationsService } from './notifications.service';

/**
 * Session reminders (default: the day before and 2 hours before; configurable).
 * Each reminder is sent at most once per booking and offset. A booking made
 * after a reminder's send time does not get that reminder, and after downtime
 * only the nearest due reminder is sent.
 */
/** `BookingReminder.offsetMinutes` value that records the online join-link message. */
const ONLINE_LINK_REMINDER = -ONLINE_LINK_LEAD_MINUTES;

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly vars: NotificationVarsService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
  ) {}

  async sendDue(): Promise<number> {
    const offsets = [...(await this.settings.get('notifications')).sessionReminderOffsetsMinutes].sort((a, b) => a - b);
    if (!offsets.length) return 0;
    const now = this.clock.now();
    const maxOffset = offsets[offsets.length - 1];
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'BOOKED',
        session: { status: 'SCHEDULED', startsAt: { gt: now, lte: new Date(now.getTime() + maxOffset * 60_000) } },
      },
      include: { session: { select: { startsAt: true } }, reminders: true },
    });
    let sent = 0;
    for (const booking of bookings) {
      const minutesToStart = (booking.session.startsAt.getTime() - now.getTime()) / 60_000;
      // The smallest offset whose send time has passed is the one due now.
      const due = offsets.find((offset) => minutesToStart <= offset);
      if (due === undefined) continue;
      if (booking.reminders.some((r) => r.offsetMinutes !== ONLINE_LINK_REMINDER && r.offsetMinutes <= due)) continue;
      const sendTime = booking.session.startsAt.getTime() - due * 60_000;
      if (booking.bookedAt.getTime() > sendTime) continue;
      try {
        await this.prisma.bookingReminder.create({ data: { bookingId: booking.id, offsetMinutes: due } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
      const v = await this.vars.booking(booking.id);
      if (!v) continue;
      await this.notifications.notifyClient(v.clientId, {
        templateKey: due >= 720 ? 'session.reminder_day' : 'session.reminder_soon',
        vars: { ...v, hours: Math.max(1, Math.round(minutesToStart / 60)) },
        data: { bookingId: booking.id, sessionId: booking.sessionId },
      });
      sent += 1;
    }
    if (sent) this.logger.log(`Sent ${sent} session reminder(s)`);
    return sent;
  }

  /** Sends the join link of an online session to each booked client 15 minutes before it starts. */
  async sendOnlineLinks(): Promise<number> {
    const now = this.clock.now();
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'BOOKED',
        reminders: { none: { offsetMinutes: ONLINE_LINK_REMINDER } },
        session: {
          status: 'SCHEDULED',
          format: 'ONLINE',
          onlineUrl: { not: null },
          startsAt: { gt: now, lte: new Date(now.getTime() + ONLINE_LINK_LEAD_MINUTES * 60_000) },
        },
      },
      include: { session: { select: { onlineUrl: true } } },
    });
    let sent = 0;
    for (const booking of bookings) {
      try {
        await this.prisma.bookingReminder.create({ data: { bookingId: booking.id, offsetMinutes: ONLINE_LINK_REMINDER } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
      const v = await this.vars.booking(booking.id);
      if (!v) continue;
      await this.notifications.notifyClient(v.clientId, {
        templateKey: 'session.online_link',
        vars: { ...v, onlineUrl: booking.session.onlineUrl ?? '' },
        data: { bookingId: booking.id, sessionId: booking.sessionId },
      });
      sent += 1;
    }
    if (sent) this.logger.log(`Sent ${sent} online join link(s)`);
    return sent;
  }
}
