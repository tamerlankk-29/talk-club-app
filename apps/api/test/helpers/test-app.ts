import type { INestApplication, Type } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ClockService } from '../../src/common/clock/clock.service';
import { loadConfig } from '../../src/config/app-config';
import { MessageOutbox } from '../../src/modules/messaging/message-outbox';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { syncRbac } from '../../src/modules/rbac/rbac.sync';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  clock: ClockService;
  outbox: MessageOutbox;
  http: () => ReturnType<typeof request>;
  get<T>(type: Type<T>): T;
  close(): Promise<void>;
}

/** Wipes every table (except migration history) — only ever on the dedicated test database. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const [{ db }] = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (!/test/i.test(db)) throw new Error(`Refusing to truncate non-test database "${db}"`);
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
}

/** `configure` can swap providers, e.g. replace an external API client with a fake. */
export async function createTestApp(configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder): Promise<TestApp> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (configure ? configure(builder) : builder).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app, loadConfig());
  const prisma = app.get(PrismaService);
  await prisma.$connect();
  await resetDatabase(prisma);
  await app.init();
  await syncRbac(prisma);
  app.get(SettingsService).invalidate();
  const clock = app.get(ClockService);
  return {
    app,
    prisma,
    clock,
    outbox: app.get(MessageOutbox),
    http: () => request(app.getHttpServer()),
    get: <T>(type: Type<T>) => app.get(type),
    close: async () => {
      clock.set(null);
      await app.close();
    },
  };
}

/** Sends queued notification deliveries (dispatch is manual in tests). */
export async function flushNotifications(t: TestApp): Promise<void> {
  await t.get(NotificationsService).dispatchPending();
}
