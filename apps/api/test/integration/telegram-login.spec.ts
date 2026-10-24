import { TelegramBotClient, TelegramReplyMarkup } from '../../src/modules/telegram/telegram-bot.client';
import { at } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

const SECRET = 'telegram-webhook-secret-for-tests-0001';

/** Records what the bot would send instead of calling the Telegram API. */
class FakeTelegramBot {
  sent: Array<{ chatId: string; text: string; markup?: TelegramReplyMarkup }> = [];
  isConfigured() {
    return true;
  }
  botUrl(start?: string) {
    return `https://t.me/Talk_club_bot${start ? `?start=${start}` : ''}`;
  }
  async sendMessage(chatId: string, text: string, markup?: TelegramReplyMarkup) {
    this.sent.push({ chatId, text, markup });
  }
  async setWebhook() {}
  last(chatId: string) {
    return [...this.sent].reverse().find((m) => m.chatId === chatId);
  }
}

/**
 * Sign-in codes through the Telegram bot: a member shares their own contact with
 * the bot once, then the app can send codes to that chat instead of SMS.
 */
describe('Telegram sign-in codes', () => {
  let t: TestApp;
  const bot = new FakeTelegramBot();

  const update = (chatId: number, message: Record<string, unknown>, from: Record<string, unknown> = {}) => ({
    update_id: Math.floor(Math.random() * 1e9),
    message: { message_id: 1, date: 0, chat: { id: chatId, type: 'private' }, from: { id: chatId, is_bot: false, language_code: 'ru', ...from }, ...message },
  });
  const webhook = (body: object, secret = SECRET) =>
    t.http().post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', secret).send(body);

  beforeAll(async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    t = await createTestApp((builder) => builder.overrideProvider(TelegramBotClient).useValue(bot));
    t.clock.set(at('2026-10-05 10:00'));
  });
  afterAll(async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    await t.close();
  });

  it('lists Telegram as a sign-in channel with the bot link', async () => {
    const res = await t.http().get('/api/auth/otp/channels').expect(200);
    expect(res.body).toEqual({ sms: true, telegram: true, telegramBotUrl: 'https://t.me/Talk_club_bot?start=login', captchaSiteKey: null });
  });

  it('rejects webhook calls without the secret', async () => {
    await webhook(update(100, { text: '/start' }), 'wrong-secret').expect(403);
    await t.http().post('/api/telegram/webhook').send(update(100, { text: '/start' })).expect(403);
    expect(bot.last('100')).toBeUndefined();
  });

  it('asks for the phone number on /start, in the user’s language', async () => {
    await webhook(update(101, { text: '/start login' })).expect(200);
    const reply = bot.last('101')!;
    expect(reply.text).toContain('Talk Club');
    expect(reply.markup?.keyboard?.[0][0]).toMatchObject({ request_contact: true, text: 'Поделиться номером' });
  });

  it('explains how to link when the number is not linked yet', async () => {
    const res = await t.http().post('/api/auth/otp/request').send({ phone: '+7 701 555 77 01', channel: 'telegram' }).expect(409);
    expect(res.body.error.code).toBe('AUTH_TELEGRAM_NOT_LINKED');
    expect(res.body.error.details.botUrl).toBe('https://t.me/Talk_club_bot?start=login');
  });

  it('refuses someone else’s contact', async () => {
    await webhook(update(102, { contact: { phone_number: '77015557702', user_id: 999 } })).expect(200);
    expect(await t.prisma.telegramLink.count({ where: { phone: '+77015557702' } })).toBe(0);
    expect(bot.last('102')!.text).toMatch(/своим номером/);
  });

  it('links a shared contact, sends the code to Telegram and signs up with it', async () => {
    await webhook(update(103, { contact: { phone_number: '77015557703', user_id: 103 } }, { username: 'aliya' })).expect(200);
    expect(await t.prisma.telegramLink.findUnique({ where: { phone: '+77015557703' } })).toMatchObject({ chatId: '103', username: 'aliya' });
    expect(bot.last('103')!.markup).toEqual({ remove_keyboard: true });

    const sent = await t.http().post('/api/auth/otp/request').send({ phone: '8 701 555 77 03', channel: 'telegram' }).expect(200);
    expect(sent.body.channel).toBe('telegram');
    const message = bot.last('103')!;
    expect(message.text).toContain(sent.body.devCode);
    expect(message.text).toMatch(/^Код Talk Club/);
    expect(t.outbox.list({ channel: 'SMS', address: '+77015557703' })).toHaveLength(0);

    const verified = await t.http().post('/api/auth/otp/verify').send({ phone: '+77015557703', code: sent.body.devCode }).expect(200);
    expect(verified.body.status).toBe('REGISTRATION_REQUIRED');
  });

  it('moves the link when the same chat shares a different number', async () => {
    await webhook(update(103, { contact: { phone_number: '+77015557704', user_id: 103 } })).expect(200);
    expect(await t.prisma.telegramLink.count({ where: { chatId: '103' } })).toBe(1);
    expect(await t.prisma.telegramLink.findUnique({ where: { phone: '+77015557703' } })).toBeNull();
  });
});
