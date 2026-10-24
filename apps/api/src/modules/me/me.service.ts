import { Inject, Injectable } from '@nestjs/common';
import { ClientCategory, FormatPreference, TimeOfDay } from '@prisma/client';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { fullName } from '../../common/utils/names';
import { localToUtc } from '../../common/utils/time';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthService } from '../auth/auth.service';
import { BookingsService } from '../bookings/bookings.service';
import { ClientSessionDto } from '../bookings/dto/booking.dto';
import { CatalogService } from '../catalog/catalog.service';
import { ClientStatsService } from '../clients/client-stats.service';
import { toProfileDto } from '../clients/clients.service';
import { PipelineService } from '../crm/pipeline.service';
import { AnnouncementsService } from '../marketing/announcements.service';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { ReferralsService } from '../referrals/referrals.service';
import { SettingsService } from '../settings/settings.service';

export interface ProfilePatch {
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  birthDate?: string | null;
  levelId?: string | null;
  preferredDays?: number[];
  preferredTimes?: TimeOfDay[];
  formatPreference?: FormatPreference;
  preferredTeacherIds?: string[];
  photoUrl?: string | null;
}

export interface ChildInput {
  firstName: string;
  lastName?: string;
  birthDate?: string;
  levelId?: string;
  category?: ClientCategory;
}

