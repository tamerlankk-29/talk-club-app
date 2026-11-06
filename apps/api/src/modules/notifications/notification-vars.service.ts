import { Injectable } from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service';
import { fullName } from '../../common/utils/names';
import { formatPhone } from '../../common/utils/phone';
import { TemplateVars } from '../../common/utils/template';
import { daysBetweenLocal, formatClock, formatLocalDate, formatSessionTime, zoned } from '../../common/utils/time';
import { levelRangeLabel } from '../../domain/level-policy';
import { PrismaService } from '../../prisma/prisma.service';

/** Builds template variables (names, local times, "today"/"tomorrow", …) for notifications. */
@Injectable()
export class NotificationVarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  dayWord(date: Date, tz: string): string {
    const diff = daysBetweenLocal(this.clock.now(), date, tz);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    return `on ${zoned(date, tz).setLocale('en-GB').toFormat('cccc, d LLLL')}`;
  }

  daysText(days: number): string {
    if (days <= 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }

  async session(sessionId: string): Promise<TemplateVars & { tz: string }> {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { teacher: true, room: true, location: true, groupType: true, levelMin: true, levelMax: true },
    });
    if (!s) return { tz: 'Asia/Almaty' };
    const tz = s.location.timezone;
    return {
      tz,
      sessionId: s.id,
      sessionTitle: s.title ?? s.groupType?.name ?? 'Speaking Club',
      teacherName: s.teacher ? fullName(s.teacher.firstName, s.teacher.lastName) : 'Talk Club',
      dateTime: formatSessionTime(s.startsAt, tz),
      date: formatLocalDate(s.startsAt, tz),
      time: formatClock(s.startsAt, tz),
      dayWord: this.dayWord(s.startsAt, tz),
      levelLabel: levelRangeLabel(s.levelMin, s.levelMax),
      room: s.room?.name ?? '',
      roomNote: s.room ? `, ${s.room.name}` : '',
      capacity: s.capacity,
      address: [s.location.address, s.location.addressDetails].filter(Boolean).join(', '),
    };
  }

  async booking(bookingId: string): Promise<(TemplateVars & { clientId: string; tz: string }) | null> {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: true,
        membership: { select: { planName: true, visitsRemaining: true } },
        trial: { select: { price: true } },
      },
    });
    if (!b) return null;
    const session = await this.session(b.sessionId);
    return {
      ...session,
      clientId: b.clientId,
      bookingId: b.id,
      clientName: fullName(b.client.firstName, b.client.lastName),
      firstName: b.client.firstName,
      phone: formatPhone(b.client.phone),
      planName: b.membership?.planName ?? '',
      visitsRemaining: b.membership?.visitsRemaining ?? '',
      visitsNote: b.membership ? `Visits left: ${b.membership.visitsRemaining}.` : '',
      amount: b.trial?.price?.toLocaleString('en-US') ?? '',
    };
  }

  async client(clientId: string): Promise<TemplateVars> {
    const c = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!c) return {};
    return { clientId: c.id, clientName: fullName(c.firstName, c.lastName), firstName: c.firstName, phone: formatPhone(c.phone) };
  }

  async payment(paymentId: string): Promise<(TemplateVars & { clientId: string; provider: string; productType: string }) | null> {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { method: true, client: true } });
    if (!p) return null;
    return {
      clientId: p.clientId,
      provider: p.provider,
      productType: p.productType,
      paymentId: p.id,
      amount: p.amount.toLocaleString('en-US'),
      description: p.description ?? p.productType.toLowerCase(),
      method: p.method.name,
      instructions: p.method.instructions ?? '',
      reference: p.reference ?? '',
      clientName: fullName(p.client.firstName, p.client.lastName),
      phone: formatPhone(p.client.phone),
    };
  }

  async membership(membershipId: string): Promise<(TemplateVars & { clientId: string }) | null> {
    const m = await this.prisma.membership.findUnique({ where: { id: membershipId }, include: { client: true, program: true } });
    if (!m) return null;
    const location = await this.prisma.location.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const tz = location?.timezone ?? 'Asia/Almaty';
    const days = daysBetweenLocal(this.clock.now(), m.expiresAt, tz);
    return {
      clientId: m.clientId,
      membershipId: m.id,
      planName: m.planName,
      visits: m.visitsTotal,
      visitsRemaining: m.visitsRemaining,
      expiryDate: formatLocalDate(m.expiresAt, tz),
      days,
      daysText: this.daysText(days),
      clientName: fullName(m.client.firstName, m.client.lastName),
    };
  }
}
