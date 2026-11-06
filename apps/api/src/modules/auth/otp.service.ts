import { Inject, Injectable } from '@nestjs/common';
import type { OtpPurpose } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { ClockService } from '../../common/clock/clock.service';
import { DomainError } from '../../common/errors/domain-error';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelRegistry } from '../messaging/channel-registry';
import { TelegramService } from '../telegram/telegram.service';

const CODE_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export type OtpChannel = 'sms' | 'telegram';

/** One-time verification codes (login, password reset) sent by SMS or Telegram. Only HMACs are stored. */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly channels: ChannelRegistry,
    private readonly telegram: TelegramService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Which delivery channels can carry codes right now. */
  availableChannels(): { sms: boolean; telegram: boolean; telegramBotUrl: string | null } {
    const telegram = this.telegram.isAvailable();
    return {
      // The console SMS provider only logs codes: fine in development, useless for real members.
      sms: !this.config.isProduction || this.config.notify.sms !== 'console',
      telegram,
      telegramBotUrl: telegram ? this.telegram.botUrl() : null,
    };
  }

  async request(
    phone: string,
    purpose: OtpPurpose,
    ip: string | null,
    requestedChannel?: OtpChannel,
  ): Promise<{ channel: OtpChannel; expiresInSeconds: number; resendInSeconds: number; devCode?: string }> {
    const available = this.availableChannels();
    const channel: OtpChannel = requestedChannel ?? (available.sms || !available.telegram ? 'sms' : 'telegram');
    let telegramChatId: string | null = null;
    if (channel === 'sms' && !available.sms) throw new DomainError('AUTH_SMS_UNAVAILABLE');
    if (channel === 'telegram') {
      if (!available.telegram) throw new DomainError('AUTH_TELEGRAM_UNAVAILABLE');
      telegramChatId = await this.telegram.chatIdForPhone(phone);
      if (!telegramChatId) throw new DomainError('AUTH_TELEGRAM_NOT_LINKED', { details: { botUrl: available.telegramBotUrl } });
    }

    const now = this.clock.now();
    const last = await this.prisma.otpCode.findFirst({
      where: { phone, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (last && now.getTime() - last.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      const retryAfter = RESEND_COOLDOWN_SECONDS - Math.floor((now.getTime() - last.createdAt.getTime()) / 1000);
      throw new DomainError('AUTH_OTP_COOLDOWN', { details: { retryAfterSeconds: retryAfter } });
    }
    const recent = await this.prisma.otpCode.count({
      where: { phone, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
    });
    if (recent >= MAX_CODES_PER_HOUR) throw new DomainError('RATE_LIMITED');

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.otpCode.create({
      data: {
        phone,
        purpose,
        codeHash: this.hash(phone, code),
        expiresAt: new Date(now.getTime() + CODE_TTL_SECONDS * 1000),
        // Stamped from ClockService (not the DB default) so cooldown and hourly limits compare like with like.
        createdAt: now,
        ip,
      },
    });

    if (telegramChatId) {
      await this.telegram.sendCode(telegramChatId, code);
    } else {
      await this.channels.get('SMS')?.send({
        to: { phone },
        title: '',
        body: `Talk Club code: ${code}. It is valid for 5 minutes. Do not share it with anyone.`,
      });
    }

    return {
      channel,
      expiresInSeconds: CODE_TTL_SECONDS,
      resendInSeconds: RESEND_COOLDOWN_SECONDS,
      ...(this.config.auth.otpDevEcho ? { devCode: code } : {}),
    };
  }

  /** Verifies and consumes the latest code. Throws a DomainError when invalid. */
  async verify(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    const now = this.clock.now();
    const record = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt <= now) throw new DomainError('AUTH_OTP_EXPIRED');
    if (record.attempts >= MAX_ATTEMPTS) throw new DomainError('AUTH_OTP_TOO_MANY_ATTEMPTS');

    const expected = Buffer.from(record.codeHash, 'hex');
    const actual = Buffer.from(this.hash(phone, code.trim()), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const updated = await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= MAX_ATTEMPTS) throw new DomainError('AUTH_OTP_TOO_MANY_ATTEMPTS');
      throw new DomainError('AUTH_OTP_INVALID', { details: { attemptsLeft: MAX_ATTEMPTS - updated.attempts } });
    }

    // Consume atomically so the same code cannot be used twice concurrently.
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw new DomainError('AUTH_OTP_EXPIRED');
  }

  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.config.auth.secret).update(`${phone}:${code}`).digest('hex');
  }
}
