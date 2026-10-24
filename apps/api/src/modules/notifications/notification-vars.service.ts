import { Injectable } from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service';
import { formatNumber, INTL_LOCALE, localized, type LocalizedText, pluralRu } from '../../common/i18n/localized';
import { fullName } from '../../common/utils/names';
import { formatPhone } from '../../common/utils/phone';
import { TemplateVars } from '../../common/utils/template';
import { daysBetweenLocal, formatClock, formatLocalDate, formatSessionTime, zoned } from '../../common/utils/time';
import { levelRangeLabel } from '../../domain/level-policy';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_WORDS = { en: ['today', 'tomorrow'], ru: ['сегодня', 'завтра'], kk: ['бүгін', 'ертең'] } as const;

const visitsLeft = (n: number) =>
  localized((l) => (l === 'ru' ? `Осталось визитов: ${n}.` : l === 'kk' ? `Қалған келу саны: ${n}.` : `Visits left: ${n}.`));

const amountText = (n: number) => localized((l) => formatNumber(n, l));

/** Builds template variables (names, local times, "today"/"tomorrow", …) for notifications. */
@Injectable()
export class NotificationVarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** "tomorrow" / "завтра" / "on Wednesday, 7 October" / "7 октября". */
  dayWord(date: Date, tz: string): LocalizedText {
    const diff = daysBetweenLocal(this.clock.now(), date, tz);
    return localized((locale) => {
      if (diff === 0 || diff === 1) return DAY_WORDS[locale][diff];
      const local = zoned(date, tz).setLocale(INTL_LOCALE[locale]);
      return locale === 'en' ? `on ${local.toFormat('cccc, d MMMM')}` : local.toFormat('d MMMM');
    });
  }

  /** "in 3 days" / "через 3 дня" / "3 күннен кейін". */
  daysText(days: number): LocalizedText {
    return localized((locale) => {
      if (days <= 0) return DAY_WORDS[locale][0];
      if (days === 1) return DAY_WORDS[locale][1];
      if (locale === 'ru') return `через ${days} ${pluralRu(days, 'день', 'дня', 'дней')}`;
      if (locale === 'kk') return `${days} күннен кейін`;
      return `in ${days} days`;
    });
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
      dateTime: localized((l) => formatSessionTime(s.startsAt, tz, l)),
      date: localized((l) => formatLocalDate(s.startsAt, tz, l)),
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
      visitsNote: b.membership ? visitsLeft(b.membership.visitsRemaining) : '',
      amount: typeof b.trial?.price === 'number' ? amountText(b.trial.price) : '',
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
      amount: amountText(p.amount),
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
      expiryDate: localized((l) => formatLocalDate(m.expiresAt, tz, l)),
      days,
      daysText: this.daysText(days),
      clientName: fullName(m.client.firstName, m.client.lastName),
    };
  }
}
