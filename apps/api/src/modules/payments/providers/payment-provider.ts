import type { Payment, PaymentMethod } from '@prisma/client';

export interface PaymentInitiation {
  /** Where to send the client to pay (online providers) */
  checkoutUrl?: string | null;
  providerPaymentId?: string | null;
  /** Human instructions (manual methods, e.g. "Pay the Kaspi invoice sent to your phone") */
  instructions?: string | null;
}

export interface WebhookResult {
  providerPaymentId: string;
  status: 'PAID' | 'FAILED';
  amount?: number;
  failureReason?: string;
}

/**
 * Adapter contract for payment providers (Kaspi, bank acquiring, …).
 * Nothing outside the payments module knows which provider processed a payment,
 * so adding a Kazakhstan provider means implementing this interface and
 * registering it in PaymentProviderRegistry — no changes to memberships or UI logic.
 */
export interface PaymentProvider {
  readonly code: string;
  /** Manual providers need an administrator to confirm the payment. */
  readonly manual: boolean;
  isConfigured(): boolean;
  initiate(payment: Payment, method: PaymentMethod, ctx: { appUrl: string }): Promise<PaymentInitiation>;
  /** Verifies and parses a provider callback. Returns null when the payload is not for us. */
  parseWebhook?(body: unknown, headers: Record<string, string | undefined>): Promise<WebhookResult | null>;
  refund?(payment: Payment, amount: number): Promise<{ providerRefundId?: string }>;
}
