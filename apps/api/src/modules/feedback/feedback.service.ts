import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { hasPermission } from '../../common/auth/auth-user';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { fullName } from '../../common/utils/names';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

export const FEEDBACK_METRICS = ['participation', 'fluency', 'vocabulary', 'confidence', 'pronunciation', 'conversation'] as const;
export type FeedbackMetric = (typeof FEEDBACK_METRICS)[number];

export interface FeedbackInput {
  participation?: number | null;
  fluency?: number | null;
  vocabulary?: number | null;
  confidence?: number | null;
  pronunciation?: number | null;
  conversation?: number | null;
  comment?: string | null;
  isVisibleToClient?: boolean;
}

const feedbackInclude = {
  teacher: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
  session: { select: { id: true, startsAt: true, title: true, groupType: { select: { name: true } } } },
  client: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TeacherFeedbackInclude;
type FeedbackRow = Prisma.TeacherFeedbackGetPayload<{ include: typeof feedbackInclude }>;

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Teacher (own session) or staff with attendance.manage writes feedback for an attended booking. */
  async upsert(bookingId: string, input: FeedbackInput, user: AuthUser) {
    const cfg = await this.settings.get('feedback');
    if (!cfg.enabled) throw new DomainError('FEEDBACK_DISABLED');
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { session: true, feedback: true } });
    if (!booking) throw notFound('Booking');
    const isOwnSession = !!user.teacherId && booking.session.teacherId === user.teacherId;
    if (!(isOwnSession && hasPermission(user, 'feedback.write')) && !hasPermission(user, 'attendance.manage')) {
      throw new DomainError('ATTENDANCE_NOT_YOUR_SESSION');
    }
    if (booking.status !== 'ATTENDED') {
      throw new DomainError('CONFLICT', { message: 'Feedback can be given only for attended sessions.' });
    }
    const visible = input.isVisibleToClient ?? cfg.visibleToClients;
    const data = {
      participation: input.participation ?? null,
      fluency: input.fluency ?? null,
      vocabulary: input.vocabulary ?? null,
      confidence: input.confidence ?? null,
      pronunciation: input.pronunciation ?? null,
      conversation: input.conversation ?? null,
      comment: input.comment?.trim() || null,
      isVisibleToClient: visible,
    };
    const row = await this.prisma.teacherFeedback.upsert({
      where: { bookingId },
      create: {
        ...data,
        bookingId,
        sessionId: booking.sessionId,
        clientId: booking.clientId,
        teacherId: booking.session.teacherId,
        authorId: user.id,
      },
      update: { ...data, authorId: user.id },
      include: feedbackInclude,
    });
    if (!booking.feedback) {
      await this.prisma.clientActivity.create({
        data: { clientId: booking.clientId, type: 'feedback', title: `Teacher feedback received${data.comment ? `: "${data.comment.slice(0, 80)}"` : ''}`, actorId: user.id },
      });
      if (visible) {
        await this.notifications.notifyClient(booking.clientId, {
          templateKey: 'feedback.received',
          vars: {
            teacherName: row.teacher ? fullName(row.teacher.firstName, row.teacher.lastName) : 'your teacher',
            comment: data.comment ?? 'Your teacher left you feedback on your last session.',
          },
        });
      }
    }
    return this.toDto(row);
  }

  async forClient(clientId: string, onlyVisible: boolean) {
    const rows = await this.prisma.teacherFeedback.findMany({
      where: { clientId, ...(onlyVisible ? { isVisibleToClient: true } : {}) },
      include: feedbackInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDto(r));
  }

  async list(filter: { clientId?: string; teacherId?: string }) {
    const rows = await this.prisma.teacherFeedback.findMany({
      where: { clientId: filter.clientId, teacherId: filter.teacherId },
      include: feedbackInclude,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map((r) => this.toDto(r));
  }

  /** Progress over time: average scores per month plus the level history. */
  async progress(clientId: string, onlyVisible: boolean) {
    const [feedback, levels] = await Promise.all([
      this.forClient(clientId, onlyVisible),
      this.prisma.clientLevel.findMany({ where: { clientId }, include: { level: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const averages = Object.fromEntries(
      FEEDBACK_METRICS.map((m) => {
        const values = feedback.map((f) => f.scores[m]).filter((v): v is number => typeof v === 'number');
        return [m, values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null];
      }),
    ) as Record<FeedbackMetric, number | null>;
    const byMonth = new Map<string, Record<FeedbackMetric, number[]>>();
    for (const f of feedback) {
      const key = f.sessionStartsAt.toISOString().slice(0, 7);
      const bucket = byMonth.get(key) ?? (Object.fromEntries(FEEDBACK_METRICS.map((m) => [m, []])) as unknown as Record<FeedbackMetric, number[]>);
      for (const m of FEEDBACK_METRICS) if (typeof f.scores[m] === 'number') bucket[m].push(f.scores[m] as number);
      byMonth.set(key, bucket);
    }
    const trend = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, bucket]) => ({
        month,
        ...(Object.fromEntries(
          FEEDBACK_METRICS.map((m) => [m, bucket[m].length ? Math.round((bucket[m].reduce((a, b) => a + b, 0) / bucket[m].length) * 10) / 10 : null]),
        ) as Record<FeedbackMetric, number | null>),
      }));
    return {
      averages,
      trend,
      feedback,
      levelHistory: levels.map((l) => ({ level: l.level.name, reason: l.reason, date: l.createdAt })),
    };
  }

  private toDto(r: FeedbackRow) {
    return {
      id: r.id,
      bookingId: r.bookingId,
      sessionId: r.sessionId,
      sessionTitle: r.session.title ?? r.session.groupType?.name ?? 'Speaking Club',
      sessionStartsAt: r.session.startsAt,
      client: { id: r.client.id, name: fullName(r.client.firstName, r.client.lastName) },
      teacher: r.teacher ? { id: r.teacher.id, name: fullName(r.teacher.firstName, r.teacher.lastName), photoUrl: r.teacher.photoUrl } : null,
      scores: {
        participation: r.participation,
        fluency: r.fluency,
        vocabulary: r.vocabulary,
        confidence: r.confidence,
        pronunciation: r.pronunciation,
        conversation: r.conversation,
      },
      comment: r.comment,
      isVisibleToClient: r.isVisibleToClient,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
