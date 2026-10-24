import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';
import { APP_CONFIG, AppConfig } from '../../../config/app-config';
import { KaspiPaymentProvider } from './kaspi.provider';
import { ManualPaymentProvider } from './manual.provider';
import { MockOnlinePaymentProvider } from './mock-online.provider';
import type { PaymentProvider } from './payment-provider';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const list: PaymentProvider[] = [
      new ManualPaymentProvider(),
      new MockOnlinePaymentProvider(config.payments.mockOnlineEnabled),
      new KaspiPaymentProvider({
        merchantId: process.env.KASPI_MERCHANT_ID?.trim() || null,
        apiKey: process.env.KASPI_API_KEY?.trim() || null,
      }),
    ];
    for (const provider of list) this.providers.set(provider.code, provider);
  }

  get(code: string): PaymentProvider {
    const provider = this.providers.get(code);
    if (!provider || !provider.isConfigured()) throw new DomainError('PAYMENT_METHOD_UNAVAILABLE');
    return provider;
  }

  find(code: string): PaymentProvider | undefined {
    return this.providers.get(code);
  }

  isAvailable(code: string): boolean {
    return !!this.providers.get(code)?.isConfigured();
  }

  describe(): Array<{ code: string; manual: boolean; configured: boolean }> {
    return [...this.providers.values()].map((p) => ({ code: p.code, manual: p.manual, configured: p.isConfigured() }));
  }
}
