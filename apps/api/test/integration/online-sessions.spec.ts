import { RemindersService } from '../../src/modules/notifications/reminders.service';
import { at, Factory } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/** Online sessions: the join link appears 15 minutes before the start and is sent to booked clients once. */
describe('Online sessions', () => {
  let t: TestApp;
  let f: Factory;

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set(at('2026-10-05 10:00'));
    f = await new Factory(t).init();
  });
  afterAll(async () => t.close());
  beforeEach(() => t.clock.set(at('2026-10-05 10:00')));

  const onlineSession = async (startsAt: Date) => {
    const id = await f.session({ startsAt });
    await t.prisma.session.update({ where: { id }, data: { format: 'ONLINE', onlineUrl: 'https://meet.google.com/abc-defg-hij' } });
    return id;
  };

  it('shows the join link to a booked client only from 15 minutes before the start until the end', async () => {
    const c = await f.client();
    await f.membership(c.clientId, { visits: 5 });
    const s = await onlineSession(at('2026-10-05 18:30'));
    const { body } = await t.http().post(`/api/sessions/${s}/book`).set(c.auth()).send({}).expect(201);
    const view = () => t.http().get(`/api/bookings/${body.booking.id}`).set(c.auth()).expect(200);

    let res = await view();
    expect(res.body.onlineUrl).toBeNull();
    expect(new Date(res.body.onlineUrlOpensAt).toISOString()).toBe(at('2026-10-05 18:15').toISOString());
    const session = await t.http().get(`/api/sessions/${s}`).set(c.auth()).expect(200);
    expect(session.body.onlineUrl).toBeNull();

    t.clock.set(at('2026-10-05 18:15'));
    res = await view();
    expect(res.body.onlineUrl).toBe('https://meet.google.com/abc-defg-hij');

    t.clock.set(at('2026-10-05 20:01'));
    res = await view();
    expect(res.body.onlineUrl).toBeNull();
  });

  it('never shows the link to a client who did not book', async () => {
    const c = await f.client();
    const s = await onlineSession(at('2026-10-05 18:30'));
    t.clock.set(at('2026-10-05 18:20'));
    const res = await t.http().get(`/api/sessions/${s}`).set(c.auth()).expect(200);
    expect(res.body.onlineUrl).toBeNull();
    expect(res.body.onlineUrlOpensAt).toBeNull();
  });

  it('sends the join link once, 15 minutes before the start', async () => {
    const c = await f.client();
    await f.membership(c.clientId, { visits: 5 });
    const s = await onlineSession(at('2026-10-06 12:00'));
    await t.http().post(`/api/sessions/${s}/book`).set(c.auth()).send({}).expect(201);
    const reminders = t.get(RemindersService);
    const sentTo = () => t.prisma.notification.findMany({ where: { clientId: c.clientId, templateKey: 'session.online_link' } });

    t.clock.set(at('2026-10-06 11:40'));
    await reminders.sendOnlineLinks();
    expect(await sentTo()).toHaveLength(0);

    t.clock.set(at('2026-10-06 11:46'));
    await reminders.sendOnlineLinks();
    await reminders.sendOnlineLinks();
    const sent = await sentTo();
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain('https://meet.google.com/abc-defg-hij');
  });
});
