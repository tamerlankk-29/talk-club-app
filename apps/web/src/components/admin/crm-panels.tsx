'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, InlineAlert, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Card } from '@/components/ui/layout';
import { Modal } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminTeam } from '@/lib/admin-queries';
import { useAuth, useCan } from '@/lib/auth';
import { clubNow, fmt, fromClubInput } from '@/lib/format';
import { cn } from '@/lib/utils';

type Channel = S<'CommunicationChannel'>;
type Task = S<'TaskDto'>;
type Priority = S<'TaskPriority'>;

const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'PHONE', label: 'Phone call' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'IN_PERSON', label: 'In person' },
  { value: 'OTHER', label: 'Other' },
];

/** Quick internal note on a client's timeline. */
export function NoteComposer({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const canManage = useCan('clients.manage');
  const [text, setText] = useState('');
  const add = useMutation({
    mutationFn: () => call(api.POST('/api/admin/clients/{id}/notes', { params: { path: { id: clientId } }, body: { text: text.trim() } })),
    onSuccess: async () => {
      setText('');
      await qc.invalidateQueries({ queryKey: ['admin', 'client', clientId, 'timeline'] });
      toast.success('Note added.');
    },
    onError: toastError,
  });
  if (!canManage) return null;
  return (
    <div className="flex items-end gap-2">
      <Textarea rows={2} placeholder="Add a note for the team…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="New note" />
      <Button size="sm" loading={add.isPending} disabled={!text.trim()} onClick={() => add.mutate()}>
        Add
      </Button>
    </div>
  );
}

/** Calls, messages and meetings logged by staff (WhatsApp, phone, Instagram…). */
export function CommunicationLog({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const canManage = useCan('crm.manage');
  const key = ['admin', 'communications', clientId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => call(api.GET('/api/admin/communications', { params: { query: { clientId } } })),
  });
  const [channel, setChannel] = useState<Channel>('WHATSAPP');
  const [direction, setDirection] = useState<'OUTBOUND' | 'INBOUND'>('OUTBOUND');
  const [content, setContent] = useState('');
  const log = useMutation({
    mutationFn: () => call(api.POST('/api/admin/communications', { body: { channel, direction, clientId, content: content.trim() } })),
    onSuccess: async (list) => {
      setContent('');
      qc.setQueryData(key, list);
      await qc.invalidateQueries({ queryKey: ['admin', 'client', clientId, 'timeline'] });
    },
    onError: toastError,
  });
  return (
    <div className="space-y-3">
      {canManage && (
        <Card className="space-y-3 p-4">
          <div className="flex gap-2">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="h-10" aria-label="Channel">
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select value={direction} onChange={(e) => setDirection(e.target.value as 'OUTBOUND' | 'INBOUND')} className="h-10" aria-label="Direction">
              <option value="OUTBOUND">We contacted</option>
              <option value="INBOUND">Client contacted</option>
            </Select>
          </div>
          <Textarea rows={2} placeholder="What was discussed?" value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} aria-label="Summary" />
          <div className="flex justify-end">
            <Button size="sm" loading={log.isPending} disabled={!content.trim()} onClick={() => log.mutate()}>
              Log communication
            </Button>
          </div>
        </Card>
      )}
      <Card padded={false} className="divide-y divide-line/70">
        {isLoading ? (
          <Skeleton className="m-5 h-16" />
        ) : data?.length ? (
          data.map((m) => (
            <div key={m.id} className="flex gap-3 px-5 py-3 text-sm">
              <span className={cn('mt-0.5', m.direction === 'INBOUND' ? 'text-success-700' : 'text-brand-700')}>
                {m.direction === 'INBOUND' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line">{m.content}</p>
                <p className="text-xs text-muted">
                  {CHANNELS.find((c) => c.value === m.channel)?.label ?? m.channel} · {fmt.dateTime(m.occurredAt)}
                  {m.createdBy ? ` · ${m.createdBy.name}` : ''}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-muted">No communications logged.</p>
        )}
      </Card>
    </div>
  );
}

const PRIORITY_TONE: Record<Priority, 'neutral' | 'info' | 'warning' | 'danger'> = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', URGENT: 'danger' };

export function TaskRow({ task, showClient = true }: { task: Task; showClient?: boolean }) {
  const qc = useQueryClient();
  const canManage = useCan('crm.manage');
  const done = task.status === 'DONE';
  const toggle = useMutation({
    mutationFn: () => call(api.PATCH('/api/admin/tasks/{id}', { params: { path: { id: task.id } }, body: { status: done ? 'OPEN' : 'DONE' } })),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'tasks'] }), qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] })]),
    onError: toastError,
  });
  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <button type="button" disabled={!canManage || toggle.isPending} onClick={() => toggle.mutate()} className="mt-0.5 text-brand-700 disabled:opacity-50" aria-label={done ? 'Mark as open' : 'Mark as done'}>
        {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('font-semibold', done && 'text-muted line-through')}>{task.title}</p>
          {task.priority !== 'MEDIUM' && <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority.toLowerCase()}</Badge>}
          {task.fromAutomation && <Badge>auto</Badge>}
        </div>
        {task.description && <p className="mt-0.5 whitespace-pre-line text-muted">{task.description}</p>}
        <p className="mt-1 text-xs text-muted">
          {task.dueAt && <span className={cn(task.isOverdue && !done && 'font-semibold text-danger-700')}>Due {fmt.dateTime(task.dueAt)} · </span>}
          {showClient && task.client && (
            <>
              <Link href={`/admin/clients/${task.client.id}`} className="font-semibold text-brand-700">
                {task.client.name}
              </Link>{' '}
              ·{' '}
            </>
          )}
          {showClient && task.lead && <>Lead: {task.lead.name} · </>}
          {task.assignedTo ? task.assignedTo.name : 'Unassigned'}
        </p>
      </div>
    </div>
  );
}

