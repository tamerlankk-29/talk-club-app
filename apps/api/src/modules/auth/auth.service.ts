import { Inject, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { EventBus } from '../../common/events/event-bus.service';
import { ClientRegisteredEvent, Events } from '../../common/events/events';
import { RequestContext } from '../../common/request-context';
import { normalizePhone } from '../../common/utils/phone';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { LegalService } from '../legal/legal.service';
import { isStaffPermissionSet, ROLE_KEYS } from '../rbac/permissions';
import { ReferralsService } from '../referrals/referrals.service';
import { AuthContextService } from './auth-context.service';
import { RegisterDto, SessionUserDto } from './dto/auth.dto';
import { OtpChannel, OtpService } from './otp.service';
import { hashPassword, isStrongPassword, verifyPassword } from './password';
import { TokenService } from './token.service';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  expiresIn: number;
  user: SessionUserDto;
}

/** How long a refresh token stays usable after being rotated (aborted responses, parallel tabs). */
const REFRESH_REUSE_GRACE_MS = 60_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly authContext: AuthContextService,
    private readonly legal: LegalService,
    private readonly referrals: ReferralsService,
    private readonly events: EventBus,
    private readonly clock: ClockService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Phone verification ───

  requirePhone(raw: string): string {
    const phone = normalizePhone(raw);
    if (!phone) throw new DomainError('AUTH_PHONE_INVALID');
    return phone;
  }

  async requestLoginCode(rawPhone: string, channel?: OtpChannel) {
    const phone = this.requirePhone(rawPhone);
    return this.otp.request(phone, 'LOGIN', RequestContext.get()?.ip ?? null, channel);
  }

  otpChannels() {
    return this.otp.availableChannels();
  }

  /**
   * Verifies the SMS code. Existing users are signed in; new phone numbers get a
   * short-lived registration token for POST /auth/register. Account existence is
   * never revealed before the caller proves they own the phone.
   */
  async verifyLoginCode(
    rawPhone: string,
    code: string,
  ): Promise<{ status: 'AUTHENTICATED'; session: IssuedSession } | { status: 'REGISTRATION_REQUIRED'; registrationToken: string; phone: string }> {
    const phone = this.requirePhone(rawPhone);
    await this.otp.verify(phone, code, 'LOGIN');
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || user.status === 'DELETED') {
      return { status: 'REGISTRATION_REQUIRED', registrationToken: this.tokens.signRegistration(phone), phone };
    }
    this.assertActive(user);
    if (!user.phoneVerifiedAt) {
      await this.prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: this.clock.now() } });
    }
    return { status: 'AUTHENTICATED', session: await this.issueSession(user.id) };
  }

  // ─── Registration ───

  async register(dto: RegisterDto): Promise<IssuedSession> {
    const phone = this.tokens.verifyRegistration(dto.registrationToken);
    if (!phone) throw new DomainError('AUTH_REGISTRATION_TOKEN_INVALID');
    if (!dto.acceptTerms) throw new DomainError('AUTH_TERMS_REQUIRED');
    if (dto.password && !isStrongPassword(dto.password)) throw new DomainError('AUTH_PASSWORD_WEAK');
    const email = dto.email?.trim().toLowerCase() || null;
    const now = this.clock.now();
    const passwordHash = dto.password ? await hashPassword(dto.password) : null;

    const { userId, clientId, referralCodeUsed } = await this.prisma.transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { phone } })) throw new DomainError('AUTH_PHONE_TAKEN');
      if (email && (await tx.user.findUnique({ where: { email } }))) throw new DomainError('AUTH_EMAIL_TAKEN');

      const clientRole = await tx.role.findUniqueOrThrow({ where: { key: ROLE_KEYS.CLIENT } });
      const displayName = [dto.firstName.trim(), dto.lastName?.trim()].filter(Boolean).join(' ');
      const user = await tx.user.create({
        data: {
          phone,
          email,
          passwordHash,
          displayName,
          phoneVerifiedAt: now,
          lastLoginAt: now,
          roles: { create: { roleId: clientRole.id } },
        },
      });

      const source = await this.resolveSource(tx, dto.referralCode ? 'REFERRAL' : dto.sourceCode);
      const profile = {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        email,
        birthDate: dto.birthDate ? new Date(`${dto.birthDate}T00:00:00Z`) : undefined,
        category: dto.category,
        preferredDays: dto.preferredDays,
        preferredTimes: dto.preferredTimes,
        formatPreference: dto.formatPreference,
        marketingConsent: dto.marketingConsent,
        marketingConsentAt: dto.marketingConsent ? now : null,
      };

      // A client record may already exist for this phone (trial request, admin entry,
      // Altegio import). Link it instead of creating a duplicate.
      const existing = await tx.client.findUnique({ where: { phone } });
      if (existing?.userId) throw new DomainError('AUTH_PHONE_TAKEN');
      const client = existing
        ? await tx.client.update({
            where: { id: existing.id },
            data: {
              ...profile,
              userId: user.id,
              levelId: existing.levelId ?? dto.levelId ?? null,
              sourceId: existing.sourceId ?? source?.id ?? null,
            },
          })
        : await tx.client.create({
            data: { ...profile, phone, userId: user.id, levelId: dto.levelId ?? null, sourceId: source?.id ?? null },
          });

      if (dto.levelId && !existing?.levelId) {
        await tx.clientLevel.create({ data: { clientId: client.id, levelId: dto.levelId, reason: 'Self-assessed at registration' } });
      }
      await this.legal.recordAcceptance(tx, {
        userId: user.id,
        clientId: client.id,
        types: ['TERMS', 'PRIVACY_POLICY'],
        context: 'REGISTRATION',
      });
      await this.referrals.ensureCode(tx, client.id, client.firstName);
      const referralCodeUsed = await this.referrals.applyCode(tx, client.id, dto.referralCode);
      await tx.clientActivity.create({
        data: { clientId: client.id, type: 'client.registered', title: 'Registered in the Talk Club app', actorId: user.id },
      });
      return { userId: user.id, clientId: client.id, referralCodeUsed };
    });

    await this.events.publish<ClientRegisteredEvent>(Events.ClientRegistered, { clientId, userId, referralCodeUsed });
    return this.issueSession(userId);
  }

  private async resolveSource(tx: Tx, code: string | undefined | null) {
    const normalized = (code ?? 'WEBSITE').trim().toUpperCase();
    return (
      (await tx.leadSource.findUnique({ where: { code: normalized } })) ??
      (await tx.leadSource.findUnique({ where: { code: 'WEBSITE' } }))
    );
  }

  // ─── Password login ───

  async loginWithPassword(login: string, password: string): Promise<IssuedSession> {
    const phone = normalizePhone(login);
    const user = phone
      ? await this.prisma.user.findUnique({ where: { phone } })
      : await this.prisma.user.findUnique({ where: { email: login.trim().toLowerCase() } });
    // Same error and similar timing whether the account exists or not.
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !valid || user.status === 'DELETED') {
      throw new DomainError('AUTH_INVALID_CREDENTIALS');
    }
    this.assertActive(user);
    return this.issueSession(user.id);
  }

  async requestPasswordReset(rawPhone: string, channel?: OtpChannel) {
    const phone = this.requirePhone(rawPhone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    // Do not reveal whether the account exists.
    if (!user) {
      const available = this.otp.availableChannels();
      const shown: OtpChannel = channel ?? (available.sms || !available.telegram ? 'sms' : 'telegram');
      return { channel: shown, expiresInSeconds: 300, resendInSeconds: 60 };
    }
    return this.otp.request(phone, 'RESET_PASSWORD', RequestContext.get()?.ip ?? null, channel);
  }

  async resetPassword(rawPhone: string, code: string, newPassword: string): Promise<IssuedSession> {
    const phone = this.requirePhone(rawPhone);
    if (!isStrongPassword(newPassword)) throw new DomainError('AUTH_PASSWORD_WEAK');
    await this.otp.verify(phone, code, 'RESET_PASSWORD');
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new DomainError('AUTH_OTP_INVALID');
    this.assertActive(user);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
      this.prisma.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: this.clock.now() } }),
    ]);
    this.authContext.invalidateAll();
    return this.issueSession(user.id);
  }

  async changePassword(actor: AuthUser, currentPassword: string | undefined, newPassword: string): Promise<void> {
    if (!isStrongPassword(newPassword)) throw new DomainError('AUTH_PASSWORD_WEAK');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (user.passwordHash && !(await verifyPassword(currentPassword ?? '', user.passwordHash))) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', { message: 'Your current password is incorrect.' });
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
      // Sign out other devices, keep the current one.
      this.prisma.authSession.updateMany({
        where: { userId: user.id, revokedAt: null, NOT: actor.sessionId ? { id: actor.sessionId } : undefined },
        data: { revokedAt: this.clock.now() },
      }),
    ]);
    this.authContext.invalidateAll();
  }

  // ─── Sessions ───

  async issueSession(userId: string): Promise<IssuedSession> {
    const ctx = RequestContext.get();
    const now = this.clock.now();
    const { token, hash } = this.tokens.generateRefreshToken();
    const refreshExpiresAt = new Date(now.getTime() + this.config.auth.refreshTtlDays * 86_400_000);
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: hash,
        expiresAt: refreshExpiresAt,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
      },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: now } });
    return {
      accessToken: this.tokens.signAccess(userId, session.id),
      refreshToken: token,
      refreshExpiresAt,
      expiresIn: this.tokens.accessTtlSeconds,
      user: await this.sessionUser(userId, session.id),
    };
  }

  /** Rotates the refresh token: the presented token becomes invalid immediately. */
  async refresh(refreshToken: string): Promise<IssuedSession> {
    const now = this.clock.now();
    const presented = this.tokens.hashToken(refreshToken);
    const next = this.tokens.nextRefreshToken(refreshToken);
    const refreshExpiresAt = new Date(now.getTime() + this.config.auth.refreshTtlDays * 86_400_000);

    let session = await this.prisma.authSession.findUnique({ where: { refreshTokenHash: presented }, include: { user: true } });
    if (session) {
      if (session.revokedAt || session.expiresAt <= now) throw new DomainError('AUTH_REFRESH_INVALID');
      this.assertActive(session.user);
      const rotated = await this.prisma.authSession.updateMany({
        where: { id: session.id, refreshTokenHash: presented, revokedAt: null },
        data: { refreshTokenHash: next.hash, previousTokenHash: presented, rotatedAt: now, lastUsedAt: now, expiresAt: refreshExpiresAt },
      });
      // A concurrent request rotated it first — fall through to the grace path below.
      if (rotated.count === 1) return this.issue(session.userId, session.id, next.token, refreshExpiresAt);
    }

    // The token was just replaced: within the grace period hand out the same successor.
    session = await this.prisma.authSession.findUnique({ where: { previousTokenHash: presented }, include: { user: true } });
    const withinGrace = !!session?.rotatedAt && now.getTime() - session.rotatedAt.getTime() <= REFRESH_REUSE_GRACE_MS;
    if (!session || !withinGrace || session.refreshTokenHash !== next.hash || session.revokedAt || session.expiresAt <= now) {
      throw new DomainError('AUTH_REFRESH_INVALID');
    }
    this.assertActive(session.user);
    return this.issue(session.userId, session.id, next.token, session.expiresAt);
  }

  private async issue(userId: string, sessionId: string, refreshToken: string, refreshExpiresAt: Date): Promise<IssuedSession> {
    return {
      accessToken: this.tokens.signAccess(userId, sessionId),
      refreshToken,
      refreshExpiresAt,
      expiresIn: this.tokens.accessTtlSeconds,
      user: await this.sessionUser(userId, sessionId),
    };
  }

  async logout(refreshToken: string | null, sessionId: string | null): Promise<void> {
    const now = this.clock.now();
    if (refreshToken) {
      await this.prisma.authSession.updateMany({
        where: { refreshTokenHash: this.tokens.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: now },
      });
    }
    if (sessionId) {
      await this.prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: now } });
      this.authContext.invalidateSession(sessionId);
    }
  }

  // ─── Current user ───

  async sessionUser(userId: string, sessionId: string | null): Promise<SessionUserDto> {
    this.authContext.invalidateUser(userId);
    const { user: ctx } = await this.authContext.load(userId, null);
    if (!ctx) throw new DomainError('UNAUTHENTICATED');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        teacher: { select: { id: true, firstName: true, lastName: true, photoUrl: true, isActive: true } },
        guardianOf: { include: { client: { select: { id: true, firstName: true, lastName: true, photoUrl: true } } } },
      },
    });
    void sessionId;
    const permissions = [...ctx.permissions].sort();
    return {
      id: user.id,
      displayName: ctx.displayName,
      phone: user.phone,
      email: user.email,
      hasPassword: !!user.passwordHash,
      roles: ctx.roles,
      permissions,
      client: user.client,
      teacher:
        user.teacher && user.teacher.isActive
          ? {
              id: user.teacher.id,
              name: [user.teacher.firstName, user.teacher.lastName].filter(Boolean).join(' '),
              photoUrl: user.teacher.photoUrl,
            }
          : null,
      managedClients: user.guardianOf.map((g) => g.client),
      areas: {
        client: !!user.client || user.guardianOf.length > 0,
        admin: isStaffPermissionSet(ctx.permissions),
        teacher: ctx.permissions.has('teacher.portal') && !!ctx.teacherId,
      },
    };
  }

  private assertActive(user: Pick<User, 'status'>): void {
    if (user.status === 'BLOCKED') throw new DomainError('AUTH_ACCOUNT_BLOCKED');
    if (user.status === 'DELETED') throw new DomainError('AUTH_INVALID_CREDENTIALS');
  }
}

// Hash of a random password, used to keep login timing constant for unknown accounts.
const DUMMY_HASH =
  'scrypt$16384$8$1$c2FsdHNhbHRzYWx0c2FsdA==$T5h1ZC9zH0p8mH3N3u5M0m2n9s3m2V6o8s9d0f1g2h3j4k5l6z7x8c9v0b1n2m3q4w5e6r7t8y9u0i1o2p3a4s5d6f7g==';
