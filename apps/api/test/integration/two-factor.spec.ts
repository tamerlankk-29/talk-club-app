import { hashPassword } from '../../src/modules/auth/password';
import { totpCode, totpStep } from '../../src/modules/auth/totp';
import { at, Factory } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/**
 * Two-factor sign-in with an authenticator app: required for super admins and
 * admins, enforced on every way in (password, phone code, password reset).
 */
describe('Two-factor sign-in for staff', () => {
  let t: TestApp;
  let f: Factory;
  const PASSWORD = 'Strong-pass-2026';

  const staffWithPassword = async (roleKey: string, email: string, phone?: string) => {
    const role = await t.prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    return t.prisma.user.create({
      data: { email, phone, displayName: roleKey, passwordHash: await hashPassword(PASSWORD), roles: { create: { roleId: role.id } } },
    });
  };
  const login = (email: string) => t.http().post('/api/auth/login').send({ login: email, password: PASSWORD });
  const verify = (challengeToken: string, code: string) => t.http().post('/api/auth/totp/verify').send({ challengeToken, code });
  const codeNow = (secret: string) => totpCode(secret, totpStep(t.clock.now().getTime()));

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set(at('2026-10-05 10:00'));
    f = await new Factory(t).init();
  });
  afterAll(async () => t.close());

  it('makes an admin set up an authenticator app, then signs in and returns recovery codes once', async () => {
    await staffWithPassword('ADMIN', 'admin-2fa@test.local');
    const first = await login('admin-2fa@test.local').expect(401);
    expect(first.body.error.code).toBe('AUTH_TOTP_SETUP_REQUIRED');
    const { challengeToken, secret, otpauthUrl } = first.body.error.details;
    expect(otpauthUrl).toContain(`secret=${secret}`);

    // Signing in again keeps the same pending secret, so a QR scanned earlier still works.
    const again = await login('admin-2fa@test.local').expect(401);
    expect(again.body.error.details.secret).toBe(secret);

    const wrong = await verify(challengeToken, '000000').expect(400);
    expect(wrong.body.error.code).toBe('AUTH_TOTP_INVALID');

    const ok = await verify(challengeToken, codeNow(secret)).expect(200);
    expect(ok.body.accessToken).toBeTruthy();
    expect(ok.body.recoveryCodes).toHaveLength(8);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'admin-2fa@test.local' } });
    expect(user.totpEnabledAt).not.toBeNull();
    expect(user.totpSecret).not.toContain(secret);

    // Next sign-in asks for a code; the code already used can't be replayed.
    const next = await login('admin-2fa@test.local').expect(401);
    expect(next.body.error.code).toBe('AUTH_TOTP_REQUIRED');
    expect(next.body.error.details.secret).toBeUndefined();
    await verify(next.body.error.details.challengeToken, codeNow(secret)).expect(400);
    t.clock.set(at('2026-10-05 10:01'));
    const signedIn = await verify(next.body.error.details.challengeToken, codeNow(secret)).expect(200);
    expect(signedIn.body.recoveryCodes).toBeUndefined();

    // A recovery code works once.
    const [recovery] = ok.body.recoveryCodes as string[];
    const byRecovery = await login('admin-2fa@test.local').expect(401);
    await verify(byRecovery.body.error.details.challengeToken, recovery.toUpperCase()).expect(200);
    const reuse = await login('admin-2fa@test.local').expect(401);
    await verify(reuse.body.error.details.challengeToken, recovery).expect(400);
  });

  it('locks the second step after five wrong codes', async () => {
    await staffWithPassword('SUPER_ADMIN', 'owner-2fa@test.local');
    const { challengeToken, secret } = (await login('owner-2fa@test.local').expect(401)).body.error.details;
    await verify(challengeToken, codeNow(secret)).expect(200);

    const challenge = (await login('owner-2fa@test.local').expect(401)).body.error.details.challengeToken;
    for (let i = 0; i < 4; i++) await verify(challenge, '123456').expect(400);
    expect((await verify(challenge, '123456').expect(429)).body.error.code).toBe('AUTH_TOTP_LOCKED');
    t.clock.set(at('2026-10-05 10:05'));
    expect((await verify(challenge, codeNow(secret)).expect(429)).body.error.code).toBe('AUTH_TOTP_LOCKED');
    t.clock.set(at('2026-10-05 10:20'));
    await verify(challenge, codeNow(secret)).expect(200);
  });

  it('applies to sign-in by phone code too', async () => {
    await staffWithPassword('ADMIN', 'admin-phone@test.local', '+77015550301');
    const sent = await t.http().post('/api/auth/otp/request').send({ phone: '+77015550301' }).expect(200);
    const res = await t.http().post('/api/auth/otp/verify').send({ phone: '+77015550301', code: sent.body.devCode }).expect(401);
    expect(res.body.error.code).toBe('AUTH_TOTP_SETUP_REQUIRED');
  });

  it('lets roles without the requirement sign in directly', async () => {
    await staffWithPassword('MANAGER', 'manager-2fa@test.local');
    const res = await login('manager-2fa@test.local').expect(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('lets a super admin reset 2FA; admins without staff management cannot', async () => {
    const owner = await f.staff('SUPER_ADMIN');
    const admin = await f.staff('ADMIN');
    const target = await t.prisma.user.findUniqueOrThrow({ where: { email: 'admin-2fa@test.local' } });
    await t.http().post(`/api/admin/staff/${target.id}/reset-2fa`).set(owner.auth()).expect(200);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).totpEnabledAt).toBeNull();
    expect((await login('admin-2fa@test.local').expect(401)).body.error.code).toBe('AUTH_TOTP_SETUP_REQUIRED');

    const ownerUser = await t.prisma.user.findUniqueOrThrow({ where: { email: 'owner-2fa@test.local' } });
    await t.http().post(`/api/admin/staff/${ownerUser.id}/reset-2fa`).set(admin.auth()).expect(403);
  });
});
