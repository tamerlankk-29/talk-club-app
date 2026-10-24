'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PushPrompt } from '@/components/client/push-prompt';
import { RequireAuth } from '@/components/client/require-auth';
import { Button } from '@/components/ui/button';
import { ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Switch } from '@/components/ui/inputs';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { toast, toastError } from '@/components/ui/toast';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { disablePush, getPushState, type PushState } from '@/lib/push';
import { keys } from '@/lib/queries';
import { messagesFor } from '@/lib/i18n';
import { useT } from '@/lib/i18n';
import { profileMessages } from '@/lib/i18n/messages/profile';

type Channel = keyof S<'ChannelPrefsStateDto'>;
const CHANNELS: Channel[] = ['telegram', 'push', 'whatsapp', 'sms', 'email'];

function describe(channel: Channel, p: S<'PreferencesDto'>): string {
  const t = messagesFor(profileMessages);
  const base = t.channelHint[channel];
  if (channel === 'push') return `${base} · ${t.devicesConnected(p.pushSubscriptions)}`;
  if (channel === 'telegram') {
    if (p.telegramLinked) return `${base} · ${t.telegramConnected}`;
    return `${base} · ${p.telegramBotUrl ? t.telegramNotConnected : t.telegramUnavailable}`;
  }
  return base;
}

export default function NotificationSettingsPage() {
  return (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  );
}

function Settings() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: keys.preferences, queryFn: () => call(api.GET('/api/notifications/preferences')) });
  const [push, setPush] = useState<PushState | null>(null);
  const t = useT(profileMessages);
  useEffect(() => {
    void getPushState().then(setPush);
  }, []);

  const update = useMutation({
    mutationFn: (body: S<'UpdatePreferencesDto'>) => call(api.PATCH('/api/notifications/preferences', { body })),
    onSuccess: (data) => qc.setQueryData(keys.preferences, data),
    onError: toastError,
  });

  if (prefs.error) return <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} className="mt-10" />;
  const p = prefs.data;
  return (
    <div className="space-y-6 pt-5">
      <PageHeader back="/profile" title={t.notifications} />
      <PushPrompt />
      {!p ? (
        <SkeletonList count={4} />
      ) : (
        <>
          <Section title={t.whatWeSend}>
            <Card className="space-y-5">
              <Switch checked disabled label={t.bookingsPayments} description={t.bookingsPaymentsHint} onChange={() => undefined} />
              <Switch checked={p.reminders} onChange={(v) => update.mutate({ reminders: v })} label={t.reminders} description={t.remindersHint} />
              <Switch checked={p.marketing} onChange={(v) => update.mutate({ marketing: v })} label={t.news} description={t.newsHint} />
            </Card>
          </Section>
          <Section title={t.channels}>
            <Card className="space-y-5">
              {CHANNELS.map((c) => (
                <Switch
                  key={c}
                  checked={p.channels[c]}
                  onChange={(v) => update.mutate({ channels: { [c]: v } })}
                  label={t.channel[c]}
                  description={describe(c, p)}
                />
              ))}
              {!p.telegramLinked && p.telegramBotUrl && p.channels.telegram && (
                <a
                  href={p.telegramBotUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center rounded-xl bg-sky-100 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-200"
                >
                  {t.connectTelegram}
                </a>
              )}
            </Card>
          </Section>
          {push === 'enabled' && (
            <Button
              variant="ghost"
              block
              onClick={async () => {
                await disablePush();
                setPush(await getPushState());
                await qc.invalidateQueries({ queryKey: keys.preferences });
                toast.success(t.pushOff);
              }}
            >
              {t.turnOffPush}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
