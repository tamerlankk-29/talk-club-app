import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

interface AccessPayload {
  sub: string;
  sid: string;
  typ: 'access';
}

interface RegistrationPayload {
  phone: string;
  typ: 'registration';
}

interface MfaPayload {
  sub: string;
  typ: 'mfa';
}

interface CheckinPayload {
  cid: string;
  typ: 'checkin';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get accessTtlSeconds(): number {
    return this.config.auth.accessTtlMinutes * 60;
  }

  signAccess(userId: string, sessionId: string): string {
    const payload: AccessPayload = { sub: userId, sid: sessionId, typ: 'access' };
    return this.jwt.sign(payload, { expiresIn: this.accessTtlSeconds });
  }

  verifyAccess(token: string): AccessPayload {
    const payload = this.jwt.verify<AccessPayload>(token);
    if (payload.typ !== 'access') throw new Error('Wrong token type');
    return payload;
  }

  /** Short-lived proof that the caller verified this phone number via SMS code. */
  signRegistration(phone: string): string {
    const payload: RegistrationPayload = { phone, typ: 'registration' };
    return this.jwt.sign(payload, { expiresIn: 30 * 60 });
  }

  verifyRegistration(token: string): string | null {
    try {
      const payload = this.jwt.verify<RegistrationPayload>(token);
      return payload.typ === 'registration' ? payload.phone : null;
    } catch {
      return null;
    }
  }

  /** Proof that the password (or phone code) step passed; exchanged for a session with a 2FA code. */
  signMfaChallenge(userId: string): string {
    const payload: MfaPayload = { sub: userId, typ: 'mfa' };
    return this.jwt.sign(payload, { expiresIn: 10 * 60 });
  }

  verifyMfaChallenge(token: string): string | null {
    try {
      const payload = this.jwt.verify<MfaPayload>(token);
      return payload.typ === 'mfa' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  /** Rotating QR check-in token shown in the client app ("My QR code"). */
  signCheckin(clientId: string, ttlSeconds = 5 * 60): string {
    const payload: CheckinPayload = { cid: clientId, typ: 'checkin' };
    return this.jwt.sign(payload, { expiresIn: ttlSeconds });
  }

  verifyCheckin(token: string): string | null {
    try {
      const payload = this.jwt.verify<CheckinPayload>(token);
      return payload.typ === 'checkin' ? payload.cid : null;
    } catch {
      return null;
    }
  }

  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashToken(token) };
  }

  /**
   * The refresh token that replaces `token` on rotation. Derived (HMAC with the
   * server secret) rather than random, so retrying with the just-replaced token
   * yields the same successor — an aborted response or two tabs refreshing at
   * once can't leave the browser holding a token the server no longer accepts.
   */
  nextRefreshToken(token: string): { token: string; hash: string } {
    const next = createHmac('sha256', this.config.auth.secret).update(`refresh-rotation:${token}`).digest('base64url');
    return { token: next, hash: this.hashToken(next) };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
