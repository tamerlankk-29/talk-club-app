import { Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClockService } from '../../common/clock/clock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { AttendanceService } from '../attendance/attendance.service';
import { AutomationsModule } from '../automations/automations.module';
import { AutomationsService } from '../automations/automations.service';
import { PipelineService } from '../crm/pipeline.service';
import { BroadcastsService } from '../marketing/broadcasts.service';
import { MarketingModule } from '../marketing/marketing.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RemindersService } from '../notifications/reminders.service';
import { SegmentsService } from '../segments/segments.service';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionsService } from '../sessions/sessions.service';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { WaitlistService } from '../waitlist/waitlist.service';

/**
 * Background jobs. Each job takes a PostgreSQL advisory lock, so with several
 * API instances only one runs a given job at a time. Jobs are idempotent: a
 * missed run is simply caught up by the next one.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly waitlist: WaitlistService,
    private readonly automations: AutomationsService,
    private readonly broadcasts: BroadcastsService,
    private readonly notifications: NotificationsService,
    private readonly reminders: RemindersService,
    private readonly attendance: AttendanceService,
    private readonly memberships: MembershipsService,
    private readonly pipeline: PipelineService,
    private readonly sessions: SessionsService,
    private readonly segments: SegmentsService,
  ) {}

  private async exclusive(name: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${`job:${name}`})) AS locked`;
          if (!locked) return;
          await fn();
        },
        { timeout: 10 * 60_000, maxWait: 5_000 },
      );
    } catch (error) {
      this.logger.error(`Job ${name} failed: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  everyMinute() {
    return this.exclusive('minute', async () => {
      await this.waitlist.expireOffers();
      await this.automations.runDue();
      await this.broadcasts.dispatchDue();
      await this.notifications.dispatchPending();
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  everyFiveMinutes() {
    return this.exclusive('five-minutes', async () => {
      await this.reminders.sendDue();
      await this.attendance.finalizeDue();
    });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  everyTenMinutes() {
    return this.exclusive('ten-minutes', () => this.automations.scanScheduled());
  }

  @Cron(CronExpression.EVERY_HOUR)
  hourly() {
    return this.exclusive('hourly', async () => {
      await this.memberships.expireDue();
      await this.pipeline.refreshLifecycle();
    });
  }

  @Cron('0 3 * * *', { timeZone: 'Asia/Almaty' })
  nightly() {
    return this.exclusive('nightly', async () => {
      await this.sessions.generateAll();
      await this.segments.ensureSystemSegments();
      await this.automations.ensureDefaults();
      const now = this.clock.now();
      const { count: otp } = await this.prisma.otpCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86_400_000) } } });
      const { count: sessions } = await this.prisma.authSession.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } }] },
      });
      this.logger.log(`Nightly cleanup: ${otp} OTP codes, ${sessions} auth sessions removed`);
    });
  }
}

@Module({
  imports: [WaitlistModule, AutomationsModule, MarketingModule, AttendanceModule, MembershipsModule, SessionsModule],
  providers: [JobsService],
})
export class JobsModule {}
