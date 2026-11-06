import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Interactive-transaction client type, used by services that participate in a caller's transaction. */
export type Tx = Prisma.TransactionClient;
/** Either the root client or a transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Query errors surface as exceptions (handled or logged by AllExceptionsFilter),
      // so only engine warnings are logged here.
      log: [{ emit: 'event', level: 'warn' }],
    });
  }

  async onModuleInit(): Promise<void> {
    (this as unknown as PrismaClient<Prisma.PrismaClientOptions, 'warn'>).$on('warn', (e) => this.logger.warn(e.message));
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Runs `fn` in a READ COMMITTED transaction. Business operations that must be
   * serialised (booking a seat, changing a visit balance) take explicit row locks
   * via `lockRows` inside the callback.
   */
  transaction<T>(fn: (tx: Tx) => Promise<T>, timeoutMs = 15_000): Promise<T> {
    return this.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 10_000,
      timeout: timeoutMs,
    });
  }
}

type LockableTable = 'clients' | 'sessions' | 'memberships' | 'payments' | 'waitlist_entries' | 'bookings' | 'trials';

/**
 * SELECT … FOR UPDATE on the given ids, in a stable order to avoid deadlocks.
 * Must be called inside a transaction.
 */
export async function lockRows(tx: Tx, table: LockableTable, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  if (!unique.length) return;
  await tx.$queryRawUnsafe(
    `SELECT id FROM "${table}" WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    unique,
  );
}

/** Transaction-scoped advisory lock for resources that have no row yet (e.g. a room time slot). */
export async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
