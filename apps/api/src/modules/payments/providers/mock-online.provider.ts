import type { Payment, PaymentMethod } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PaymentInitiation, PaymentProvider, WebhookResult } from './payment-provider';

/**
 * Development-only online checkout. Redirects to a fake checkout page in the web
 * app whose "Pay" button calls POST /payments/mock/:id/complete — exactly like a
 * real provider calling our webhook. Disabled in staging/production.
 */
export class MockOnlinePaymentProvider implements PaymentProvider {
  readonly code = 'mock_online';
  readonly manual = false;

  constructor(private readonly enabled: boolean) {}

  isConfigured(): boolean {
    return this.enabled;
  }

  async initiate(payment: Payment, _method: PaymentMethod, ctx: { appUrl: string }): Promise<PaymentInitiation> {
    return {
      providerPaymentId: `mock_${randomUUID()}`,
      checkoutUrl: `${ctx.appUrl}/payments/${payment.id}/checkout`,
      instructions: 'Test checkout — no real money is charged.',
    };
  }

  async parseWebhook(body: unknown): Promise<WebhookResult | null> {
    const payload = body as { providerPaymentId?: string; result?: string };
    if (!payload?.providerPaymentId) return null;
    return {
      providerPaymentId: payload.providerPaymentId,
      status: payload.result === 'success' ? 'PAID' : 'FAILED',
      failureReason: payload.result === 'success' ? undefined : 'Declined in test checkout',
    };
  }

  async refund(): Promise<{ providerRefundId?: string }> {
    return { providerRefundId: `mock_refund_${randomUUID()}` };
  }
}
