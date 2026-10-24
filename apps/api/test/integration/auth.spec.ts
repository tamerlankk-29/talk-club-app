import type { Response } from 'supertest';
import { AuthService } from '../../src/modules/auth/auth.service';
import { at, Factory } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

function cookie(res: Response, name: string): string | null {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const entry = header?.find((c) => c.startsWith(`${name}=`));
  return entry ? entry.split(';')[0].slice(name.length + 1) : null;
}

/**
 * Phone-first sign-up / sign-in and refresh-token rotation, through the HTTP API
 * exactly as the apps use it.
 */
describe('Authentication', () => {
  let t: TestApp;
  let f: Factory;

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set(at('2026-10-05 10:00'));
    f = await new Factory(t).init();
  });
  afterAll(async () => t.close());

  const signUp = async (phone: string, extra: object = {}) => {
    const sent = await t.http().post('/api/auth/otp/request').send({ phone }).expect(200);
    const verified = await t.http().post('/api/auth/otp/verify').send({ phone, code: sent.body.devCode }).expect(200);
    expect(verified.body.status).toBe('REGISTRATION_REQUIRED');
    return t
      .http()
      .post('/api/auth/register')
      .send({ registrationToken: verified.body.registrationToken, firstName: 'Aliya', marketingConsent: false, acceptTerms: true, ...extra });
  };

  it('registers a new member by SMS code, records consent and signs in', async () => {
    const res = await signUp('8 (777) 123 45 67', { lastName: 'Sadykova', marketingConsent: true });
    expect(res.status).toBe(201);
    expect(res.body.user.client.firstName).toBe('Aliya');
    expect(res.body.user.phone).toBe('+77771234567');
    expect(cookie(res, 'tc_rt')).toBeTruthy();
    expect(cookie(res, 'tc_session')).toBe('1');
    expect(res.body.refreshToken).toBeUndefined(); // web clients only get the httpOnly cookie

    const client = await t.prisma.client.findFirstOrThrow({ where: { phone: '+77771234567' } });
    expect(client.marketingConsent).toBe(true);
    expect(await t.prisma.agreementAcceptance.count({ where: { clientId: client.id } })).toBeGreaterThanOrEqual(2); // Terms + Privacy

    // The same number signs straight in next time.
    const sent = await t.http().post('/api/auth/otp/request').send({ phone: '+7 777 123 45 67' }).expect(200);
    const again = await t.http().post('/api/auth/otp/verify').send({ phone: '+77771234567', code: sent.body.devCode }).expect(200);
    expect(again.body.status).toBe('AUTHENTICATED');
    expect(again.body.auth.user.client.id).toBe(client.id);
  });

  it('refuses registration without accepting the terms and names the field', async () => {
    const res = await signUp('+7 705 000 11 22', { acceptTerms: false });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields.acceptTerms).toBeTruthy();
  });

  it('rejects a wrong SMS code', async () => {
    await t.http().post('/api/auth/otp/request').send({ phone: '+7 702 999 00 00' }).expect(200);
    const res = await t.http().post('/api/auth/otp/verify').send({ phone: '+7 702 999 00 00', code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AUTH_OTP_INVALID');
  });

  it('signs in with a password and rejects a wrong one', async () => {
    expect((await signUp('+7 708 100 20 30', { firstName: 'Daniyar', password: 'correct-horse-9' })).status).toBe(201);
    const wrong = await t.http().post('/api/auth/login').send({ login: '+7 708 100 20 30', password: 'nope-nope-nope' }).expect(401);
    expect(wrong.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    const ok = await t.http().post('/api/auth/login').send({ login: '87081002030', password: 'correct-horse-9' }).expect(200);
    expect(ok.body.user.client.firstName).toBe('Daniyar');
  });

  describe('refresh token rotation', () => {
    let refreshToken: string;

    // Native clients send the refresh token in the body, which keeps these tests free of cookie plumbing.
    const refresh = (token: string) => t.http().post('/api/auth/refresh').set('X-Client-Platform', 'native').send({ refreshToken: token });

    beforeAll(async () => {
      const c = await f.client();
      refreshToken = (await t.get(AuthService).issueSession(c.userId)).refreshToken;
    });

    it('rotates the token on every refresh', async () => {
      const first = await refresh(refreshToken).expect(200);
      expect(first.body.refreshToken).toBeTruthy();
      expect(first.body.refreshToken).not.toBe(refreshToken);
      const second = await refresh(first.body.refreshToken).expect(200);
      expect(second.body.refreshToken).not.toBe(first.body.refreshToken);
      refreshToken = second.body.refreshToken;
    });

    it('accepts the just-replaced token briefly and returns the same successor', async () => {
      const rotated = await refresh(refreshToken).expect(200);
      // e.g. the response never reached the browser, which retries with the old token
      const retry = await refresh(refreshToken).expect(200);
      expect(retry.body.refreshToken).toBe(rotated.body.refreshToken);
      refreshToken = rotated.body.refreshToken;
    });

    it('gives parallel refreshes of one token the same new token', async () => {
      const results = await Promise.all([refresh(refreshToken), refresh(refreshToken), refresh(refreshToken)]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(new Set(results.map((r) => r.body.refreshToken)).size).toBe(1);
      refreshToken = results[0].body.refreshToken;
    });

    it('rejects a replaced token after the grace period', async () => {
      const rotated = await refresh(refreshToken).expect(200);
      t.clock.advance(2 * 60_000);
      const late = await refresh(refreshToken).expect(401);
      expect(late.body.error.code).toBe('AUTH_REFRESH_INVALID');
      await refresh(rotated.body.refreshToken).expect(200); // the current token keeps working
    });

    it('stops accepting the refresh token after logout', async () => {
      const c = await f.client();
      const session = await t.get(AuthService).issueSession(c.userId);
      await t.http().post('/api/auth/logout').set('X-Client-Platform', 'native').send({ refreshToken: session.refreshToken }).expect(200);
      await refresh(session.refreshToken).expect(401);
    });
  });
});
