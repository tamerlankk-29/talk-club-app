import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { TelegramBotClient } from '../../src/modules/telegram/telegram-bot.client';
import { at, Factory, TestClient } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/** Records what the bot would send instead of calling the Telegram API. */
class FakeTelegramBot {
  sent: Array<{ chatId: string; text: string }> = [];
  /** Chat whose next message fails, as if the member had blocked the bot. */
  failNextFor: string | null = null;
  isConfigured() {
    return true;
  }
  botUrl(start?: string) {
    return `https://t.me/Talk_club_bot${start ? `?start=${start}` : ''}`;
  }
  async sendMessage(chatId: string, text: string) {
    if (this.failNextFor === chatId) {
      this.failNextFor = null;
      throw new Error('Telegram sendMessage failed: Forbidden: bot was blocked by the user');
    }
    this.sent.push({ chatId, text });
  }
  async setWebhook() {}
}

/**
 * Notifications through the Talk Club bot: members whose phone is linked to the
 * bot get their messages in Telegram, and SMS becomes a fallback only.
 */
describe('Telegram notifications', () => {
  let t: TestApp;
  let f: Factory;
  let notifications: NotificationsService;
  const bot = new FakeTelegramBot();

  const link = async (client: TestClient, chatId: string) => {
    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: client.userId } });
    await t.prisma.telegramLink.create({ data: { phone: user.phone!, chatId, telegramUserId: chatId } });
  };
  const deliveries = (notificationId: string) =>
    t.prisma.notificationDelivery.findMany({ where: { notificationId }, orderBy: { channel: 'asc' } });

  beforeAll(async () => {
    process.env.NOTIFY_TELEGRAM_PROVIDER = 'telegram_bot';
    t = await createTestApp((builder) => builder.overrideProvider(TelegramBotClient).useValue(bot));
    f = await new Factory(t).init();
    notifications = t.get(NotificationsService);
    t.clock.set(at('2026-10-05 10:00'));
  });
  afterAll(async () => {
    delete process.env.NOTIFY_TELEGRAM_PROVIDER;
    await t.close();
  });
  beforeEach(() => {
    bot.sent = [];
  });

  it('sends a linked member’s notification to their Telegram chat with a link to the app', async () => {
    const client = await f.client({ firstName: 'Aru' });
    await link(client, '5001');
    const [id] = await notifications.notifyClient(client.clientId, {
      templateKey: 'booking.confirmed',
      vars: { teacherName: 'Emma', dayWord: 'tomorrow', time: '19:00', visitsNote: '', bookingId: 'b-1' },
    });
    await notifications.dispatchPending();

    expect((await deliveries(id)).map((d) => [d.channel, d.status, d.provider])).toEqual([['TELEGRAM', 'SENT', 'telegram_bot']]);
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0].chatId).toBe('5001');
    expect(bot.sent[0].text).toContain("You're booked!");
    expect(bot.sent[0].text).toContain("Emma's session tomorrow at 19:00");
    expect(bot.sent[0].text).toMatch(/https?:\/\/[^\s]+\/bookings\/b-1$/);
  });

  it('skips Telegram for members who have not linked the bot', async () => {
    const client = await f.client();
    const [id] = await notifications.notifyClient(client.clientId, {
      templateKey: 'booking.confirmed',
      vars: { teacherName: 'Emma', dayWord: 'today', time: '18:00', visitsNote: '', bookingId: 'b-2' },
    });
    expect(await deliveries(id)).toEqual([]);
    expect(bot.sent).toEqual([]);
  });

  it('uses Telegram instead of a paid SMS when the template allows both', async () => {
    const linked = await f.client();
    await link(linked, '5002');
    const plain = await f.client();
    const vars = { teacherName: 'Emma', dateTime: 'Mon 19:00' };
    const [linkedId] = await notifications.notifyClient(linked.clientId, { templateKey: 'session.cancelled', vars });
    const [plainId] = await notifications.notifyClient(plain.clientId, { templateKey: 'session.cancelled', vars });

    expect((await deliveries(linkedId)).map((d) => d.channel)).toEqual(['TELEGRAM']);
    expect((await deliveries(plainId)).map((d) => d.channel)).toEqual(['SMS']);
  });

  it('respects the member’s Telegram switch', async () => {
    const client = await f.client();
    await link(client, '5003');
    await t.http().patch('/api/notifications/preferences').set(client.auth()).send({ channels: { telegram: false } }).expect(200);
    const [id] = await notifications.notifyClient(client.clientId, {
      templateKey: 'booking.confirmed',
      vars: { teacherName: 'Emma', dayWord: 'today', time: '18:00', visitsNote: '', bookingId: 'b-3' },
    });
    expect(await deliveries(id)).toEqual([]);
  });

  it('shows in preferences whether Telegram is connected, with the bot link', async () => {
    const client = await f.client();
    const before = await t.http().get('/api/notifications/preferences').set(client.auth()).expect(200);
    expect(before.body).toMatchObject({
      channels: { telegram: true },
      telegramLinked: false,
      telegramBotUrl: 'https://t.me/Talk_club_bot?start=notify',
    });
    await link(client, '5004');
    const after = await t.http().get('/api/notifications/preferences').set(client.auth()).expect(200);
    expect(after.body.telegramLinked).toBe(true);
  });

  it('retries a failed Telegram delivery and records the error', async () => {
    const client = await f.client();
    await link(client, '5005');
    const [id] = await notifications.notifyClient(client.clientId, {
      templateKey: 'booking.confirmed',
      vars: { teacherName: 'Emma', dayWord: 'today', time: '18:00', visitsNote: '', bookingId: 'b-5' },
    });
    bot.failNextFor = '5005';
    await notifications.dispatchPending();
    let [delivery] = await deliveries(id);
    expect(delivery).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(delivery.error).toMatch(/blocked by the user/);

    await notifications.dispatchPending();
    [delivery] = await deliveries(id);
    expect(delivery).toMatchObject({ status: 'SENT', attempts: 2 });
    expect(bot.sent.filter((m) => m.chatId === '5005')).toHaveLength(1);
  });
});
