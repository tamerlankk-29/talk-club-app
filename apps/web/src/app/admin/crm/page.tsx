'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListTodo, Phone, Plus, Search, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState, type DragEvent } from 'react';
import { NewTaskDialog, TaskRow } from '@/components/admin/crm-panels';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, InlineAlert, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { ChipGroup, Field, Input, PhoneInput, Select, Textarea } from '@/components/ui/inputs';
import { Card } from '@/components/ui/layout';
import { Drawer } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminLevels, useAdminSources, useAdminTeam, useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { fmt, phoneDigitsComplete } from '@/lib/format';
import { cn, TIME_OF_DAY_LABELS, WEEKDAYS_SHORT } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { crmMessages } from '@/lib/i18n/messages/admin/crm';

type Lead = S<'LeadDto'>;
type Stage = S<'LeadStage'>;

const STAGE_COLORS: Partial<Record<Stage, string>> = {
  NEW_LEAD: '#0ea5e9',
  CONTACTED: '#6366f1',
  INTERESTED: '#8b5cf6',
  TRIAL_BOOKED: '#a855f7',
  TRIAL_ATTENDED: '#d946ef',
  MEMBERSHIP_PURCHASED: '#16a34a',
  ACTIVE_CLIENT: '#15803d',
  MEMBERSHIP_EXPIRING: '#f59e0b',
  RENEWED: '#65a30d',
  INACTIVE: '#94a3b8',
  LOST: '#ef4444',
};

