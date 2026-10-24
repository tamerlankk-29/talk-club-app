import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

/** Verifies Cloudflare Turnstile tokens. Tests replace it with a fake. */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  isEnabled(): boolean {
    return !!this.config.captcha.turnstileSecret;
  }

  siteKey(): string | null {
    return this.config.captcha.turnstileSiteKey;
  }

  async verify(token: string, ip: string | null): Promise<boolean> {
    const secret = this.config.captcha.turnstileSecret;
    if (!secret) return true;
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await res.json()) as { success?: boolean };
      return payload.success === true;
    } catch (error) {
      // Fail closed: a bot must not get through because the check could not run.
      this.logger.warn(`Turnstile verification failed: ${(error as Error).message}`);
      return false;
    }
  }
}
