'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Send, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { asDefinition, RuleBuilder, type Definition } from '@/components/admin/rule-builder';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, InlineAlert, SkeletonList, StatusBadge } from '@/components/ui/feedback';
import { ChipGroup, Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Card, SegmentedControl } from '@/components/ui/layout';
import { ConfirmDialog, Drawer } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys } from '@/lib/admin-queries';
import { fmt, fromClubInput } from '@/lib/format';

type Broadcast = S<'BroadcastDto'>;
type Channel = S<'NotificationChannel'>;
const KEY = ['admin', 'broadcasts'];
const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: 'IN_APP', label: 'In-app' },
  { value: 'PUSH', label: 'Push' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
];

export default function BroadcastsPage() {
  const query = useQuery({ queryKey: KEY, queryFn: () => call(api.GET('/api/admin/broadcasts')) });
  const [editing, setEditing] = useState<Broadcast | 'new' | null>(null);
  return (
    <AdminPage
      title="Broadcasts"
      description="One-off messages to a segment: promotions, new groups, events, holiday schedules. Marketing broadcasts only reach clients who opted in."
      actions={
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          New broadcast
        </Button>
      }
    >
      {query.isLoading ? (
        <SkeletonList count={4} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState icon={<Send className="h-7 w-7" />} title="No broadcasts yet" />
      ) : (
        <div className="space-y-3">
          {query.data.map((b) => (
            <Card key={b.id} className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{b.title}</p>
                  <StatusBadge status={b.status} />
                  <Badge tone={b.kind === 'MARKETING' ? 'zest' : 'info'}>{b.kind.toLowerCase()}</Badge>
                </div>
                <p className="mt-0.5 line-clamp-1 text-sm text-muted">{b.body}</p>
                <p className="mt-1 text-xs text-muted">
                  {b.segmentName ?? 'Custom audience'} · {b.channels.map((c) => CHANNELS.find((x) => x.value === c)?.label ?? c).join(', ')}
                  {b.sentAt ? ` · sent ${fmt.dateTime(b.sentAt)}` : b.scheduledAt ? ` · scheduled ${fmt.dateTime(b.scheduledAt)}` : ''}
                </p>
              </div>
              {b.status === 'SENT' || b.status === 'SENDING' ? (
                <div className="grid grid-cols-4 gap-3 text-center text-xs">
                  <Stat label="recipients" value={b.recipientCount} />
                  <Stat label="sent" value={b.stats.sent} />
                  <Stat label="read" value={b.stats.read} />
                  <Stat label="failed" value={b.stats.failed} />
                </div>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setEditing(b)}>
                  Open
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
      <BroadcastDrawer broadcast={editing === 'new' ? undefined : (editing ?? undefined)} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </AdminPage>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-base font-semibold">{value}</p>
      <p className="text-muted">{label}</p>
    </div>
  );
}

function BroadcastDrawer({ broadcast, open, onOpenChange }: { broadcast?: Broadcast; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const segments = useQuery({ queryKey: adminKeys.segments, queryFn: () => call(api.GET('/api/admin/segments')), enabled: open });
  const init = () => ({
    kind: (broadcast?.kind ?? 'MARKETING') as S<'BroadcastKind'>,
    title: broadcast?.title ?? '',
    body: broadcast?.body ?? '',
    buttonLabel: broadcast?.buttonLabel ?? '',
    buttonUrl: broadcast?.buttonUrl ?? '',
    channels: (broadcast?.channels ?? ['IN_APP', 'PUSH']) as Channel[],
    audienceMode: (broadcast?.segmentId || !broadcast ? 'segment' : 'custom') as 'segment' | 'custom',
    segmentId: broadcast?.segmentId ?? '',
    audience: asDefinition(broadcast?.audience),
    scheduledAt: '',
  });
  const [f, setF] = useState(init);
  const [confirmSend, setConfirmSend] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setF(init());
  }
  const [audienceKey, setAudienceKey] = useState('');
  const audienceBody = f.audienceMode === 'segment' ? { kind: f.kind, segmentId: f.segmentId || undefined } : { kind: f.kind, audience: f.audience as unknown as Record<string, never> };
  useEffect(() => {
    const t = setTimeout(() => setAudienceKey(JSON.stringify(audienceBody)), 400);
    return () => clearTimeout(t);
  }, [JSON.stringify(audienceBody)]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useQuery({
    queryKey: ['admin', 'broadcast-audience', audienceKey],
    queryFn: () => call(api.POST('/api/admin/broadcasts/audience-preview', { body: JSON.parse(audienceKey) })),
    enabled: open && !!audienceKey && (f.audienceMode === 'custom' || !!f.segmentId),
  });

  const body = {
    kind: f.kind,
    title: f.title.trim(),
    body: f.body.trim(),
    buttonLabel: f.buttonLabel.trim() || null,
    buttonUrl: f.buttonUrl.trim() || null,
    channels: f.channels,
    segmentId: f.audienceMode === 'segment' ? f.segmentId || null : null,
    audience: f.audienceMode === 'custom' ? (f.audience as unknown as Record<string, never>) : null,
  };
  const save = useMutation({
    mutationFn: () => (broadcast ? call(api.PATCH('/api/admin/broadcasts/{id}', { params: { path: { id: broadcast.id } }, body })) : call(api.POST('/api/admin/broadcasts', { body }))),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const persist = async () => {
    const saved = await save.mutateAsync();
    await refresh();
    return saved;
  };
  const sendNow = useMutation({
    mutationFn: async () => {
      const saved = await persist();
      return call(api.POST('/api/admin/broadcasts/{id}/send', { params: { path: { id: saved.id } } }));
    },
    onSuccess: async (b) => {
      await refresh();
      toast.success(`Sending to ${b.recipientCount} clients.`);
      setConfirmSend(false);
      onOpenChange(false);
    },
    onError: toastError,
  });
  const schedule = useMutation({
    mutationFn: async () => {
      const saved = await persist();
      return call(api.POST('/api/admin/broadcasts/{id}/schedule', { params: { path: { id: saved.id } }, body: { scheduledAt: fromClubInput(f.scheduledAt) } }));
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Broadcast scheduled.');
      onOpenChange(false);
    },
    onError: toastError,
  });
  const cancel = useMutation({
    mutationFn: () => call(api.POST('/api/admin/broadcasts/{id}/cancel', { params: { path: { id: broadcast!.id } } })),
    onSuccess: async () => {
      await refresh();
      onOpenChange(false);
    },
    onError: toastError,
  });
  const errors = fieldErrors(save.error);
  const editable = !broadcast || broadcast.status === 'DRAFT' || broadcast.status === 'SCHEDULED';
  const valid = f.title.trim() && f.body.trim() && f.channels.length && (f.audienceMode === 'custom' || f.segmentId);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={broadcast ? broadcast.title : 'New broadcast'}
      width="xl"
      footer={
        editable ? (
          <>
            {broadcast?.status === 'SCHEDULED' && (
              <Button variant="ghost" className="text-danger-700" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel schedule
              </Button>
            )}
            <Button
              variant="outline"
              loading={save.isPending && !sendNow.isPending && !schedule.isPending}
              disabled={!f.title.trim()}
              onClick={() =>
                persist()
                  .then(() => {
                    toast.success('Draft saved.');
                    onOpenChange(false);
                  })
                  .catch(() => undefined)
              }
            >
              Save draft
            </Button>
            {f.scheduledAt ? (
              <Button leftIcon={<CalendarClock className="h-4 w-4" />} loading={schedule.isPending} disabled={!valid} onClick={() => schedule.mutate()}>
                Schedule
              </Button>
            ) : (
              <Button leftIcon={<Send className="h-4 w-4" />} disabled={!valid} onClick={() => setConfirmSend(true)}>
                Send now
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <SegmentedControl
          options={[
            { value: 'MARKETING', label: 'Marketing (opt-in only)' },
            { value: 'SERVICE', label: 'Service message' },
          ]}
          value={f.kind}
          onChange={(v) => setF({ ...f, kind: v })}
        />
        {f.kind === 'SERVICE' && <InlineAlert tone="info">Service messages (schedule changes, closures) reach everyone in the audience regardless of marketing consent. Don&apos;t use them for promotions.</InlineAlert>}
        <Field label="Title" required htmlFor="bc-title" error={errors.title}>
          <Input id="bc-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} disabled={!editable} />
        </Field>
        <Field label="Message" required htmlFor="bc-body" error={errors.body} hint="Placeholders: {{firstName}}, {{clubName}}">
          <Textarea id="bc-body" rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={2000} disabled={!editable} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button label" htmlFor="bc-bl">
            <Input id="bc-bl" value={f.buttonLabel} onChange={(e) => setF({ ...f, buttonLabel: e.target.value })} placeholder="e.g. Book now" disabled={!editable} />
          </Field>
          <Field label="Button link" htmlFor="bc-bu" hint="App path like /schedule or a full URL">
            <Input id="bc-bu" value={f.buttonUrl} onChange={(e) => setF({ ...f, buttonUrl: e.target.value })} placeholder="/schedule" disabled={!editable} />
          </Field>
        </div>
        <Field label="Channels">
          <ChipGroup size="sm" multiple options={CHANNELS} value={f.channels} onChange={(v) => setF({ ...f, channels: v as Channel[] })} />
        </Field>
        <Field label="Audience">
          <SegmentedControl
            options={[
              { value: 'segment', label: 'Saved segment' },
              { value: 'custom', label: 'Custom rules' },
            ]}
            value={f.audienceMode}
            onChange={(v) => setF({ ...f, audienceMode: v })}
          />
        </Field>
        {f.audienceMode === 'segment' ? (
          <Select value={f.segmentId} onChange={(e) => setF({ ...f, segmentId: e.target.value })} aria-label="Segment">
            <option value="">Choose a segment…</option>
            {segments.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.clientCount})
              </option>
            ))}
          </Select>
        ) : (
          <RuleBuilder value={f.audience} onChange={(audience: Definition) => setF({ ...f, audience })} />
        )}
        <p className="flex items-center gap-2 rounded-2xl bg-brand-50 p-3 text-sm text-brand-900">
          <Users className="h-4 w-4" />
          {preview.isFetching ? 'Counting recipients…' : preview.data ? `${preview.data.reachable} of ${preview.data.total} clients will receive it` : 'Choose an audience to see the reach'}
        </p>
        {editable && (
          <Field label="Schedule for later" htmlFor="bc-when" hint="Leave empty to send right away">
            <Input id="bc-when" type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} />
          </Field>
        )}
        {save.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Send this broadcast now?"
        description={`It goes to ${preview.data?.reachable ?? 'the selected'} clients via ${f.channels.length} channel${f.channels.length === 1 ? '' : 's'}. This can't be undone.`}
        confirmLabel="Send now"
        loading={sendNow.isPending}
        onConfirm={() => sendNow.mutate()}
      />
    </Drawer>
  );
}
