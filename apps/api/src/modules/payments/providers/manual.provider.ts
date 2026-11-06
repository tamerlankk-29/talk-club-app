import type { Payment, PaymentMethod } from '@prisma/client';
import type { PaymentInitiation, PaymentProvider } from './payment-provider';

/**
 * Cash, card terminal at the desk, bank transfer and the current Kaspi invoice
 * workflow: the payment stays PENDING until an administrator confirms it
 * (optionally entering the Kaspi invoice / reference number).
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly code = 'manual';
  readonly manual = true;

  isConfigured(): boolean {
    return true;
  }

  async initiate(_payment: Payment, method: PaymentMethod): Promise<PaymentInitiation> {
    return { instructions: method.instructions ?? 'Your payment will be confirmed by the Talk Club administrator.' };
  }
}
