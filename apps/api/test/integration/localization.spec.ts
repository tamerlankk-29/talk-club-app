import { TRANSLATED_ERROR_MESSAGES } from '../../src/common/i18n/error-messages';
import { ERROR_CATALOG } from '../../src/common/errors/error-codes';
import { Factory } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/** Server texts follow the member's language: errors by Accept-Language, messages by the account. */
describe('Localization', () => {
  let t: TestApp;
  let f: Factory;

  beforeAll(async () => {
    t = await createTestApp();
    f = await new Factory(t).init();
  });
  afterAll(() => t.close());

  it('has Russian and Kazakh for every catalog error', () => {
    const missing = Object.values(ERROR_CATALOG)
      .map((e) => e.message)
      .filter((m) => !TRANSLATED_ERROR_MESSAGES.includes(m));
    expect(missing).toEqual([]);
  });

  it('answers errors in the requested language', async () => {
    const body = { login: '+7 708 999 00 11', password: 'wrong-password-1' };
    const en = await t.http().post('/api/auth/login').send(body).expect(401);
    expect(en.body.error.message).toBe('Incorrect login or password.');
    const ru = await t.http().post('/api/auth/login').set('Accept-Language', 'ru').send(body).expect(401);
    expect(ru.body.error).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', message: 'Неверный логин или пароль.' });
    const kk = await t.http().post('/api/auth/login').set('Accept-Language', 'kk-KZ,ru;q=0.8').send(body).expect(401);
    expect(kk.body.error.message).toBe('Логин немесе құпиясөз қате.');
  });

  it('translates field errors and keeps the response shape', async () => {
    const res = await t.http().post('/api/auth/login').set('Accept-Language', 'ru').send({ login: 'x', password: 42 }).expect(400);
    expect(res.body.error.message).toBe('Проверьте выделенные поля и попробуйте ещё раз.');
    expect(res.body.error.details.fields.password).toMatch(/^[А-Яа-яЁё .]+$/);
    expect(res.body.error.details.constraints).toBeUndefined();
  });

  it('saves the language on the account', async () => {
    const c = await f.client();
    const res = await t.http().patch('/api/me/locale').set(c.auth()).send({ locale: 'kk' }).expect(200);
    expect(res.body.locale).toBe('kk');
    await t.http().patch('/api/me/locale').set(c.auth()).send({ locale: 'de' }).expect(400);
  });
});