function Pipeline() {
  const tr = useT(crmMessages);
  const qc = useQueryClient();
  const url = useUrlState();
  const canManage = useCan('crm.manage');
  const { data: sources } = useAdminSources();
  const { data: staff } = useAdminTeam();
  const [q, setQ] = useState(url.get('q'));
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const openLead = url.get('lead') || null;
  useEffect(() => {
    const t = setTimeout(() => q !== url.get('q') && url.set({ q }), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = { q: url.get('q') || undefined, sourceId: url.get('source') || undefined, assignedToId: url.get('assignee') || undefined, perStage: 40 };
  const query = useQuery({
    queryKey: ['admin', 'pipeline', filters],
    queryFn: () => call(api.GET('/api/admin/crm/pipeline', { params: { query: filters } })),
    placeholderData: (prev) => prev,
  });
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) => call(api.POST('/api/admin/leads/{id}/move', { params: { path: { id } }, body: { stage } })),
    onSuccess: async (lead) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'pipeline'] });
      toast.success(`${lead.name} → ${tr.stages[lead.stage] ?? lead.stageLabel}`);
    },
    onError: toastError,
  });
  const onDrop = (stage: Stage) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDragging(null);
    const lead = query.data?.flatMap((c) => c.leads).find((l) => l.id === id);
    if (lead && lead.stage !== stage) move.mutate({ id, stage });
  };

  return (
    <AdminPage
      title={tr.crmPipeline}
      description={tr.dragCardMoveAnother}
      actions={
        canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            {tr.newLead}
          </Button>
        )
      }
    >
      <Toolbar>
        <div className="w-full sm:w-72">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.namePhone} leftIcon={<Search className="h-4 w-4" />} className="h-10" aria-label={tr.searchLeads} />
        </div>
        <FilterSelect label={tr.source} value={url.get('source')} onChange={(v) => url.set({ source: v })}>
          <option value="">{tr.allSources}</option>
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={tr.assignee} value={url.get('assignee')} onChange={(v) => url.set({ assignee: v })}>
          <option value="">{tr.anyone}</option>
          {staff?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </FilterSelect>
      </Toolbar>

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data ? (
        <Skeleton className="h-[480px] w-full rounded-3xl" />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex min-w-max gap-3">
            {query.data.map((col) => (
              <section
                key={col.stage}
                onDragOver={(e) => canManage && e.preventDefault()}
                onDrop={onDrop(col.stage)}
                className={cn('flex w-72 shrink-0 flex-col rounded-3xl bg-white/70 ring-1 ring-line transition', dragging && 'ring-2 ring-dashed ring-brand-200')}
                aria-label={tr.stages[col.stage] ?? col.label}
              >
                <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_COLORS[col.stage] ?? '#6d28d9' }} />
                    {tr.stages[col.stage] ?? col.label}
                  </span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">{col.count}</span>
                </header>
                <div className="flex max-h-[65vh] min-h-24 flex-col gap-2 overflow-y-auto px-2.5 pb-3">
                  {col.leads.map((l) => (
                    <LeadCard key={l.id} lead={l} draggable={canManage} onOpen={() => url.set({ lead: l.id })} onDragStart={() => setDragging(l.id)} onDragEnd={() => setDragging(null)} />
                  ))}
                  {col.count > col.leads.length && <p className="px-2 text-xs text-muted">{tr.moreRefine(col.count - col.leads.length)}</p>}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      <LeadDrawer id={openLead} onClose={() => url.set({ lead: null })} />
      <NewLeadDrawer open={creating} onOpenChange={setCreating} onCreated={(id) => url.set({ lead: id })} />
    </AdminPage>
  );
}

function LeadCard({ lead, draggable, onOpen, onDragStart, onDragEnd }: { lead: Lead; draggable: boolean; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const tr = useT(crmMessages);
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="rounded-2xl bg-white p-3 text-left shadow-card ring-1 ring-line/70 transition hover:ring-brand-200 active:cursor-grabbing"
    >
      <p className="truncate text-sm font-semibold">{lead.name}</p>
      {lead.phone && <p className="text-xs text-muted">{fmt.phone(lead.phone)}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        {lead.source && <Badge>{lead.source.name}</Badge>}
        {lead.level && <Badge tone="brand">{lead.level.name}</Badge>}
        {lead.openTasks > 0 && (
          <Badge tone="warning">
            <ListTodo className="h-3 w-3" /> {lead.openTasks}
          </Badge>
        )}
        {lead.clientId && <Badge tone="success">{tr.clientBadge}</Badge>}
      </div>
      <p className="mt-2 text-[11px] text-subtle">
        {lead.lastActivityAt ? tr.activeAgo(fmt.relative(lead.lastActivityAt)) : tr.addedAgo(fmt.relative(lead.createdAt))}
        {lead.assignedTo ? ` · ${lead.assignedTo.name}` : ''}
      </p>
    </button>
  );
}

const STAGES: Stage[] = ['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'MEMBERSHIP_PURCHASED', 'ACTIVE_CLIENT', 'MEMBERSHIP_EXPIRING', 'RENEWED', 'INACTIVE', 'LOST'];

function LeadDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const tr = useT(crmMessages);
  const qc = useQueryClient();
  const router = useRouter();
  const canManage = useCan('crm.manage');
  const canClients = useCan('clients.manage');
  const [taskOpen, setTaskOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState<S<'CommunicationChannel'>>('WHATSAPP');
  const { data: lead } = useQuery({
    queryKey: ['admin', 'lead', id],
    queryFn: () => call(api.GET('/api/admin/leads/{id}', { params: { path: { id: id! } } })),
    enabled: !!id,
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'lead', id] }), qc.invalidateQueries({ queryKey: ['admin', 'pipeline'] })]);
  const update = useMutation({
    mutationFn: (body: S<'UpdateLeadDto'>) => call(api.PATCH('/api/admin/leads/{id}', { params: { path: { id: id! } }, body })),
    onSuccess: () => refresh(),
    onError: toastError,
  });
  const convert = useMutation({
    mutationFn: () => call(api.POST('/api/admin/leads/{id}/convert', { params: { path: { id: id! } } })),
    onSuccess: async (r) => {
      await refresh();
      toast.success(tr.clientProfileCreated);
      router.push(`/admin/clients/${r.clientId}`);
    },
    onError: toastError,
  });
  const log = useMutation({
    mutationFn: () => call(api.POST('/api/admin/communications', { body: { leadId: id!, channel, direction: 'OUTBOUND', content: note.trim() } })),
    onSuccess: async () => {
      setNote('');
      await refresh();
    },
    onError: toastError,
  });

  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()} title={lead?.name ?? tr.lead} description={lead ? tr.stageSince(tr.stages[lead.stage] ?? lead.stageLabel, fmt.dateShort(lead.stageChangedAt)) : undefined} width="lg">
      {!lead ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {lead.phone && (
              <>
                <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand-700">
                  <Phone className="h-4 w-4" /> {fmt.phone(lead.phone)}
                </a>
                <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="font-semibold text-[#128C7E]">
                  {tr.whatsapp}
                </a>
              </>
            )}
            {lead.email && <span className="text-muted">{lead.email}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr.stage} htmlFor="ld-stage">
              <Select id="ld-stage" value={lead.stage} disabled={!canManage} onChange={(e) => (e.target.value === 'LOST' ? setLostReason(' ') : update.mutate({ stage: e.target.value as Stage }))}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {tr.stages[s] ?? s}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="text-sm">
              <p className="font-semibold">{tr.details}</p>
              <p className="text-muted">
                {lead.source?.name ?? tr.unknownSource} · {lead.level?.name ?? tr.levelQ}
              </p>
              <p className="text-muted">
                {lead.preferredDays.map((d) => WEEKDAYS_SHORT[d]).join(', ') || 'any day'} · {lead.preferredTimes.map((t) => TIME_OF_DAY_LABELS[t]).join(', ') || 'any time'}
              </p>
            </div>
          </div>
          {lostReason && (
            <div className="flex gap-2">
              <Input value={lostReason.trim()} onChange={(e) => setLostReason(e.target.value || ' ')} placeholder={tr.whyWasLeadLost} className="h-10" autoFocus />
              <Button
                size="sm"
                variant="danger"
                className="h-10"
                disabled={!lostReason.trim()}
                onClick={() => {
                  update.mutate({ stage: 'LOST', lostReason: lostReason.trim() });
                  setLostReason('');
                }}
              >
                {tr.markLost}
              </Button>
            </div>
          )}
          {lead.lostReason && <InlineAlert tone="danger" title={tr.lost}>{lead.lostReason}</InlineAlert>}
          {lead.notes && <p className="whitespace-pre-line rounded-2xl bg-canvas p-3 text-sm">{lead.notes}</p>}
          <div className="flex flex-wrap gap-2">
            {lead.clientId ? (
              <Link href={`/admin/clients/${lead.clientId}`} className="inline-flex items-center gap-1.5 rounded-xl bg-success-50 px-3 py-2 text-sm font-semibold text-success-700">
                <UserCheck className="h-4 w-4" /> Open client profile
              </Link>
            ) : (
              canClients && (
                <Button size="sm" variant="secondary" loading={convert.isPending} onClick={() => convert.mutate()}>
                  {tr.createClientProfile}
                </Button>
              )
            )}
            {canManage && (
              <Button size="sm" variant="outline" leftIcon={<ListTodo className="h-4 w-4" />} onClick={() => setTaskOpen(true)}>
                {tr.addTask}
              </Button>
            )}
          </div>

          {lead.trials.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{tr.trials}</h3>
              <div className="space-y-1.5">
                {lead.trials.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-2xl bg-canvas px-3 py-2 text-sm">
                    <span>{t.sessionStartsAt ? fmt.dateTime(t.sessionStartsAt) : tr.requestedOn(fmt.dateShort(t.createdAt))}</span>
                    <span className="flex gap-1.5">
                      <StatusBadge status={t.status} />
                      {t.outcome !== 'PENDING' && <Badge>{t.outcome.toLowerCase().replace('_', ' ')}</Badge>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lead.tasks.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{tr.tasks}</h3>
              <Card padded={false} className="divide-y divide-line/70">
                {lead.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} showClient={false} />
                ))}
              </Card>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{tr.communications}</h3>
            {canManage && (
              <div className="mb-3 space-y-2">
                <div className="flex gap-2">
                  <Select value={channel} onChange={(e) => setChannel(e.target.value as S<'CommunicationChannel'>)} className="h-10 w-40" aria-label={tr.channel}>
                    <option value="WHATSAPP">{tr.whatsapp}</option>
                    <option value="PHONE">{tr.phone}</option>
                    <option value="INSTAGRAM">{tr.instagram}</option>
                    <option value="TELEGRAM">{tr.telegram}</option>
                    <option value="IN_PERSON">{tr.person}</option>
                    <option value="OTHER">{tr.other}</option>
                  </Select>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr.whatWasDiscussed} className="h-10" />
                  <Button size="sm" className="h-10" disabled={!note.trim()} loading={log.isPending} onClick={() => log.mutate()}>
                    {tr.log}
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {lead.communications.length ? (
                lead.communications.map((c) => (
                  <div key={c.id} className="rounded-2xl bg-canvas px-3 py-2 text-sm">
                    <p className="whitespace-pre-line">{c.content}</p>
                    <p className="text-xs text-muted">
                      {c.channel.toLowerCase()} · {fmt.dateTime(c.occurredAt)}
                      {c.createdBy ? ` · ${c.createdBy.name}` : ''}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">{tr.nothingLoggedYet}</p>
              )}
            </div>
          </div>
          <NewTaskDialog open={taskOpen} onOpenChange={(o) => {
            setTaskOpen(o);
            if (!o) void refresh();
          }} leadId={lead.id} clientId={lead.clientId ?? undefined} />
        </div>
      )}
    </Drawer>
  );
}

