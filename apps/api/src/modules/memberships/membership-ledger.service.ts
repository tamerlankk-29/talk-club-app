import { Injectable } from '@nestjs/common';
import type { MembershipTransaction, MembershipTxType } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { lockRows, Tx } from '../../prisma/prisma.service';

export interface LedgerEntryInput {
  membershipId: string;
  type: MembershipTxType;
  delta: number;
  bookingId?: string | null;
  reason?: string | null;
  createdById?: string | null;
  expiresAtBefore?: Date | null;
  expiresAtAfter?: Date | null;
  /** Error to raise if the balance would go negative (defaults to MEMBERSHIP_BALANCE_NEGATIVE). */
  insufficientError?: ErrorCode;
}

/**
 * The only writer of visit balances. Each call locks the membership row, appends
 * an immutable ledger entry with the running balance, and updates the cached
 * `visits_remaining` in the same transaction. A CHECK constraint guarantees the
 * balance can never go below zero even if this code were bypassed.
 */
@Injectable()
export class MembershipLedgerService {
  async post(tx: Tx, entry: LedgerEntryInput): Promise<MembershipTransaction> {
    await lockRows(tx, 'memberships', [entry.membershipId]);
    const membership = await tx.membership.findUniqueOrThrow({
      where: { id: entry.membershipId },
      select: { visitsRemaining: true },
    });
    const balance = membership.visitsRemaining + entry.delta;
    if (balance < 0) throw new DomainError(entry.insufficientError ?? 'MEMBERSHIP_BALANCE_NEGATIVE');
    if (entry.delta !== 0) {
      await tx.membership.update({ where: { id: entry.membershipId }, data: { visitsRemaining: balance } });
    }
    return tx.membershipTransaction.create({
      data: {
        membershipId: entry.membershipId,
        type: entry.type,
        delta: entry.delta,
        balanceAfter: balance,
        bookingId: entry.bookingId ?? null,
        reason: entry.reason ?? null,
        createdById: entry.createdById ?? null,
        expiresAtBefore: entry.expiresAtBefore ?? null,
        expiresAtAfter: entry.expiresAtAfter ?? null,
      },
    });
  }

  /** Recomputes the balance from the ledger (used by consistency checks and tests). */
  async ledgerBalance(tx: Tx, membershipId: string): Promise<number> {
    const agg = await tx.membershipTransaction.aggregate({ where: { membershipId }, _sum: { delta: true } });
    return agg._sum.delta ?? 0;
  }
}

/** Ledger types that count as credits (visits granted) rather than usage. */
export const CREDIT_TYPES: MembershipTxType[] = ['PURCHASE', 'GRANT', 'ADMIN_ADJUSTMENT'];
/** Ledger types that represent visit usage (booking) and its reversals. */
export const USAGE_TYPES: MembershipTxType[] = ['BOOKING', 'CANCELLATION_REFUND', 'SESSION_CANCELLED_REFUND', 'ADMIN_RETURN'];
