import { CaptchaService } from '../../src/modules/auth/captcha.service';
import { at } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/** Accepts only the token "human". */
const fakeCaptcha = {
  isEnabled: () => true,
  siteKey: () => 'test-site-key',
  verify: async (token: string) => token === 'human',
};

/**
 * Protection of the SMS budget against SMS-pumping bots: Kazakhstan numbers only,
 * a daily SMS cap, and a captcha after a few requests from one network.
 */
describe('SMS code guard', () => {
  let t: TestApp;
  const request = (body: Record<string, unknown>) => t.http().post('/api/auth/otp/request').send({ channel: 'sms', ...body });

  beforeAll(async () => {
    process.env.TURNSTILE_SITE_KEY = 'test-site-key';
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
    process.env.AUTH_SMS_DAILY_LIMIT = '6';
    t = await createTestApp((builder) => builder.overrideProvider(CaptchaService).useValue(fakeCaptcha));
    t.clock.set(at('2026-10-05 10:00'));
  });
  afterAll(async () => {
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.AUTH_SMS_DAILY_LIMIT;
    await t.close();
  });
  beforeEach(async () => {
    await t.prisma.otpCode.deleteMany();
  });

  it('publishes the captcha site key with the channels', async () => {
    const res = await t.http().get('/api/auth/otp/channels').expect(200);
    expect(res.body.captchaSiteKey).toBe('test-site-key');
  });

  it('sends SMS codes only to +7 numbers', async () => {
    const res = await request({ phone: '+49 151 2345 6789' }).expect(400);
    expect(res.body.error.code).toBe('AUTH_SMS_COUNTRY_NOT_SUPPORTED');
    expect(await t.prisma.otpCode.count()).toBe(0);
  });

  it('asks for a captcha after two requests from one network and accepts a valid one', async () => {
    await request({ phone: '+7 701 000 00 01' }).expect(200);
    await request({ phone: '+7 701 000 00 02' }).expect(200);

    const blocked = await request({ phone: '+7 701 000 00 03' }).expect(400);
    expect(blocked.body.error.code).toBe('AUTH_CAPTCHA_REQUIRED');
    expect(blocked.body.error.details.siteKey).toBe('test-site-key');

    const wrong = await request({ phone: '+7 701 000 00 03', captchaToken: 'bot' }).expect(400);
    expect(wrong.body.error.code).toBe('AUTH_CAPTCHA_INVALID');

    const ok = await request({ phone: '+7 701 000 00 03', captchaToken: 'human' }).expect(200);
    expect(ok.body.channel).toBe('sms');
    expect(await t.prisma.otpCode.count()).toBe(3);
  });

  it('pauses SMS codes once the daily limit is reached', async () => {
    // Six SMS codes already went out in the last 24 hours (from other networks).
    const now = t.clock.now();
    await t.prisma.otpCode.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        phone: `+7701000001${i}`,
        purpose: 'LOGIN' as const,
        channel: 'sms',
        codeHash: 'x',
        ip: `10.0.0.${i}`,
        expiresAt: now,
        createdAt: new Date(now.getTime() - (18 + i) * 3_600_000),
      })),
    });
    const res = await request({ phone: '+7 701 000 00 20' }).expect(429);
    expect(res.body.error.code).toBe('AUTH_SMS_DAILY_LIMIT');

    // Codes older than 24 hours no longer count.
    t.clock.set(at('2026-10-05 16:01'));
    await request({ phone: '+7 701 000 00 20' }).expect(200);
    t.clock.set(at('2026-10-05 10:00'));
  });
});
