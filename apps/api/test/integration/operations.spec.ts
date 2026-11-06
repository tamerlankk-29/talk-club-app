import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { ROLE_KEYS } from '../../src/modules/rbac/permissions';
import { WaitlistService } from '../../src/modules/waitlist/waitlist.service';
import { at, Factory, TestClient } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/**
 * Payments, permissions, waitlist, attendance windows and privacy — through the
 * HTTP API with real database constraints.
 */
describe('Club operations', () => {
  let t: TestApp;
  let f: Factory;

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set(at('2026-10-05 10:00'));
    f = await new Factory(t).init();
  });
  afterAll(async () => t.close());
  beforeEach(() => t.clock.set(at('2026-10-05 10:00')));

  const book = (c: TestClient, sessionId: string) => t.http().post(`/api/sessions/${sessionId}/book`).set(c.auth()).send({});

  describe('payments', () => {
    it('online purchase: pending → paid via the provider callback → membership active for 35 days', async () => {
      const c = await f.client();
      const created = await t
        .http()
        .post('/api/payments')
        .set(c.auth())
        .send({ planId: f.baseline.plans.STANDARD, methodCode: 'ONLINE', acceptOffer: true })
        .expect(201);
      expect(created.body.status).toBe('PENDING');
      expect(created.body.checkoutUrl).toContain(`/payments/${created.body.id}/checkout`);
      expect(await t.prisma.membership.count({ where: { clientId: c.clientId } })).toBe(0);

      const paid = await t.http().post(`/api/payments/mock/${created.body.id}/complete`).set(c.auth()).send({ result: 'success' }).expect(200);
      expect(paid.body.status).toBe('PAID');
      const m = await t.prisma.membership.findFirstOrThrow({ where: { clientId: c.clientId } });
      expect(m.visitsRemaining).toBe(8);
      // Bought on 5 October (club time) → valid through the end of 9 November.
      expect(m.expiresAt.toISOString()).toBe(at('2026-11-09 23:59').toISOString().replace(':00.000Z', ':59.999Z'));
      expect(await f.visitsRemaining(m.id)).toBe(8);
      const acceptance = await t.prisma.agreementAcceptance.findFirst({ where: { clientId: c.clientId, documentType: 'PUBLIC_OFFER' } });
      expect(acceptance).not.toBeNull();
    });

    it('a declined online payment creates no membership', async () => {
      const c = await f.client();
      const created = await t.http().post('/api/payments').set(c.auth()).send({ planId: f.baseline.plans.LITE, methodCode: 'ONLINE', acceptOffer: true }).expect(201);
      const failed = await t.http().post(`/api/payments/mock/${created.body.id}/complete`).set(c.auth()).send({ result: 'fail' }).expect(200);
      expect(failed.body.status).toBe('FAILED');
      expect(await t.prisma.membership.count({ where: { clientId: c.clientId } })).toBe(0);
    });

    it('Kaspi invoice workflow: request → confirm with reference → partial refund within limits', async () => {
      const c = await f.client();
      const request = await t
        .http()
        .post('/api/admin/payments')
        .set(f.admin.auth())
        .send({ clientId: c.clientId, productType: 'MEMBERSHIP', planId: f.baseline.plans.INTENSIVE, methodCode: 'KASPI' })
        .expect(201);
      expect(request.body.status).toBe('PENDING');
      expect(request.body.amount).toBe(36_000);

      const confirmed = await t.http().post(`/api/admin/payments/${request.body.id}/confirm`).set(f.admin.auth()).send({ reference: 'KSP-445566' }).expect(200);
      expect(confirmed.body.status).toBe('PAID');
      expect(confirmed.body.reference).toBe('KSP-445566');
      const membership = await t.prisma.membership.findFirstOrThrow({ where: { clientId: c.clientId } });
      expect(membership.visitsRemaining).toBe(12);

      const again = await t.http().post(`/api/admin/payments/${request.body.id}/confirm`).set(f.admin.auth()).send({});
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('PAYMENT_INVALID_STATE');

      const refund = await t.http().post(`/api/admin/payments/${request.body.id}/refund`).set(f.admin.auth()).send({ amount: 10_000, reason: 'Moved to a smaller plan' }).expect(200);
      expect(refund.body.status).toBe('PARTIALLY_REFUNDED');
      expect(refund.body.refundedAmount).toBe(10_000);

      const tooMuch = await t.http().post(`/api/admin/payments/${request.body.id}/refund`).set(f.admin.auth()).send({ amount: 30_000, reason: 'Too much' });
      expect(tooMuch.body.error.code).toBe('PAYMENT_REFUND_EXCEEDS');
    });

    it('clients can cancel their own pending request, not a paid one', async () => {
      const c = await f.client();
      const created = await t.http().post('/api/payments').set(c.auth()).send({ planId: f.baseline.plans.LITE, methodCode: 'KASPI', acceptOffer: true }).expect(201);
      const cancelled = await t.http().post(`/api/my/payments/${created.body.id}/cancel`).set(c.auth()).expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      const other = await f.client();
      const notMine = await t.http().post(`/api/my/payments/${created.body.id}/cancel`).set(other.auth());
      expect(notMine.status).toBe(404);
    });
  });

  describe('permissions', () => {
    it('keeps every role inside its area', async () => {
      const teacher = await f.teacher('Perm', true);
      const manager = await f.staff(ROLE_KEYS.MANAGER, 'Front desk');
      const marketing = await f.staff(ROLE_KEYS.MARKETING, 'Marketing');
      const client = await f.client();

      expect((await t.http().get('/api/admin/clients').set(teacher.staff!.auth())).status).toBe(403);
      expect((await t.http().get('/api/admin/dashboard').set(client.auth())).status).toBe(403);
      expect((await t.http().get('/api/my/home')).status).toBe(401);
      expect((await t.http().get('/api/admin/clients').set(manager.auth())).status).toBe(200);
      expect((await t.http().get('/api/admin/reports/revenue').set(manager.auth())).status).toBe(403); // no finance access
      expect((await t.http().post('/api/admin/payments').set(marketing.auth()).send({ clientId: client.clientId, productType: 'OTHER', amount: 1000, methodCode: 'CASH' })).status).toBe(403);

      // Managers take payments but can't refund them.
      const payment = await t
        .http()
        .post('/api/admin/payments')
        .set(manager.auth())
        .send({ clientId: client.clientId, productType: 'OTHER', amount: 5000, methodCode: 'CASH', description: 'Workbook', markPaid: true })
        .expect(201);
      const refund = await t.http().post(`/api/admin/payments/${payment.body.id}/refund`).set(manager.auth()).send({ reason: 'Customer changed mind' });
      expect(refund.status).toBe(403);
      expect(refund.body.error.code).toBe('FORBIDDEN');
    });

    it("a parent can't act for a profile they don't manage", async () => {
      const parent = await f.client();
      const stranger = await f.client();
      const res = await t.http().get('/api/my/home').set(parent.auth()).set('X-Acting-Client', stranger.clientId);
      expect(res.status).toBe(403);
    });
  });

  describe('waitlist', () => {
    it('offers a freed seat to the first person, holds it, and passes it on when the offer expires', async () => {
      const s = await f.session({ startsAt: at('2026-10-08 18:30'), capacity: 2 });
      const people = await Promise.all([f.client(), f.client(), f.client(), f.client(), f.client()]);
      for (const p of people) await f.membership(p.clientId, { visits: 4 });
      const [a, b, first, second, latecomer] = people;
      const ba = await book(a, s).expect(201);
      const bb = await book(b, s).expect(201);
      expect((await book(first, s)).body.error.code).toBe('BOOKING_SESSION_FULL');

      expect((await t.http().post(`/api/sessions/${s}/waitlist`).set(first.auth()).expect(201)).body.position).toBe(1);
      expect((await t.http().post(`/api/sessions/${s}/waitlist`).set(second.auth()).expect(201)).body.position).toBe(2);

      // A seat frees up → the first person gets an offer and the seat is held for them.
      await t.http().post(`/api/bookings/${ba.body.booking.id}/cancel`).set(a.auth()).send({}).expect(200);
      const offered = await t.prisma.waitlistEntry.findFirstOrThrow({ where: { sessionId: s, clientId: first.clientId } });
      expect(offered.status).toBe('OFFERED');
      expect((await book(latecomer, s)).body.error.code).toBe('BOOKING_OFFER_RESERVED');

      const claimed = await t.http().post(`/api/waitlist/${offered.id}/claim`).set(first.auth()).expect(200);
      expect(claimed.body.booking.status).toBe('BOOKED');

      // Another seat frees up → second in line is offered it, but lets it expire.
      await t.http().post(`/api/bookings/${bb.body.booking.id}/cancel`).set(b.auth()).send({}).expect(200);
      expect((await t.prisma.waitlistEntry.findFirstOrThrow({ where: { sessionId: s, clientId: second.clientId } })).status).toBe('OFFERED');
      t.clock.advance(61 * 60_000);
      await t.get(WaitlistService).expireOffers();
      expect((await t.prisma.waitlistEntry.findFirstOrThrow({ where: { sessionId: s, clientId: second.clientId } })).status).toBe('EXPIRED');
      // Nobody else waiting → the seat is free for anyone.
      expect((await book(latecomer, s)).status).toBe(201);
    });
  });

  describe('attendance', () => {
    it('teachers mark only their own sessions, inside the time window; unmarked bookings become no-shows', async () => {
      const kate = await f.teacher('Kate', true);
      const other = await f.teacher('Otto', true);
      const s = await f.session({ startsAt: at('2026-10-05 18:30'), teacherId: kate.teacherId });
      const c1 = await f.client();
      const c2 = await f.client();
      await f.membership(c1.clientId, { visits: 4 });
      const m2 = await f.membership(c2.clientId, { visits: 4 });
      const b1 = await book(c1, s).expect(201);
      const b2 = await book(c2, s).expect(201);
      const mark = (staffAuth: { Authorization: string }, bookingId: string) => t.http().post(`/api/teacher/bookings/${bookingId}/attendance`).set(staffAuth).send({ status: 'PRESENT' });

      t.clock.set(at('2026-10-05 12:00')); // too early
      expect((await mark(kate.staff!.auth(), b1.body.booking.id)).body.error.code).toBe('ATTENDANCE_WINDOW_CLOSED');

      t.clock.set(at('2026-10-05 18:40'));
      expect((await mark(other.staff!.auth(), b1.body.booking.id)).body.error.code).toBe('ATTENDANCE_NOT_YOUR_SESSION');
      expect((await mark(kate.staff!.auth(), b1.body.booking.id)).status).toBe(200);
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: b1.body.booking.id } })).status).toBe('ATTENDED');

      // Nobody marks c2 — after the finalisation delay they become a no-show and the visit stays used.
      t.clock.set(at('2026-10-05 23:30'));
      await t.get(AttendanceService).finalizeDue();
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: b2.body.booking.id } })).status).toBe('NO_SHOW');
      expect(await f.visitsRemaining(m2)).toBe(3);

      t.clock.set(at('2026-10-07 12:00')); // window closed for teachers
      expect((await mark(kate.staff!.auth(), b2.body.booking.id)).body.error.code).toBe('ATTENDANCE_WINDOW_CLOSED');
    });
  });

  describe('privacy', () => {
    it('exports a client’s data and anonymises the profile on a deletion request', async () => {
      const c = await f.client({ firstName: 'Saule' });
      await f.membership(c.clientId, { visits: 4 });
      const exported = await t.http().get('/api/my/data-export').set(c.auth()).expect(200);
      expect(JSON.stringify(exported.body)).toContain('Saule');

      await t.http().post('/api/my/deletion-request').set(c.auth()).send({ reason: 'Moving abroad' }).expect(200);
      const requests = await t.http().get('/api/admin/data-requests?status=PENDING').set(f.admin.auth()).expect(200);
      const mine = requests.body.find((r: { clientId: string }) => r.clientId === c.clientId);
      expect(mine.type).toBe('DELETION');
      expect(mine.clientName).toContain('Saule');

      await t.http().post(`/api/admin/clients/${c.clientId}/anonymize`).set(f.admin.auth()).send({ reason: 'Client request' }).expect(200);
      const client = await t.prisma.client.findUniqueOrThrow({ where: { id: c.clientId } });
      expect(client.status).toBe('ANONYMIZED');
      expect(client.phone).toBeNull();
      expect(client.firstName).not.toBe('Saule');
      const request = await t.prisma.dataRequest.findUniqueOrThrow({ where: { id: mine.id } });
      expect(request.status).toBe('COMPLETED');
      // The account can no longer be used.
      expect((await t.http().get('/api/my/home').set(c.auth())).status).toBeGreaterThanOrEqual(401);
      // Financial history is kept (memberships stay, without personal data).
      expect(await t.prisma.membership.count({ where: { clientId: c.clientId } })).toBe(1);
    });
  });
});
