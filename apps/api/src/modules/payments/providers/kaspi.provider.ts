import type { Payment, PaymentMethod } from '@prisma/client';
import { DomainError } from '../../../common/errors/domain-error';
import type { PaymentInitiation, PaymentProvider, WebhookResult } from './payment-provider';

/**
 * Integration point for automated Kaspi payments (Kaspi Pay / invoice API).
 *
 * Until merchant credentials are available the club uses the manual Kaspi
 * invoice flow (PaymentMethod "KASPI" → provider "manual"). To automate it:
 *   1. set KASPI_MERCHANT_ID / KASPI_API_KEY / PAYMENT_WEBHOOK_SECRET,
 *   2. implement `initiate` (create invoice / payment link) and `parseWebhook`
 *      (verify the signature, map the status),
 *   3. switch the KASPI payment method's provider to "kaspi" in Admin → Settings → Payment methods.
 * No other part of the system needs to change.
 */
export class KaspiPaymentProvider implements PaymentProvider {
  readonly code = 'kaspi';
  readonly manual = false;

  constructor(private readonly credentials: { merchantId: string | null; apiKey: string | null }) {}

  isConfigured(): boolean {
    return !!(this.credentials.merchantId && this.credentials.apiKey);
  }

  async initiate(_payment: Payment, _method: PaymentMethod): Promise<PaymentInitiation> {
    throw new DomainError('PAYMENT_PROVIDER_ERROR', {
      message: 'Automatic Kaspi payments are not connected yet. Please choose the Kaspi invoice option.',
    });
  }

  async parseWebhook(): Promise<WebhookResult | null> {
    return null;
  }
}
