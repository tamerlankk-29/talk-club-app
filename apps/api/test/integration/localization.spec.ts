import { TRANSLATED_ERROR_MESSAGES } from '../../src/common/i18n/error-messages';
import { ERROR_CATALOG } from '../../src/common/errors/error-codes';
import { templatePlaceholders } from '../../src/common/utils/template';
import { DEFAULT_TEMPLATES } from '../../src/modules/notifications/default-templates';
import { NotificationVarsService } from '../../src/modules/notifications/notification-vars.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { TEMPLATE_TRANSLATIONS } from '../../src/modules/notifications/template-translations';
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

  it('has Russian and Kazakh for every built-in template, with the same placeholders', () => {
    const sorted = (texts: Array<string | null | undefined>) => [...new Set(texts.flatMap((x) => (x ? templatePlaceholders(x) : [])))].sort();
    for (const tpl of DEFAULT_TEMPLATES) {
      const tr = TEMPLATE_TRANSLATIONS[tpl.key];
      expect([tpl.key, !!tr]).toEqual([tpl.key, true]);
      const english = sorted([tpl.title, tpl.body, tpl.buttonLabel, tpl.secondaryButtonLabel]);
      for (const locale of ['ru', 'kk'] as const) {
        const text = tr[locale];
        expect([tpl.key, locale, sorted([text.title, text.body, text.buttonLabel, text.secondaryButtonLabel])]).toEqual([tpl.key, locale, english]);
        expect([tpl.key, locale, !!text.buttonLabel, !!text.secondaryButtonLabel]).toEqual([tpl.key, locale, !!tpl.buttonLabel, !!tpl.secondaryButtonLabel]);
      }
    }
  });

  it('sends notifications in each recipient’s language, with dates in that language', async () => {
    const notifications = t.get(NotificationsService);
    const vars = t.get(NotificationVarsService);
    const ru = await f.client();
    const kk = await f.client();
    const en = await f.client();
    await t.prisma.user.update({ where: { id: ru.userId }, data: { locale: 'ru' } });
    await t.prisma.user.update({ where: { id: kk.userId }, data: { locale: 'kk' } });
    const v = { planName: 'STANDARD', visitsRemaining: 3, daysText: vars.daysText(3), expiryDate: { en: '9 October 2026', ru: '9 октября 2026', kk: '9 қазан 2026' } };
    const title = async (clientId: string) => {
      const [id] = await notifications.notifyClient(clientId, { templateKey: 'membership.expiring', vars: v });
      return t.prisma.notification.findUniqueOrThrow({ where: { id } });
    };
    expect((await title(ru.clientId)).title).toBe('Абонемент заканчивается через 3 дня');
    expect((await title(kk.clientId)).body).toContain('3 күннен кейін (9 қазан 2026)');
    expect((await title(en.clientId)).title).toBe('Your membership expires in 3 days');
  });

  it('sends the sign-in SMS in the language of the screen', async () => {
    await t.http().post('/api/auth/otp/request').set('Accept-Language', 'ru').send({ phone: '+7 707 444 55 66' }).expect(200);
    expect(t.outbox.last({ channel: 'SMS', address: '+77074445566' })?.body).toMatch(/^Код Talk Club: \d{6}\. Действует 5 минут\./);
  });

  it('labels levels in the requested language', async () => {
    const { teacherId } = await f.teacher('Lena');
    const ru = await t.http().get(`/api/public/teachers/${teacherId}`).set('Accept-Language', 'ru').expect(200);
    expect(ru.body.levelsLabel).toBe('Все уровни');
    const en = await t.http().get(`/api/public/teachers/${teacherId}`).expect(200);
    expect(en.body.levelsLabel).toBe('All levels');
  });

  it('keeps an admin-edited template as written', async () => {
    const notifications = t.get(NotificationsService);
    const c = await f.client();
    await t.prisma.user.update({ where: { id: c.userId }, data: { locale: 'ru' } });
    const builtIn = DEFAULT_TEMPLATES.find((x) => x.key === 'membership.expired')!;
    await t.prisma.notificationTemplate.upsert({
      where: { key: builtIn.key },
      update: { title: 'Time to renew!' },
      create: { ...builtIn, title: 'Time to renew!' },
    });
    notifications.invalidateTemplates();
    const [id] = await notifications.notifyClient(c.clientId, { templateKey: 'membership.expired' });
    expect((await t.prisma.notification.findUniqueOrThrow({ where: { id } })).title).toBe('Time to renew!');
  });
});
