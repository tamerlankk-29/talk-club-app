import { MobizonSmsProvider } from '../../src/modules/messaging/providers/mobizon.provider';

const config = { mobizonApiKey: 'kz-secret-key', mobizonFrom: 'TalkClub', mobizonApiUrl: 'https://api.mobizon.kz' };

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('Mobizon SMS provider', () => {
  it('sends the number as digits with the sender name and returns the message id', async () => {
    const http = fakeFetch(200, { code: 0, data: { campaignId: '91', messageId: '7001', status: 1 }, message: '' });
    const result = await new MobizonSmsProvider(config, http.fn).send({ to: { phone: '+77015550101' }, title: '', body: 'Talk Club code: 123456' });

    expect(result).toEqual({ status: 'SENT', provider: 'mobizon', providerMessageId: '7001' });
    expect(http.calls).toHaveLength(1);
    const { url, init } = http.calls[0];
    expect(url).toBe('https://api.mobizon.kz/service/message/sendSmsMessage?output=json&api=v1&apiKey=kz-secret-key');
    const form = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(form)).toEqual({ recipient: '77015550101', text: 'Talk Club code: 123456', from: 'TalkClub' });
  });

  it('reports a refused message as failed without leaking the key', async () => {
    const http = fakeFetch(200, { code: 1, data: { recipient: 'invalid' }, message: 'Validation error' });
    const result = await new MobizonSmsProvider(config, http.fn).send({ to: { phone: '+77015550102' }, title: 'Hi', body: 'Body' });
    expect(result).toMatchObject({ status: 'FAILED', provider: 'mobizon', error: 'Mobizon: Validation error' });
    expect(JSON.stringify(result)).not.toContain('kz-secret-key');
  });

  it('throws on network errors so the delivery is retried, without the key in the message', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed for https://api.mobizon.kz/...apiKey=kz-secret-key');
    }) as unknown as typeof fetch;
    await expect(new MobizonSmsProvider(config, failing).send({ to: { phone: '+77015550103' }, title: '', body: 'x' })).rejects.toThrow(
      'Mobizon request failed: TypeError',
    );
  });

  it('skips when there is no phone or no key', async () => {
    const http = fakeFetch(200, { code: 0 });
    expect((await new MobizonSmsProvider(config, http.fn).send({ to: {}, title: '', body: 'x' })).status).toBe('SKIPPED');
    const noKey = new MobizonSmsProvider({ ...config, mobizonApiKey: null }, http.fn);
    expect(noKey.isConfigured()).toBe(false);
    expect((await noKey.send({ to: { phone: '+77015550104' }, title: '', body: 'x' })).status).toBe('SKIPPED');
    expect(http.calls).toHaveLength(0);
  });
});
