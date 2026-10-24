'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Send } from 'lucide-react';
import { useState } from 'react';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, InlineAlert, SkeletonList, StatusBadge } from '@/components/ui/feedback';
import { Checkbox, ChipGroup, Field, Input, Textarea } from '@/components/ui/inputs';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/layout';
import { Drawer } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { fmt } from '@/lib/format';

type Template = S<'NotificationTemplateDto'>;
type Channel = S<'NotificationChannel'>;
const KEY = ['admin', 'notification-templates'];
const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: 'IN_APP', label: 'In-app' },
  { value: 'PUSH', label: 'Push' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
];
const CATEGORY_LABEL: Record<string, string> = { TRANSACTIONAL: 'Service', REMINDER: 'Reminders', MARKETING: 'Marketing', STAFF: 'Staff alerts' };

export default function NotificationsAdminPage() {
  const templates = useQuery({ queryKey: KEY, queryFn: () => call(api.GET('/api/admin/notifications/templates')) });
  const [editing, setEditing] = useState<Template | null>(null);
  const groups = new Map<string, Template[]>();
  for (const t of templates.data ?? []) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  return (
    <AdminPage title="Notifications" description="Every automatic message the club sends. Edit the wording and channels; placeholders are filled in per client.">
      <Tabs defaultValue="templates">
        <TabsList className="max-w-xs">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="deliveries">Delivery log</TabsTrigger>
        </TabsList>
        <TabsContent value="templates">
          {templates.isLoading ? (
            <SkeletonList count={6} />
          ) : templates.error ? (
            <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
          ) : (
            <div className="space-y-6">
              {[...groups.entries()].map(([category, list]) => (
                <section key={category} className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{CATEGORY_LABEL[category] ?? category}</h2>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {list.map((t) => (
                      <button key={t.key} type="button" onClick={() => setEditing(t)} className="rounded-3xl bg-white p-4 text-left shadow-card ring-1 ring-line/70 transition hover:ring-brand-200">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold">{t.name}</p>
                          <div className="flex gap-1">
                            {t.isCustomized && <Badge tone="brand">edited</Badge>}
                            {!t.isActive && <Badge>off</Badge>}
                          </div>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">{t.title}</p>
                        <p className="line-clamp-2 text-sm text-muted">{t.body}</p>
                        <p className="mt-2 text-xs text-subtle">{t.channels.map((c) => CHANNELS.find((x) => x.value === c)?.label ?? c).join(' · ')}</p>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="deliveries">
          <Deliveries />
        </TabsContent>
      </Tabs>
      {editing && <TemplateDrawer template={editing} onClose={() => setEditing(null)} />}
    </AdminPage>
  );
}

function Deliveries() {
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'deliveries', status, channel],
    queryFn: () =>
      call(
        api.GET('/api/admin/notifications/deliveries', {
          params: { query: { status: (status || undefined) as S<'DeliveryStatus'> | undefined, channel: (channel || undefined) as Channel | undefined, limit: 200 } },
        }),
      ),
    refetchInterval: 30_000,
  });
  return (
    <div className="space-y-3">
      <Toolbar>
        <FilterSelect label="Status" value={status} onChange={setStatus}>
          <option value="">All statuses</option>
          <option value="SENT">Sent</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
          <option value="SKIPPED">Skipped</option>
        </FilterSelect>
        <FilterSelect label="Channel" value={channel} onChange={setChannel}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </FilterSelect>
      </Toolbar>
      <Card padded={false} className="divide-y divide-line/70">
        {isLoading ? (
          <SkeletonList count={5} className="p-5" />
        ) : data?.length ? (
          data.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <StatusBadge status={d.status} />
              <Badge>{CHANNELS.find((c) => c.value === d.channel)?.label ?? d.channel}</Badge>
              <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
              <span className="text-muted">{d.recipient ?? '—'}</span>
              {d.error && <span className="w-full text-xs text-danger-700">{d.error}</span>}
              <span className="text-xs text-subtle">
                {fmt.dateTime(d.sentAt ?? d.createdAt)}
                {d.attempts > 1 ? ` · ${d.attempts} attempts` : ''}
                {d.provider ? ` · ${d.provider}` : ''}
              </span>
            </div>
          ))
        ) : (
          <p className="px-5 py-6 text-center text-sm text-muted">No deliveries.</p>
        )}
      </Card>
    </div>
  );
}

function TemplateDrawer({ template, onClose }: { template: Template; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: template.title,
    body: template.body,
    buttonLabel: template.buttonLabel ?? '',
    buttonUrl: template.buttonUrl ?? '',
    secondaryButtonLabel: template.secondaryButtonLabel ?? '',
    secondaryButtonUrl: template.secondaryButtonUrl ?? '',
    channels: template.channels,
    isActive: template.isActive,
  });
  const save = useMutation({
    mutationFn: () =>
      call(
        api.PATCH('/api/admin/notifications/templates/{key}', {
          params: { path: { key: template.key } },
          body: {
            title: f.title,
            body: f.body,
            buttonLabel: f.buttonLabel || null,
            buttonUrl: f.buttonUrl || null,
            secondaryButtonLabel: f.secondaryButtonLabel || null,
            secondaryButtonUrl: f.secondaryButtonUrl || null,
            channels: f.channels,
            isActive: f.isActive,
          },
        }),
      ),
    onSuccess: (list) => {
      qc.setQueryData(KEY, list);
      toast.success('Template saved.');
      onClose();
    },
  });
  const reset = useMutation({
    mutationFn: () => call(api.POST('/api/admin/notifications/templates/{key}/reset', { params: { path: { key: template.key } } })),
    onSuccess: (list) => {
      qc.setQueryData(KEY, list);
      toast.success('Restored the default text.');
      onClose();
    },
    onError: toastError,
  });
  const test = useMutation({
    mutationFn: () => call(api.POST('/api/admin/notifications/templates/{key}/test', { params: { path: { key: template.key } } })),
    onSuccess: () => toast.success('Test sent to your staff inbox.'),
    onError: toastError,
  });
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={template.name}
      description={template.description ?? template.key}
      width="lg"
      footer={
        <>
          {template.isCustomized && (
            <Button variant="ghost" className="mr-auto" leftIcon={<RotateCcw className="h-4 w-4" />} loading={reset.isPending} onClick={() => reset.mutate()}>
              Restore default
            </Button>
          )}
          <Button variant="outline" leftIcon={<Send className="h-4 w-4" />} loading={test.isPending} onClick={() => test.mutate()}>
            Send test
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">
          Placeholders: {template.placeholders.map((p) => `{{${p}}}`).join(', ') || 'none'}
        </InlineAlert>
        <Field label="Title" htmlFor="nt-title">
          <Input id="nt-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Message" htmlFor="nt-body">
          <Textarea id="nt-body" rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button label" htmlFor="nt-bl">
            <Input id="nt-bl" value={f.buttonLabel} onChange={(e) => setF({ ...f, buttonLabel: e.target.value })} />
          </Field>
          <Field label="Button link" htmlFor="nt-bu">
            <Input id="nt-bu" value={f.buttonUrl} onChange={(e) => setF({ ...f, buttonUrl: e.target.value })} />
          </Field>
          <Field label="Second button label" htmlFor="nt-sbl">
            <Input id="nt-sbl" value={f.secondaryButtonLabel} onChange={(e) => setF({ ...f, secondaryButtonLabel: e.target.value })} />
          </Field>
          <Field label="Second button link" htmlFor="nt-sbu">
            <Input id="nt-sbu" value={f.secondaryButtonUrl} onChange={(e) => setF({ ...f, secondaryButtonUrl: e.target.value })} />
          </Field>
        </div>
        <Field label="Channels" hint="SMS is used only when the client has no push-enabled device.">
          <ChipGroup size="sm" multiple options={CHANNELS} value={f.channels} onChange={(v) => setF({ ...f, channels: v as Channel[] })} />
        </Field>
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Send this notification" />
        {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}
