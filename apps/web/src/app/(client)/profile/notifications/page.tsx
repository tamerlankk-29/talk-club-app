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

type Channel = keyof S<'ChannelPrefsStateDto'>;
const CHANNELS: Array<{ key: Channel; label: string; description: string }> = [
  { key: 'push', label: 'Push notifications', description: 'On this phone or computer' },
  { key: 'whatsapp', label: 'WhatsApp', description: 'Messages to your phone number' },
  { key: 'telegram', label: 'Telegram', description: 'If you have connected Telegram' },
  { key: 'sms', label: 'SMS', description: 'Used when push is not available' },
  { key: 'email', label: 'Email', description: 'Receipts and important updates' },
];

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
      <PageHeader back="/profile" title="Notifications" />
      <PushPrompt />
      {!p ? (
        <SkeletonList count={4} />
      ) : (
        <>
          <Section title="What we send">
            <Card className="space-y-5">
              <Switch checked disabled label="Bookings and payments" description="Confirmations, cancellations, waitlist places — always on." onChange={() => undefined} />
              <Switch checked={p.reminders} onChange={(v) => update.mutate({ reminders: v })} label="Session reminders" description="Before your session and the cancellation deadline." />
              <Switch checked={p.marketing} onChange={(v) => update.mutate({ marketing: v })} label="News and offers" description="Events, special offers and club news." />
            </Card>
          </Section>
          <Section title="Channels">
            <Card className="space-y-5">
              {CHANNELS.map((c) => (
                <Switch
                  key={c.key}
                  checked={p.channels[c.key]}
                  onChange={(v) => update.mutate({ channels: { [c.key]: v } })}
                  label={c.label}
                  description={c.key === 'push' ? `${c.description} · ${p.pushSubscriptions} device${p.pushSubscriptions === 1 ? '' : 's'} connected` : c.description}
                />
              ))}
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
                toast.success('Push notifications turned off on this device.');
              }}
            >
              Turn off push on this device
            </Button>
          )}
        </>
      )}
    </div>
  );
}
