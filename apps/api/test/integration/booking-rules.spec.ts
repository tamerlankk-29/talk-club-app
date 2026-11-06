import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { MembershipsService } from '../../src/modules/memberships/memberships.service';
import { WaitlistService } from '../../src/modules/waitlist/waitlist.service';
import { at, Factory, TestClient } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/**
 * The critical scenarios from the specification (§86–87), exercised through the
 * real HTTP API, services, row locks and database constraints.
 */
describe('Booking & membership rules', () => {
  let t: TestApp;
  let f: Factory;

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set(at('2026-10-05 10:00'));
    f = await new Factory(t).init();
  });
  afterAll(async () => t.close());
  beforeEach(() => t.clock.set(at('2026-10-05 10:00'))); // Monday morning, club time

  const book = (c: TestClient, sessionId: string, body: object = {}) =>
    t.http().post(`/api/sessions/${sessionId}/book`).set(c.auth()).send(body);
  const cancel = (c: TestClient, bookingId: string, body: object = {}) =>
    t.http().post(`/api/bookings/${bookingId}/cancel`).set(c.auth()).send(body);

  it('CASE 1 — a client with 5 visits books a session and has 4 left', async () => {
    const c = await f.client();
    const m = await f.membership(c.clientId, { visits: 5 });
    const s = await f.session({ startsAt: at('2026-10-07 18:30') });

    const res = await book(c, s).expect(201);
    expect(res.body.visitsRemaining).toBe(4);
    expect(res.body.booking.status).toBe('BOOKED');
    expect(res.body.freeCancellationAvailable).toBe(true);
    expect(await f.visitsRemaining(m)).toBe(4);

    const ledger = await t.prisma.membershipTransaction.findMany({ where: { membershipId: m }, orderBy: { createdAt: 'asc' } });
    expect(ledger.map((l) => [l.type, l.delta, l.balanceAfter])).toEqual([
      ['GRANT', 5, 5],
      ['BOOKING', -1, 4],
    ]);
  });

  it('CASE 2 — cancelling before 20:00 on the previous day returns the visit', async () => {
    const c = await f.client();
    const m = await f.membership(c.clientId, { visits: 5 });
    const s = await f.session({ startsAt: at('2026-10-07 18:30') });
    const { body } = await book(c, s).expect(201);

    t.clock.set(at('2026-10-06 19:59'));
    const preview = await t.http().get(`/api/bookings/${body.booking.id}/cancellation-preview`).set(c.auth()).expect(200);
    expect(preview.body).toMatchObject({ canCancel: true, isLate: false, visitWillBeReturned: true, title: 'Cancel this session?' });
    expect(new Date(preview.body.deadline).toISOString()).toBe(at('2026-10-06 20:00').toISOString());

    const res = await cancel(c, body.booking.id).expect(200);
    expect(res.body).toMatchObject({ visitReturned: true, isLate: false, visitsRemaining: 5 });
    expect(res.body.booking.status).toBe('CANCELLED');
    expect(await f.visitsRemaining(m)).toBe(5);
  });

  it('CASE 3 — cancelling after the deadline needs confirmation and the visit is not returned', async () => {
    const c = await f.client();
    const m = await f.membership(c.clientId, { visits: 5 });
    const s = await f.session({ startsAt: at('2026-10-07 18:30') });
    const { body } = await book(c, s).expect(201);

    t.clock.set(at('2026-10-06 20:01'));
    const preview = await t.http().get(`/api/bookings/${body.booking.id}/cancellation-preview`).set(c.auth()).expect(200);
    expect(preview.body).toMatchObject({ isLate: true, visitWillBeReturned: false, title: 'Late cancellation' });

    const refused = await cancel(c, body.booking.id).expect(409);
    expect(refused.body.error.code).toBe('BOOKING_LATE_CANCELLATION_CONFIRMATION_REQUIRED');

    const res = await cancel(c, body.booking.id, { acknowledgeLate: true }).expect(200);
    expect(res.body).toMatchObject({ visitReturned: false, isLate: true, visitsRemaining: 4 });
    expect(res.body.booking.status).toBe('LATE_CANCELLED');
    expect(await f.visitsRemaining(m)).toBe(4);
  });

  it('CASE 4 — a client who does not attend becomes a no-show and the visit stays used', async () => {
    const c = await f.client();
    const m = await f.membership(c.clientId, { visits: 5 });
    const s = await f.session({ startsAt: at('2026-10-07 18:30') });
    const { body } = await book(c, s).expect(201);

    t.clock.set(at('2026-10-07 23:01')); // session ended 20:00 + 3h auto-finalisation delay
    const finalized = await t.get(AttendanceService).finalizeDue();
    expect(finalized).toBeGreaterThanOrEqual(1);

    const booking = await t.prisma.booking.findUniqueOrThrow({ where: { id: body.booking.id }, include: { attendance: true } });
    expect(booking.status).toBe('NO_SHOW');
    expect(booking.attendance).toMatchObject({ status: 'ABSENT', method: 'AUTO' });
    expect(await f.visitsRemaining(m)).toBe(4);
  });

  it('CASE 5 — an expired membership cannot be used for new bookings', async () => {
    const c = await f.client();
    // Bought 40 days ago with 35-day validity → expired on 4 October (end of day).
    await f.membership(c.clientId, { visits: 8, startsAt: at('2026-08-26 12:00') });
    const s = await f.session({ startsAt: at('2026-10-07 18:30') });

    const before = await book(c, s).expect(409);
    expect(before.body.error.code).toBe('BOOKING_MEMBERSHIP_EXPIRES_BEFORE_SESSION');

    await t.get(MembershipsService).expireDue();
    const after = await book(c, s).expect(409);
    expect(after.body.error.code).toBe('BOOKING_NO_ACTIVE_MEMBERSHIP');
  });

  it('a valid membership cannot book a session after its expiry date', async () => {
    const c = await f.client();
    await f.membership(c.clientId, { visits: 8, startsAt: at('2026-09-01 12:00') }); // valid through 6 October
    const s = await f.session({ startsAt: at('2026-10-07 18:30') });
    const res = await book(c, s).expect(409);
    expect(res.body.error.code).toBe('BOOKING_MEMBERSHIP_EXPIRES_BEFORE_SESSION');
  });

  it('CASE 6 — a session with 7 participants is full', async () => {
    const s = await f.session({ startsAt: at('2026-10-08 18:30'), capacity: 7 });
    for (let i = 0; i < 7; i += 1) {
      const c = await f.client({ firstName: `Full${i}` });
      await f.membership(c.clientId);
      await book(c, s).expect(201);
    }
    const eighth = await f.client({ firstName: 'Eighth' });
    await f.membership(eighth.clientId);
    const res = await book(eighth, s).expect(409);
    expect(res.body.error.code).toBe('BOOKING_SESSION_FULL');

    const view = await t.http().get(`/api/sessions/${s}`).set(eighth.auth()).expect(200);
    expect(view.body).toMatchObject({ status: 'FULL', booked: 7, available: 0 });
    expect(view.body.bookability).toMatchObject({ canBook: false, reason: 'BOOKING_SESSION_FULL', canJoinWaitlist: true });
  });

  it('CASE 7 — when someone cancels from a full session the waitlist gets the seat', async () => {
    const s = await f.session({ startsAt: at('2026-10-09 18:30'), capacity: 2 });
    const [a, b, w1, w2, outsider] = await Promise.all(
      ['A', 'B', 'Waiter1', 'Waiter2', 'Outsider'].map((n) => f.client({ firstName: n })),
    );
    for (const c of [a, b, w1, w2, outsider]) await f.membership(c.clientId);
    const bookingA = (await book(a, s).expect(201)).body.booking.id;
    const bookingB = (await book(b, s).expect(201)).body.booking.id;

    const j1 = await t.http().post(`/api/sessions/${s}/waitlist`).set(w1.auth()).expect(201);
    expect(j1.body).toMatchObject({ status: 'WAITING', position: 1 });
    t.clock.advance(1000);
    const j2 = await t.http().post(`/api/sessions/${s}/waitlist`).set(w2.auth()).expect(201);
    expect(j2.body.position).toBe(2);

    // A cancels → the seat is reserved for Waiter1 and they are notified.
    await cancel(a, bookingA).expect(200);
    const entry1 = await t.prisma.waitlistEntry.findUniqueOrThrow({ where: { id: j1.body.id } });
    expect(entry1.status).toBe('OFFERED');
    expect(await t.prisma.notification.count({ where: { clientId: w1.clientId, templateKey: 'waitlist.offer' } })).toBe(1);

    // The reserved seat cannot be taken by someone else.
    const taken = await book(outsider, s).expect(409);
    expect(taken.body.error.code).toBe('BOOKING_OFFER_RESERVED');

    // Waiter1 claims the place.
    const claim = await t.http().post(`/api/waitlist/${j1.body.id}/claim`).set(w1.auth()).expect(200);
    expect(claim.body.booking.status).toBe('BOOKED');
    expect((await t.prisma.waitlistEntry.findUniqueOrThrow({ where: { id: j1.body.id } })).status).toBe('BOOKED');

    // B cancels → Waiter2 is offered, but lets the offer expire → the seat opens up.
    await cancel(b, bookingB).expect(200);
    const entry2 = await t.prisma.waitlistEntry.findUniqueOrThrow({ where: { id: j2.body.id } });
    expect(entry2.status).toBe('OFFERED');
    t.clock.set(new Date(entry2.offerExpiresAt!.getTime() + 1000));
    await t.get(WaitlistService).expireOffers();
    expect((await t.prisma.waitlistEntry.findUniqueOrThrow({ where: { id: j2.body.id } })).status).toBe('EXPIRED');
    await book(outsider, s).expect(201);
  });

  it('memberships last 35 days and visits can be used at any pace', async () => {
    const c = await f.client();
    const payment = await t
      .http()
      .post('/api/admin/payments')
      .set(f.admin.auth())
      .send({ clientId: c.clientId, productType: 'MEMBERSHIP', planId: f.baseline.plans.STANDARD, methodCode: 'KASPI', reference: 'KSP-001' })
      .expect(201);
    expect(payment.body.status).toBe('PENDING');
    const confirmed = await t.http().post(`/api/admin/payments/${payment.body.id}/confirm`).set(f.admin.auth()).send({}).expect(200);
    expect(confirmed.body.status).toBe('PAID');

    const overview = await t.http().get('/api/my/membership').set(c.auth()).expect(200);
    expect(overview.body.current).toMatchObject({ planName: 'STANDARD', visitsTotal: 8, visitsRemaining: 8, status: 'ACTIVE', expiresOn: '2026-11-09' });

    // Week 1: 1 session, week 2: 3, week 3: none, week 4: 2.
    const slots = ['2026-10-07 18:30', '2026-10-12 13:00', '2026-10-14 13:00', '2026-10-16 13:00', '2026-10-27 18:30', '2026-10-29 18:30'];
    for (const slot of slots) {
      t.clock.set(new Date(at(slot).getTime() - 5 * 86_400_000));
      const s = await f.session({ startsAt: at(slot) });
      await book(c, s).expect(201);
    }
    const after = await t.http().get('/api/my/membership').set(c.auth()).expect(200);
    expect(after.body.current).toMatchObject({ visitsRemaining: 2, visitsUsed: 6, status: 'ACTIVE' });
  });

  it('prevents double booking and overlapping bookings', async () => {
    const c = await f.client();
    await f.membership(c.clientId);
    const s1 = await f.session({ startsAt: at('2026-10-10 13:00'), roomCode: '314' });
    const s2 = await f.session({ startsAt: at('2026-10-10 14:00'), roomCode: '315' }); // overlaps 13:00–14:30
    await book(c, s1).expect(201);
    expect((await book(c, s1).expect(409)).body.error.code).toBe('BOOKING_ALREADY_BOOKED');
    expect((await book(c, s2).expect(409)).body.error.code).toBe('BOOKING_OVERLAP');
  });

  it('never exceeds capacity under concurrent bookings', async () => {
    const s = await f.session({ startsAt: at('2026-10-10 18:30'), capacity: 7 });
    const clients = await Promise.all(Array.from({ length: 12 }, (_, i) => f.client({ firstName: `Rush${i}` })));
    for (const c of clients) await f.membership(c.clientId);
    const results = await Promise.all(clients.map((c) => book(c, s)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(7);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'BOOKING_SESSION_FULL')).toBe(true);
    expect(await t.prisma.booking.count({ where: { sessionId: s, activeSlot: true } })).toBe(7);
  });

  it('never lets a visit balance go below zero under concurrent bookings', async () => {
    const c = await f.client();
    const m = await f.membership(c.clientId, { visits: 1 });
    const s1 = await f.session({ startsAt: at('2026-10-11 13:00'), roomCode: '314' });
    const s2 = await f.session({ startsAt: at('2026-10-11 16:00'), roomCode: '315' });
    const results = await Promise.all([book(c, s1), book(c, s2)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('BOOKING_NO_VISITS_LEFT');
    expect(await f.visitsRemaining(m)).toBe(0);
  });

  it('enforces the level range with the configured tolerance', async () => {
    const s = await f.session({ startsAt: at('2026-10-12 18:30'), levelMin: 'Upper-Intermediate', levelMax: 'Advanced' });
    const elementary = await f.client({ level: 'Elementary' });
    const intermediate = await f.client({ level: 'Intermediate' });
    await f.membership(elementary.clientId);
    await f.membership(intermediate.clientId);
    expect((await book(elementary, s).expect(409)).body.error.code).toBe('BOOKING_LEVEL_MISMATCH');
    await book(intermediate, s).expect(201); // one level below the range is within tolerance
  });

  it('cancelling a session returns every visit and notifies the clients', async () => {
    const s = await f.session({ startsAt: at('2026-10-13 18:30') });
    const clients = await Promise.all([f.client(), f.client()]);
    const memberships: string[] = [];
    for (const c of clients) {
      memberships.push(await f.membership(c.clientId, { visits: 3 }));
      await book(c, s).expect(201);
    }
    t.clock.set(at('2026-10-13 12:00')); // after the free-cancellation deadline — no penalty anyway
    const res = await t.http().post(`/api/admin/sessions/${s}/cancel`).set(f.admin.auth()).send({ reason: 'Teacher is ill' }).expect(200);
    expect(res.body).toMatchObject({ cancelledBookings: 2, visitsReturned: 2 });
    for (const m of memberships) expect(await f.visitsRemaining(m)).toBe(3);
    for (const c of clients) {
      expect(await t.prisma.notification.count({ where: { clientId: c.clientId, templateKey: 'session.cancelled' } })).toBe(1);
    }
    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'session.cancel', entityId: s } });
    expect(audit?.reason).toBe('Teacher is ill');
  });
});