function NewLeadDrawer({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const tr = useT(crmMessages);
  const qc = useQueryClient();
  const { data: sources } = useAdminSources();
  const { data: levels } = useAdminLevels();
  const [f, setF] = useState({ name: '', phone: '', email: '', sourceId: '', levelId: '', notes: '', days: [] as number[], times: [] as S<'TimeOfDay'>[] });
  const create = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/admin/leads', {
          body: {
            name: f.name.trim(),
            phone: phoneDigitsComplete(f.phone) ? f.phone.replace(/\s/g, '') : undefined,
            email: f.email.trim() || undefined,
            sourceId: f.sourceId || undefined,
            levelId: f.levelId || undefined,
            notes: f.notes.trim() || undefined,
            preferredDays: f.days,
            preferredTimes: f.times,
          },
        }),
      ),
    onSuccess: async (lead) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'pipeline'] });
      setF({ name: '', phone: '', email: '', sourceId: '', levelId: '', notes: '', days: [], times: [] });
      onOpenChange(false);
      onCreated(lead.id);
    },
  });
  const errors = fieldErrors(create.error);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={tr.newLead}
      description={tr.someoneWhoWroteInstagram}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={create.isPending} disabled={!f.name.trim()} onClick={() => create.mutate()}>
            {tr.createLead}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr.name} required htmlFor="nl-name" error={errors.name}>
          <Input id="nl-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <Field label={tr.phone} htmlFor="nl-phone" error={errors.phone}>
          <PhoneInput id="nl-phone" value={f.phone} onChange={(phone) => setF({ ...f, phone })} />
        </Field>
        <Field label={tr.email} htmlFor="nl-email" error={errors.email}>
          <Input id="nl-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr.source} htmlFor="nl-src">
            <Select id="nl-src" value={f.sourceId} onChange={(e) => setF({ ...f, sourceId: e.target.value })}>
              <option value="">{tr.unknown}</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.level} htmlFor="nl-level">
            <Select id="nl-level" value={f.levelId} onChange={(e) => setF({ ...f, levelId: e.target.value })}>
              <option value="">{tr.unknown}</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={tr.preferredDays}>
          <ChipGroup size="sm" multiple options={[1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }))} value={f.days} onChange={(v) => setF({ ...f, days: v as number[] })} />
        </Field>
        <Field label={tr.preferredTime}>
          <ChipGroup size="sm" multiple options={(['AFTERNOON', 'EVENING'] as const).map((t) => ({ value: t, label: TIME_OF_DAY_LABELS[t] }))} value={f.times} onChange={(v) => setF({ ...f, times: v as S<'TimeOfDay'>[] })} />
        </Field>
        <Field label={tr.notes} htmlFor="nl-notes">
          <Textarea id="nl-notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        {create.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(create.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}

export default function CrmPage() {
  return (
    <Suspense>
      <Pipeline />
    </Suspense>
  );
}
