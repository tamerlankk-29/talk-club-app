import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './common/auth/auth.guard';
import { ClockModule } from './common/clock/clock.service';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { BaselineBootstrap } from './database/baseline.bootstrap';
import { validationExceptionFactory } from './common/errors/validation';
import { EventBusModule } from './common/events/event-bus.service';
import { AppConfigModule } from './config/config.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './modules/audit/audit.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './modules/health/health.controller';
import { LegalModule } from './modules/legal/legal.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { ClientsModule } from './modules/clients/clients.module';
import { CrmModule } from './modules/crm/crm.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { MeModule } from './modules/me/me.module';
import { SegmentsModule } from './modules/segments/segments.module';
import { TeacherPortalModule } from './modules/teacher-portal/teacher-portal.module';
import { TrialsModule } from './modules/trials/trials.module';
import { DataTransferModule } from './modules/data-transfer/data-transfer.module';
import { FilesModule } from './modules/files/files.module';
import { JobsModule } from './modules/jobs/jobs.service';
import { PublicModule } from './modules/public/public.controller';
import { ReportsModule } from './modules/reports/reports.module';
import { SearchModule } from './modules/search/search.controller';
import { PrismaModule } from './prisma/prisma.module';

const jobsEnabled = process.env.NODE_ENV !== 'test' && process.env.JOBS_ENABLED !== 'false';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ClockModule,
    EventEmitterModule.forRoot({ maxListeners: 50 }),
    EventBusModule,
    ...(jobsEnabled ? [ScheduleModule.forRoot()] : []),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    MessagingModule,
    AuditModule,
    SettingsModule,
    AuthModule,
    LegalModule,
    ReferralsModule,
    CatalogModule,
    TeachersModule,
    MembershipsModule,
    PaymentsModule,
    SessionsModule,
    BookingsModule,
    WaitlistModule,
    AttendanceModule,
    NotificationsModule,
    RbacModule,
    SegmentsModule,
    CrmModule,
    ClientsModule,
    TrialsModule,
    AutomationsModule,
    MarketingModule,
    FeedbackModule,
    MeModule,
    TeacherPortalModule,
    ReportsModule,
    DataTransferModule,
    FilesModule,
    SearchModule,
    PublicModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    BaselineBootstrap,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        stopAtFirstError: false,
        exceptionFactory: validationExceptionFactory,
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
