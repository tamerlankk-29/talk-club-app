import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import { maskPhone } from '../../../common/utils/phone';
import type { ChannelProvider, ChannelSendResult, OutboundMessage } from '../channel.types';

interface MobizonResponse {
  code?: number;
  message?: string;
  data?: { messageId?: string | number; campaignId?: string | number } | null;
}

/**
 * SMS through Mobizon (mobizon.kz). The API key stays in this class and is never
 * logged; Mobizon expects the number as digits with the country code (7701…).
 * `code: 0` in the JSON answer means the message was accepted.
 */
export class MobizonSmsProvider implements ChannelProvider {
  readonly channel = 'SMS' as const;
  readonly name = 'mobizon';
  private readonly logger = new Logger('Messaging:SMS');

  constructor(
    private readonly sms: AppConfig['sms'],
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return !!this.sms.mobizonApiKey;
  }

  async send(message: OutboundMessage): Promise<ChannelSendResult> {
    const phone = message.to.phone;
    if (!phone) return { status: 'SKIPPED', provider: this.name, error: 'No phone number' };
    if (!this.sms.mobizonApiKey) return { status: 'SKIPPED', provider: this.name, error: 'MOBIZON_API_KEY is not set' };

    const text = message.title ? `${message.title}\n${message.body}` : message.body;
    const form = new URLSearchParams({ recipient: phone.replace(/\D/g, ''), text });
    if (this.sms.mobizonFrom) form.set('from', this.sms.mobizonFrom);
    const url = `${this.sms.mobizonApiUrl}/service/message/sendSmsMessage?output=json&api=v1&apiKey=${encodeURIComponent(this.sms.mobizonApiKey)}`;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      // Thrown errors make the delivery retry; the message never contains the key.
      throw new Error(`Mobizon request failed: ${(error as Error).name}`);
    }
    const payload = (await res.json().catch(() => null)) as MobizonResponse | null;
    if (!res.ok || payload?.code !== 0) {
      const reason = payload?.message || `HTTP ${res.status}`;
      this.logger.warn(`Mobizon refused SMS to ${maskPhone(phone)}: code ${payload?.code ?? '?'} ${reason}`);
      return { status: 'FAILED', provider: this.name, error: `Mobizon: ${reason}`.slice(0, 500) };
    }
    const id = payload.data?.messageId ?? payload.data?.campaignId;
    return { status: 'SENT', provider: this.name, providerMessageId: id != null ? String(id) : undefined };
  }
}
