import { normalizeGiftCode } from '../../src/modules/gift-certificates/gift-certificates.service';
import { at, Factory } from '../helpers/factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/** Gift certificates: sold and paid at the desk, redeemed once by the recipient with the code. */
describe('Gift certificates', () => {
  let t: TestApp;
  let f: Factory;

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set(at('2026-10-05 10:00'));
    f = await new Factory(t).init();
  });
  afterAll(async () => t.close());
  beforeEach(() => t.clock.set(at('2026-10-05 10:00')));

  const sell = async (body: object = {}) => {
    const buyer = await f.client({ firstName: 'Buyer' });
    const res = await t
      .http()
      .post('/api/admin/gift-certificates')
      .set(f.admin.auth())
      .send({ planId: f.baseline.plans.STANDARD, buyerClientId: buyer.clientId, methodCode: 'CASH', recipientName: 'Aruzhan', message: 'Happy birthday!', ...body })
      .expect(201);
    return { buyer, cert: res.body };
  };

  it('selling records a paid desk payment for the buyer and issues a readable code', async () => {
    const { buyer, cert } = await sell();
    expect(cert.code).toMatch(/^TC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(cert.status).toBe('ACTIVE');
    expect(cert.buyer.id).toBe(buyer.clientId);
    const payment = await t.prisma.payment.findUniqueOrThrow({ where: { id: cert.paymentId }, include: { method: true } });
    expect(payment).toMatchObject({ status: 'PAID', productType: 'GIFT_CERTIFICATE', clientId: buyer.clientId, amount: cert.price });
    expect(payment.method.code).toBe('CASH');
    // The buyer does not get a membership from the sale.
    expect(await t.prisma.membership.count({ where: { clientId: buyer.clientId } })).toBe(0);
  });

  it('the recipient redeems the code in the app once and gets the membership from today', async () => {
    const { cert } = await sell();
    const recipient = await f.client({ firstName: 'Aruzhan' });
    const typed = cert.code.toLowerCase().replace(/-/g, ' ');
    const res = await t.http().post('/api/my/gift-certificates/redeem').set(recipient.auth()).send({ code: typed }).expect(201);
    expect(res.body.visits).toBe(cert.visits);
    const membership = await t.prisma.membership.findUniqueOrThrow({ where: { id: res.body.membershipId } });
    expect(membership).toMatchObject({ clientId: recipient.clientId, visitsRemaining: cert.visits, price: 0 });

    const again = await t.http().post('/api/my/gift-certificates/redeem').set(recipient.auth()).send({ code: cert.code });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('GIFT_CERTIFICATE_USED');
    const view = await t.http().get(`/api/admin/gift-certificates/${cert.id}`).set(f.admin.auth()).expect(200);
    expect(view.body).toMatchObject({ status: 'REDEEMED', redeemedBy: { id: recipient.clientId }, membershipId: membership.id });
  });

  it('rejects unknown, expired and cancelled certificates', async () => {
    const c = await f.client();
    const redeem = (code: string) => t.http().post('/api/my/gift-certificates/redeem').set(c.auth()).send({ code });

    expect((await redeem('TC-AAAA-AAAA')).body.error.code).toBe('GIFT_CERTIFICATE_INVALID');
    expect((await redeem('hello')).body.error.code).toBe('GIFT_CERTIFICATE_INVALID');

    const { cert: old } = await sell({ redeemWithinDays: 30 });
    t.clock.set(at('2026-11-06 10:00'));
    expect((await redeem(old.code)).body.error.code).toBe('GIFT_CERTIFICATE_EXPIRED');
    const listed = await t.http().get('/api/admin/gift-certificates?status=EXPIRED').set(f.admin.auth()).expect(200);
    expect(listed.body.items.map((i: { id: string }) => i.id)).toContain(old.id);

    const { cert } = await sell();
    await t.http().post(`/api/admin/gift-certificates/${cert.id}/cancel`).set(f.admin.auth()).send({ reason: 'Refunded' }).expect(201);
    expect((await redeem(cert.code)).body.error.code).toBe('GIFT_CERTIFICATE_CANCELLED');
  });

  it('staff can redeem a certificate for a client at the desk', async () => {
    const { cert } = await sell();
    const c = await f.client();
    const res = await t.http().post(`/api/admin/gift-certificates/${cert.id}/redeem`).set(f.admin.auth()).send({ clientId: c.clientId }).expect(201);
    expect(await t.prisma.membership.count({ where: { id: res.body.membershipId, clientId: c.clientId } })).toBe(1);
  });

  it('clients cannot sell certificates', async () => {
    const c = await f.client();
    await t.http().post('/api/admin/gift-certificates').set(c.auth()).send({ planId: f.baseline.plans.STANDARD, buyerClientId: c.clientId, methodCode: 'CASH' }).expect(403);
  });

  it('normalizes the codes members type', () => {
    expect(normalizeGiftCode(' tc-abcd-ef23 ')).toBe('TC-ABCD-EF23');
    expect(normalizeGiftCode('ABCDEF23')).toBe('TC-ABCD-EF23');
    expect(normalizeGiftCode('TC-ABCD-EF20')).toBeNull(); // 0 is never used
  });
});