export function NewTaskDialog({ open, onOpenChange, clientId, leadId }: { open: boolean; onOpenChange: (o: boolean) => void; clientId?: string; leadId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: staff } = useAdminTeam(open);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState(clubNow().plus({ days: 1 }).set({ hour: 12, minute: 0 }).toFormat("yyyy-MM-dd'T'HH:mm"));
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [assignee, setAssignee] = useState(user?.id ?? '');
  const create = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/admin/tasks', {
          body: {
            title: title.trim(),
            description: description.trim() || undefined,
            dueAt: due ? fromClubInput(due) : undefined,
            priority,
            clientId,
            leadId,
            assignedToId: assignee || undefined,
          },
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'tasks'] });
      setTitle('');
      setDescription('');
      onOpenChange(false);
      toast.success('Task created.');
    },
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New task"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={create.isPending} disabled={!title.trim()} onClick={() => create.mutate()}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Task" required htmlFor="t-title">
          <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call about renewal" autoFocus maxLength={200} />
        </Field>
        <Field label="Details" htmlFor="t-desc">
          <Textarea id="t-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due" htmlFor="t-due">
            <Input id="t-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Priority" htmlFor="t-prio">
            <Select id="t-prio" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </Field>
        </div>
        <Field label="Assignee" htmlFor="t-assignee">
          <Select id="t-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {staff?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </Select>
        </Field>
        {create.error && <InlineAlert tone="danger">{errorMessage(create.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

/** Tasks linked to one client. */
export function ClientTasks({ clientId }: { clientId: string }) {
  const canManage = useCan('crm.manage');
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tasks', { clientId }],
    queryFn: () => call(api.GET('/api/admin/tasks', { params: { query: { clientId, scope: 'all' } } })),
  });
  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New task
          </Button>
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : data?.length ? (
        <Card padded={false} className="divide-y divide-line/70">
          {data.map((t) => (
            <TaskRow key={t.id} task={t} showClient={false} />
          ))}
        </Card>
      ) : (
        <EmptyState title="No tasks" description="Create follow-ups like calls or renewal reminders." />
      )}
      <NewTaskDialog open={creating} onOpenChange={setCreating} clientId={clientId} />
    </div>
  );
}
