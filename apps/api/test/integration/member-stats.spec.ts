import { at, Factory } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/** Personal statistics on the member's progress page: weekly streaks and totals. */
describe('Member statistics', () => {
  let t: TestApp;
  let f: Factory;

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set(at('2026-10-21 10:00')); // Wednesday
    f = await new Factory(t).init();
  });
  afterAll(async () => t.close());

  const attended = async (clientId: string, startsAt: string, teacherId: string) => {
    const sessionId = await f.session({ startsAt: at(startsAt), teacherId });
    const membershipId = await f.membership(clientId, { visits: 10 });
    await t.prisma.booking.create({ data: { sessionId, clientId, membershipId, status: 'ATTENDED' } });
  };

  it('counts the current and best weekly streak and flags a streak that needs a visit this week', async () => {
    const c = await f.client();
    const { teacherId: kevin } = await f.teacher();
    const { teacherId: michael } = await f.teacher();
    // Three weeks in a row in August (best streak), then a gap, then the last two weeks.
    await attended(c.clientId, '2026-08-03 18:30', kevin);
    await attended(c.clientId, '2026-08-12 18:30', kevin);
    await attended(c.clientId, '2026-08-19 18:30', michael);
    await attended(c.clientId, '2026-10-07 18:30', kevin);
    await attended(c.clientId, '2026-10-14 18:30', kevin);

    const { body } = await t.http().get('/api/my/stats').set(c.auth()).expect(200);
    expect(body.sessionsAttended).toBe(5);
    expect(body.currentStreakWeeks).toBe(2);
    expect(body.bestStreakWeeks).toBe(3);
    expect(body.streakAtRisk).toBe(true);
    expect(body.teachersMet).toBe(2);

    await attended(c.clientId, '2026-10-20 18:30', michael);
    const after = await t.http().get('/api/my/stats').set(c.auth()).expect(200);
    expect(after.body.currentStreakWeeks).toBe(3);
    expect(after.body.streakAtRisk).toBe(false);
  });

  it('starts from zero for a new member', async () => {
    const c = await f.client();
    const { body } = await t.http().get('/api/my/stats').set(c.auth()).expect(200);
    expect(body).toMatchObject({ sessionsAttended: 0, currentStreakWeeks: 0, bestStreakWeeks: 0, streakAtRisk: false, teachersMet: 0 });
  });
});