const profileInclude = {
  level: { select: { id: true, name: true, rank: true } },
  preferredTeachers: { include: { teacher: { select: { id: true, firstName: true, lastName: true } } } },
};

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly authContext: AuthContextService,
    private readonly bookings: BookingsService,
    private readonly memberships: MembershipsService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly announcements: AnnouncementsService,
    private readonly stats: ClientStatsService,
    private readonly referrals: ReferralsService,
    private readonly pipeline: PipelineService,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogService,
    private readonly clock: ClockService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async me(user: AuthUser) {
    const session = await this.auth.sessionUser(user.id, user.sessionId);
    const profile = user.clientId ? await this.profile(user.clientId) : null;
    return { user: session, profile };
  }

  async profile(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: profileInclude });
    if (!client) throw notFound('Client');
    return toProfileDto(client);
  }

  async updateProfile(clientId: string, patch: ProfilePatch, user: AuthUser) {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const email = patch.email === undefined ? undefined : patch.email?.trim().toLowerCase() || null;
    await this.prisma.transaction(async (tx) => {
      if (email !== undefined && client.userId === user.id && email) {
        const taken = await tx.user.findFirst({ where: { email, NOT: { id: user.id } } });
        if (taken) throw new DomainError('AUTH_EMAIL_TAKEN');
        await tx.user.update({ where: { id: user.id }, data: { email } });
      }
      await tx.client.update({
        where: { id: clientId },
        data: {
          firstName: patch.firstName?.trim(),
          lastName: patch.lastName === undefined ? undefined : patch.lastName?.trim() || null,
          email,
          birthDate: patch.birthDate === undefined ? undefined : patch.birthDate ? new Date(`${patch.birthDate}T00:00:00Z`) : null,
          levelId: patch.levelId,
          preferredDays: patch.preferredDays,
          preferredTimes: patch.preferredTimes,
          formatPreference: patch.formatPreference,
          photoUrl: patch.photoUrl,
        },
      });
      if (patch.levelId && patch.levelId !== client.levelId) {
        const level = await tx.level.findUniqueOrThrow({ where: { id: patch.levelId } });
        await tx.clientLevel.create({ data: { clientId, levelId: patch.levelId, reason: 'Self-assessed in the app', changedById: user.id } });
        await tx.clientActivity.create({ data: { clientId, type: 'client.level', title: `Level set to ${level.name} (self-assessed)`, actorId: user.id } });
      }
      if (patch.preferredTeacherIds) {
        await tx.clientPreferredTeacher.deleteMany({ where: { clientId } });
        if (patch.preferredTeacherIds.length) {
          await tx.clientPreferredTeacher.createMany({ data: patch.preferredTeacherIds.map((teacherId) => ({ clientId, teacherId })), skipDuplicates: true });
        }
      }
      if (client.userId === user.id && (patch.firstName || patch.lastName !== undefined)) {
        await tx.user.update({
          where: { id: user.id },
          data: { displayName: fullName(patch.firstName ?? client.firstName, patch.lastName === undefined ? client.lastName : patch.lastName) },
        });
      }
    });
    this.authContext.invalidateUser(user.id);
    return this.profile(clientId);
  }

  // ─── Home ───

  async home(clientId: string, user: AuthUser) {
    const tz = await this.catalog.defaultTimezone();
    const now = this.clock.now();
    const local = DateTime.fromJSDate(now, { zone: tz });
    const today = local.toISODate() as string;
    const tomorrow = local.plus({ days: 1 }).toISODate() as string;

    const [client, overview, upcoming, payments, unread, announcements, stats, schedule, trialSettings, membershipsEver] = await Promise.all([
      this.prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
      this.memberships.overviewForClient(clientId),
      this.bookings.myBookings(clientId, { scope: 'upcoming', limit: 5 }),
      this.payments.listForClient(clientId),
      this.notifications.unreadCount(user.id, 'CLIENT'),
      this.announcements.forClient(clientId),
      this.stats.stats(clientId),
      this.bookings.scheduleForViewer(
        { from: now.toISOString(), to: localToUtc(local.plus({ days: 8 }).toISODate() as string, '00:00', tz).toISOString() },
        clientId,
      ),
      this.settings.get('trial'),
      this.prisma.membership.count({ where: { clientId } }),
    ]);

    const bookable = schedule.filter((s) => s.bookability?.canBook || s.bookability?.canBookTrial);
    const isOpen = (s: ClientSessionDto) => (s.status === 'OPEN' || s.status === 'ALMOST_FULL') && !s.myBooking;
    const preferred = (s: ClientSessionDto) => {
      const hour = Number(s.startTime.slice(0, 2));
      const slot: TimeOfDay = hour < 12 ? 'MORNING' : hour < 17 ? 'AFTERNOON' : 'EVENING';
      return (!client.preferredDays.length || client.preferredDays.includes(s.weekday)) && (!client.preferredTimes.length || client.preferredTimes.includes(slot));
    };
    const recommended = bookable.find((s) => preferred(s) && !s.bookability?.levelWarning) ?? bookable.find((s) => !s.bookability?.levelWarning) ?? bookable[0] ?? null;

    return {
      greetingName: client.firstName,
      membership: overview.current,
      nextBooking: upcoming.items[0] ?? null,
      upcomingCount: upcoming.items.length,
      waitlist: upcoming.waitlist,
      pendingPayments: payments.filter((p) => p.status === 'PENDING'),
      unreadNotifications: unread,
      recommended,
      today: schedule.filter((s) => s.localDate === today && isOpen(s)).slice(0, 6),
      tomorrow: schedule.filter((s) => s.localDate === tomorrow && isOpen(s)).slice(0, 6),
      announcements,
      stats: {
        attendedThisMonth: stats.thisMonth.attended,
        minutesThisMonth: stats.thisMonth.minutes,
        streakWeeks: stats.currentStreakWeeks,
        totalAttended: stats.sessionsAttended,
      },
      trialAvailable: trialSettings.enabled && trialSettings.allowSelfBooking && membershipsEver === 0,
      trialPrice: trialSettings.price,
      hasEverHadMembership: membershipsEver > 0,
    };
  }

  // ─── Referral ───

  async referral(clientId: string) {
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const code = await this.referrals.ensureCode(this.prisma, clientId, client.firstName);
    const [cfg, referrals] = await Promise.all([
      this.settings.get('referrals'),
      this.prisma.referral.findMany({
        where: { referrerClientId: clientId },
        include: { referred: { select: { firstName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      enabled: cfg.enabled,
      code,
      link: `${this.config.appUrl}/register?ref=${encodeURIComponent(code)}`,
      rewardDescription: cfg.rewardDescription,
      referrals: referrals.map((r) => ({ firstName: r.referred.firstName, status: r.status, createdAt: r.createdAt })),
    };
  }

  // ─── Family (parent / guardian) ───

  async family(user: AuthUser) {
    const links = await this.prisma.clientGuardian.findMany({
      where: { guardianUserId: user.id },
      include: { client: { include: profileInclude } },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      links.map(async (l) => ({
        profile: toProfileDto(l.client),
        relationship: l.relationship,
        membership: (await this.memberships.overviewForClient(l.clientId)).current,
      })),
    );
  }

  async addChild(input: ChildInput, user: AuthUser) {
    const category = input.category ?? 'CHILD';
    if (category !== 'CHILD' && category !== 'TEEN') throw new DomainError('VALIDATION_FAILED', { message: 'Child profiles are for children and teenagers.' });
    const child = await this.prisma.transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          firstName: input.firstName.trim(),
          lastName: input.lastName?.trim() || null,
          birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null,
          levelId: input.levelId ?? null,
          category,
        },
      });
      await tx.clientGuardian.create({ data: { guardianUserId: user.id, clientId: client.id, relationship: 'parent' } });
      await tx.clientActivity.create({ data: { clientId: client.id, type: 'client.created', title: `Child profile created by ${user.displayName}`, actorId: user.id } });
      return client;
    });
    await this.pipeline.ensureLead(child.id);
    this.authContext.invalidateUser(user.id);
    return this.family(user);
  }

  async updateChild(childId: string, input: Partial<ChildInput>, user: AuthUser) {
    const link = await this.prisma.clientGuardian.findUnique({ where: { guardianUserId_clientId: { guardianUserId: user.id, clientId: childId } } });
    if (!link) throw notFound('Child profile');
    await this.prisma.client.update({
      where: { id: childId },
      data: {
        firstName: input.firstName?.trim(),
        lastName: input.lastName === undefined ? undefined : input.lastName?.trim() || null,
        birthDate: input.birthDate === undefined ? undefined : input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null,
        levelId: input.levelId,
      },
    });
    return this.family(user);
  }

  // ─── Privacy ───

  async exportData(clientId: string, user: AuthUser) {
    const [client, memberships, bookings, payments, feedback, consents, notifications] = await Promise.all([
      this.prisma.client.findUniqueOrThrow({ where: { id: clientId }, include: { level: true, source: true } }),
      this.prisma.membership.findMany({ where: { clientId }, include: { transactions: true } }),
      this.prisma.booking.findMany({ where: { clientId }, include: { attendance: true, session: { include: { teacher: { select: { firstName: true, lastName: true } } } } } }),
      this.prisma.payment.findMany({ where: { clientId }, include: { method: { select: { name: true } } } }),
      this.prisma.teacherFeedback.findMany({ where: { clientId, isVisibleToClient: true } }),
      this.prisma.agreementAcceptance.findMany({ where: { clientId }, include: { document: { select: { title: true, version: true } } } }),
      this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 500 }),
    ]);
    await this.prisma.dataRequest.create({
      data: { userId: user.id, clientId, type: 'EXPORT', status: 'COMPLETED', processedAt: this.clock.now() },
    });
    return {
      exportedAt: this.clock.now(),
      profile: {
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
        email: client.email,
        birthDate: client.birthDate,
        category: client.category,
        level: client.level?.name ?? null,
        preferredDays: client.preferredDays,
        preferredTimes: client.preferredTimes,
        formatPreference: client.formatPreference,
        marketingConsent: client.marketingConsent,
        source: client.source?.name ?? null,
        registeredAt: client.createdAt,
      },
      memberships: memberships.map((m) => ({
        plan: m.planName,
        status: m.status,
        visitsTotal: m.visitsTotal,
        visitsRemaining: m.visitsRemaining,
        startsAt: m.startsAt,
        expiresAt: m.expiresAt,
        price: m.price,
        ledger: m.transactions.map((t) => ({ type: t.type, delta: t.delta, balanceAfter: t.balanceAfter, reason: t.reason, at: t.createdAt })),
      })),
      bookings: bookings.map((b) => ({
        session: b.session.startsAt,
        teacher: b.session.teacher ? fullName(b.session.teacher.firstName, b.session.teacher.lastName) : null,
        status: b.status,
        attendance: b.attendance?.status ?? null,
        bookedAt: b.bookedAt,
        cancelledAt: b.cancelledAt,
        visitReturned: b.visitReturned,
      })),
      payments: payments.map((p) => ({ amount: p.amount, currency: p.currency, status: p.status, method: p.method.name, description: p.description, createdAt: p.createdAt, paidAt: p.paidAt })),
      feedback: feedback.map((f) => ({ comment: f.comment, fluency: f.fluency, vocabulary: f.vocabulary, confidence: f.confidence, participation: f.participation, at: f.createdAt })),
      consents: consents.map((c) => ({ document: c.document.title, version: c.document.version, context: c.context, acceptedAt: c.acceptedAt })),
      notifications: notifications.map((n) => ({ title: n.title, body: n.body, at: n.createdAt, readAt: n.readAt })),
    };
  }

  async requestDeletion(clientId: string, reason: string | undefined, user: AuthUser) {
    const pending = await this.prisma.dataRequest.findFirst({ where: { userId: user.id, type: 'DELETION', status: 'PENDING' } });
    if (!pending) {
      await this.prisma.dataRequest.create({ data: { userId: user.id, clientId, type: 'DELETION', reason } });
      const client = await this.prisma.client.update({ where: { id: clientId }, data: { deletionRequestedAt: this.clock.now() } });
      await this.prisma.clientActivity.create({ data: { clientId, type: 'privacy.deletion_request', title: 'Requested account deletion', actorId: user.id } });
      await this.notifications.notifyStaff('dataRequest', 'admin.data_request', { clientId, clientName: fullName(client.firstName, client.lastName), phone: client.phone ?? '' }, 'clients.delete');
    }
    return { requested: true };
  }

  async agreements(clientId: string) {
    const rows = await this.prisma.agreementAcceptance.findMany({
      where: { clientId },
      include: { document: { select: { title: true, type: true, version: true } } },
      orderBy: { acceptedAt: 'desc' },
    });
    return rows.map((r) => ({ title: r.document.title, type: r.document.type, version: r.document.version, context: r.context, acceptedAt: r.acceptedAt }));
  }
}
