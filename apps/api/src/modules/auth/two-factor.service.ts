import { Inject, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from './totp';

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;

/**
 * Two-factor sign-in with an authenticator app. Owners and admins (AUTH_2FA_REQUIRED_ROLES)
 * must use it; anyone who turned it on is always asked for a code. After the password or
 * phone code is checked, sign-in stops with AUTH_TOTP_REQUIRED (or AUTH_TOTP_SETUP_REQUIRED
 * with the QR secret) and a challenge token that POST /auth/totp/verify exchanges for a session.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly tokens: TokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Throws the 2FA challenge when this user needs a second factor; returns when they don't. */
  async gate(user: User): Promise<void> {
    if (user.totpEnabledAt) {
      throw new DomainError('AUTH_TOTP_REQUIRED', { details: { challengeToken: this.tokens.signMfaChallenge(user.id) } });
    }
    if (!(await this.isRequired(user.id))) return;
    // Keep a pending secret across attempts so a QR code scanned earlier still works.
    let secret = user.totpSecret ? this.decrypt(user.totpSecret) : null;
    if (!secret) {
      secret = generateTotpSecret();
      await this.prisma.user.update({ where: { id: user.id }, data: { totpSecret: encryptTotpSecret(secret, this.config.auth.secret) } });
    }
    throw new DomainError('AUTH_TOTP_SETUP_REQUIRED', {
      details: {
        challengeToken: this.tokens.signMfaChallenge(user.id),
        secret,
        otpauthUrl: otpauthUrl(secret, user.email ?? user.phone ?? user.displayName ?? 'staff'),
      },
    });
  }

  async isRequired(userId: string): Promise<boolean> {
    if (!this.config.auth.twoFactorRoles.length) return false;
    const count = await this.prisma.userRole.count({ where: { userId, role: { key: { in: this.config.auth.twoFactorRoles } } } });
    return count > 0;
  }

  /**
   * Checks the code for a challenge. On first setup it turns 2FA on and returns the
   * recovery codes to show once. A recovery code works in place of an app code, once.
   */
  async verify(challengeToken: string, code: string): Promise<{ userId: string; recoveryCodes?: string[] }> {
    const userId = this.tokens.verifyMfaChallenge(challengeToken);
    if (!userId) throw new DomainError('AUTH_MFA_CHALLENGE_INVALID');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpSecret) throw new DomainError('AUTH_MFA_CHALLENGE_INVALID');
    const now = this.clock.now();
    if (user.totpLockedUntil && user.totpLockedUntil > now) throw new DomainError('AUTH_TOTP_LOCKED');

    const secret = this.decrypt(user.totpSecret);
    if (!secret) throw new DomainError('AUTH_MFA_CHALLENGE_INVALID');
    const step = verifyTotp(secret, code, now.getTime(), user.totpLastStep);
    const recoveryHash = step === null && user.totpEnabledAt ? hashRecoveryCode(code) : null;
    const recoveryUsed = !!recoveryHash && user.totpRecoveryCodes.includes(recoveryHash);

    if (step === null && !recoveryUsed) {
      const failures = user.totpFailedCount + 1;
      const locked = failures >= MAX_FAILURES;
      await this.prisma.user.update({
        where: { id: user.id },
        data: locked ? { totpFailedCount: 0, totpLockedUntil: new Date(now.getTime() + LOCK_MS) } : { totpFailedCount: failures },
      });
      throw new DomainError(locked ? 'AUTH_TOTP_LOCKED' : 'AUTH_TOTP_INVALID');
    }

    const settingUp = !user.totpEnabledAt;
    const recoveryCodes = settingUp ? generateRecoveryCodes() : undefined;
    // Conditional update: two requests racing with the same code can't both succeed.
    const updated = await this.prisma.user.updateMany({
      where: { id: user.id, totpLastStep: user.totpLastStep, totpRecoveryCodes: { equals: user.totpRecoveryCodes } },
      data: {
        totpFailedCount: 0,
        totpLockedUntil: null,
        ...(step !== null ? { totpLastStep: step } : {}),
        ...(recoveryUsed ? { totpRecoveryCodes: user.totpRecoveryCodes.filter((h) => h !== recoveryHash) } : {}),
        ...(settingUp ? { totpEnabledAt: now, totpRecoveryCodes: recoveryCodes!.map(hashRecoveryCode) } : {}),
      },
    });
    if (updated.count !== 1) throw new DomainError('AUTH_TOTP_INVALID');
    return { userId: user.id, recoveryCodes };
  }

  /** Turns 2FA off (staff reset or the reset-2fa script); required roles set it up again at next sign-in. */
  async reset(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryCodes: [], totpFailedCount: 0, totpLockedUntil: null },
    });
  }

  private decrypt(stored: string): string | null {
    try {
      return decryptTotpSecret(stored, this.config.auth.secret);
    } catch {
      return null;
    }
  }
}
