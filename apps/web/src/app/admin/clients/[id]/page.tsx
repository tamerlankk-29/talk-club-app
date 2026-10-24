'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  CreditCard,
  Gift,
  Mail,
  MessageSquarePlus,
  Pencil,
  Phone,
  ShieldX,
  Tag,
  Ticket,
  UserRoundPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { ClientFormDrawer } from '@/components/admin/client-form';
import { GrantMembershipDrawer, MembershipDrawer } from '@/components/admin/membership-dialogs';
import { ConfirmPaymentDialog, PaymentRequestDrawer } from '@/components/admin/payment-dialogs';
import { ClientTasks, CommunicationLog, NoteComposer } from '@/components/admin/crm-panels';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState, ErrorState, InlineAlert, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Checkbox, Field, Input, PhoneInput, Textarea } from '@/components/ui/inputs';
import { Card, KeyValue, Section, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/layout';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys, useAdminTags, useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { CATEGORY_LABELS, FORMAT_LABELS, TIME_OF_DAY_LABELS, WEEKDAYS_SHORT } from '@/lib/utils';

type ClientDetail = S<'ClientDetailDto'>;

export default function ClientPage() {
  return (
    <Suspense>
      <ClientView />
    </Suspense>
  );
}

function ClientView() {
  const { id } = useParams<{ id: string }>();
  const url = useUrlState();
  const tab = url.get('tab', 'overview');
  const query = useQuery({ queryKey: adminKeys.client(id), queryFn: () => call(api.GET('/api/admin/clients/{id}', { params: { path: { id } } })) });
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const c = query.data;
  if (!c) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <ClientHeader client={c} />
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'overview' ? null : v })}>
        <TabsList className="max-w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="memberships">Memberships</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="tasks">Tasks{c.openTasks ? ` (${c.openTasks})` : ''}</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="privacy">Family & privacy</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview client={c} />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsTab client={c} />
        </TabsContent>
        <TabsContent value="memberships">
          <MembershipsTab client={c} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab client={c} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab client={c} />
        </TabsContent>
        <TabsContent value="tasks">
          <ClientTasks clientId={c.profile.id} />
        </TabsContent>
        <TabsContent value="feedback">
          <FeedbackTab clientId={c.profile.id} />
        </TabsContent>
        <TabsContent value="privacy">
          <PrivacyTab client={c} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ClientHeader({ client: c }: { client: ClientDetail }) {
  const canManage = useCan('clients.manage');
  const canPay = useCan('payments.manage');
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [tagging, setTagging] = useState(false);
  const p = c.profile;
  const m = c.currentMembership;
  return (
    <Card className="flex flex-col gap-5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Avatar name={p.fullName} src={p.photoUrl} size="xl" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-display text-2xl font-semibold">{p.fullName}</h1>
            {c.status !== 'ACTIVE' && <StatusBadge status={c.status} />}
            {c.lead && <Badge tone="brand">{c.lead.stageLabel}</Badge>}
            {c.deletionRequestedAt && <Badge tone="danger">Deletion requested</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {p.phone && (
              <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                <Phone className="h-3.5 w-3.5" /> {fmt.phone(p.phone)}
              </a>
            )}
            {p.phone && (
              <a href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="font-semibold text-[#128C7E] hover:underline">
                WhatsApp
              </a>
            )}
            {p.email && (
              <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:text-brand-700">
                <Mail className="h-3.5 w-3.5" /> {p.email}
              </a>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{p.level?.name ?? 'Level not set'}</Badge>
            <Badge>{CATEGORY_LABELS[p.category] ?? p.category}</Badge>
            {c.tags.map((t) => (
              <span key={t.id} className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: `${t.color ?? '#6d28d9'}1f`, color: t.color ?? '#6d28d9' }}>
                {t.name}
              </span>
            ))}
            {canManage && (
              <button type="button" onClick={() => setTagging(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs font-semibold text-muted hover:border-brand-300">
                <Tag className="h-3 w-3" /> Tags
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        <div className="rounded-2xl bg-brand-50 px-4 py-2.5 text-sm">
          {m ? (
            <>
              <p className="font-semibold text-brand-900">
                {m.planName} · {m.visitsRemaining}/{m.visitsCredited} visits
              </p>
              <p className="text-xs text-brand-900/70">until {fmt.date(m.expiresAt)}</p>
            </>
          ) : (
            <p className="font-semibold text-brand-900">No active membership</p>
          )}
        </div>
        {canPay && (
          <Button size="sm" leftIcon={<CreditCard className="h-4 w-4" />} onClick={() => setPaying(true)}>
            Payment request
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      <ClientFormDrawer open={editing} onOpenChange={setEditing} client={c} />
      <PaymentRequestDrawer open={paying} onOpenChange={setPaying} clientId={p.id} clientName={p.fullName} />
      <TagsDialog client={c} open={tagging} onOpenChange={setTagging} />
    </Card>
  );
}

function TagsDialog({ client, open, onOpenChange }: { client: ClientDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: tags } = useAdminTags();
  const [selected, setSelected] = useState<string[]>(client.tags.map((t) => t.id));
  const [newTag, setNewTag] = useState('');
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setSelected(client.tags.map((t) => t.id));
  }
  const save = useMutation({
    mutationFn: () => call(api.PUT('/api/admin/clients/{id}/tags', { params: { path: { id: client.profile.id } }, body: { tagIds: selected } })),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: adminKeys.client(client.profile.id) }), qc.invalidateQueries({ queryKey: adminKeys.tags })]);
      onOpenChange(false);
    },
    onError: toastError,
  });
  const create = useMutation({
    mutationFn: () => call(api.POST('/api/admin/tags', { body: { name: newTag.trim() } })),
    onSuccess: (all) => {
      qc.setQueryData(adminKeys.tags, all);
      const created = all.find((t) => t.name.toLowerCase() === newTag.trim().toLowerCase());
      if (created) setSelected((s) => [...s, created.id]);
      setNewTag('');
    },
    onError: toastError,
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Tags"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {tags?.map((t) => (
            <Checkbox key={t.id} checked={selected.includes(t.id)} onChange={(v) => setSelected((s) => (v ? [...s, t.id] : s.filter((x) => x !== t.id)))} label={t.name} />
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag" className="h-10" maxLength={40} />
          <Button variant="outline" size="sm" className="h-10" disabled={!newTag.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Overview({ client: c }: { client: ClientDetail }) {
  const stats = useQuery({
    queryKey: ['admin', 'client', c.profile.id, 'stats'],
    queryFn: () => call(api.GET('/api/admin/clients/{id}/stats', { params: { path: { id: c.profile.id } } })),
  });
  const p = c.profile;
  const s = stats.data;
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div className="grid gap-3 sm:grid-cols-4">
          <Mini label="Attended" value={s?.sessionsAttended} />
          <Mini label="Attendance rate" value={s ? `${s.attendanceRate}%` : undefined} />
          <Mini label="No-shows" value={s?.noShows} />
          <Mini label="Late cancels" value={s?.lateCancelled} />
        </div>
        <Section title="Upcoming sessions">
          <Card padded={false} className="divide-y divide-line/70">
            {c.upcomingBookings.length ? (
              c.upcomingBookings.map((b) => (
                <Link key={b.id} href={`/admin/sessions/${b.sessionId}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-brand-50/40">
                  <span>
                    <span className="font-semibold">
                      {fmt.weekdayDate(b.startsAt)}, {fmt.time(b.startsAt)}
                    </span>{' '}
                    · {b.title}
                    {b.teacherName ? ` · ${b.teacherName}` : ''}
                  </span>
                  {b.kind === 'TRIAL' && <Badge tone="zest">Trial</Badge>}
                </Link>
              ))
            ) : (
              <p className="px-5 py-4 text-sm text-muted">No upcoming bookings.</p>
            )}
          </Card>
        </Section>
        <Section title="Notes">
          <NoteComposer clientId={p.id} />
          {c.notes && <p className="whitespace-pre-line rounded-2xl bg-warning-50 p-4 text-sm text-warning-700">{c.notes}</p>}
        </Section>
      </div>
      <div className="space-y-6">
        <Card>
          <KeyValue
            items={[
              { label: 'Registered', value: fmt.date(p.registeredAt) },
              { label: 'Date of birth', value: p.birthDate ? fmt.date(`${p.birthDate}T12:00:00Z`) : '—' },
              { label: 'Days', value: p.preferredDays.length ? p.preferredDays.map((d) => WEEKDAYS_SHORT[d]).join(', ') : '—' },
              { label: 'Time', value: p.preferredTimes.length ? p.preferredTimes.map((t) => TIME_OF_DAY_LABELS[t]).join(', ') : '—' },
              { label: 'Format', value: FORMAT_LABELS[p.formatPreference] ?? '—' },
              { label: 'Favourite teachers', value: p.preferredTeachers.map((t) => t.name).join(', ') || '—' },
              { label: 'Source', value: c.lead?.source ?? '—' },
              { label: 'App account', value: c.account?.hasAccount ? (c.account.lastLoginAt ? `last login ${fmt.relative(c.account.lastLoginAt)}` : 'yes') : 'no' },
              { label: 'Marketing consent', value: p.marketingConsent ? 'yes' : 'no' },
              ...(s?.favoriteTeacher ? [{ label: 'Most visited teacher', value: `${s.favoriteTeacher.name} (${s.favoriteTeacher.sessions})` }] : []),
              ...(s?.lastVisitAt ? [{ label: 'Last visit', value: fmt.date(s.lastVisitAt) }] : []),
            ]}
          />
        </Card>
        {c.referral.referredBy && (
          <Card className="text-sm">
            Referred by{' '}
            <Link className="font-semibold text-brand-700" href={`/admin/clients/${c.referral.referredBy.id}`}>
              {c.referral.referredBy.name}
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {value === undefined ? <Skeleton className="mt-2 h-6 w-12" /> : <p className="mt-1 font-display text-xl font-semibold">{value}</p>}
    </div>
  );
}

function BookingsTab({ client: c }: { client: ClientDetail }) {
  return (
    <div className="space-y-6">
      <InlineAlert tone="info" icon={<CalendarPlus className="h-5 w-5" />}>
        To book this client into a session, open the session in the schedule and use <span className="font-semibold">Add participant</span>.
      </InlineAlert>
      <Section title="Upcoming">
        <BookingRows rows={c.upcomingBookings.map((b) => ({ ...b, status: 'BOOKED', visitReturned: false }))} />
      </Section>
      <Section title="Recent">
        <BookingRows rows={c.recentBookings} />
      </Section>
    </div>
  );
}

function BookingRows({ rows }: { rows: Array<{ id: string; sessionId: string; startsAt: string; title: string; teacherName: string | null; kind: string; status: string; visitReturned: boolean }> }) {
  if (!rows.length) return <p className="text-sm text-muted">Nothing here.</p>;
  return (
    <Card padded={false} className="divide-y divide-line/70">
      {rows.map((b) => (
        <Link key={b.id} href={`/admin/sessions/${b.sessionId}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-brand-50/40">
          <span>
            <span className="font-semibold">
              {fmt.weekdayDate(b.startsAt)}, {fmt.time(b.startsAt)}
            </span>{' '}
            · {b.title}
            {b.teacherName ? ` · ${b.teacherName}` : ''}
          </span>
          <span className="flex items-center gap-2">
            {b.kind === 'TRIAL' && <Badge tone="zest">Trial</Badge>}
            {b.visitReturned && <span className="text-xs text-muted">visit returned</span>}
            <StatusBadge status={b.status} />
          </span>
        </Link>
      ))}
    </Card>
  );
}

function MembershipsTab({ client: c }: { client: ClientDetail }) {
  const canManage = useCan('memberships.manage');
  const [granting, setGranting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" leftIcon={<Gift className="h-4 w-4" />} onClick={() => setGranting(true)}>
            Grant membership
          </Button>
        </div>
      )}
      {c.memberships.length === 0 ? (
        <EmptyState icon={<Ticket className="h-7 w-7" />} title="No memberships yet" description="Create a payment request to sell one." />
      ) : (
        <Card padded={false} className="divide-y divide-line/70">
          {c.memberships.map((m) => (
            <button key={m.id} type="button" onClick={() => setOpenId(m.id)} className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left text-sm hover:bg-brand-50/40">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {m.planName} {m.isRenewal && <span className="text-xs font-medium text-muted">· renewal</span>}
                </p>
                <p className="text-muted">
                  {fmt.date(m.startsAt)} – {fmt.date(m.expiresAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">
                  {m.visitsRemaining} / {m.visitsCredited} left
                </p>
                <p className="text-xs text-muted">{fmt.money(m.price)}</p>
              </div>
              <StatusBadge status={m.status} />
            </button>
          ))}
        </Card>
      )}
      <GrantMembershipDrawer open={granting} onOpenChange={setGranting} clientId={c.profile.id} clientName={c.profile.fullName} />
      <MembershipDrawer membershipId={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}

function PaymentsTab({ client: c }: { client: ClientDetail }) {
  const canPay = useCan('payments.manage');
  const [confirming, setConfirming] = useState<ClientDetail['payments'][number] | null>(null);
  if (!c.payments.length) return <EmptyState icon={<CreditCard className="h-7 w-7" />} title="No payments yet" />;
  return (
    <Card padded={false} className="divide-y divide-line/70">
      {c.payments.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{p.description ?? 'Payment'}</p>
            <p className="text-muted">
              {fmt.dateTime(p.paidAt ?? p.createdAt)} · {p.method}
            </p>
          </div>
          <p className="font-display font-semibold">{fmt.money(p.amount)}</p>
          <StatusBadge status={p.status} />
          {canPay && p.status === 'PENDING' && (
            <Button size="xs" onClick={() => setConfirming(p)}>
              Confirm
            </Button>
          )}
          <Link href={`/admin/payments?id=${p.id}`} className="text-xs font-semibold text-brand-700">
            Open
          </Link>
        </div>
      ))}
      {confirming && <ConfirmPaymentDialog payment={{ id: confirming.id, amount: confirming.amount, description: confirming.description, reference: null }} open onOpenChange={(o) => !o && setConfirming(null)} />}
    </Card>
  );
}

function ActivityTab({ client: c }: { client: ClientDetail }) {
  const timeline = useQuery({
    queryKey: ['admin', 'client', c.profile.id, 'timeline'],
    queryFn: () => call(api.GET('/api/admin/clients/{id}/timeline', { params: { path: { id: c.profile.id }, query: { limit: 100 } } })),
  });
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section title="Timeline">
        <NoteComposer clientId={c.profile.id} />
        <Card padded={false} className="divide-y divide-line/70">
          {timeline.isLoading ? (
            <Skeleton className="m-5 h-24" />
          ) : timeline.data?.length ? (
            timeline.data.map((a) => (
              <div key={a.id} className="px-5 py-3 text-sm">
                <p className={a.type === 'note' ? 'whitespace-pre-line' : 'font-medium'}>{a.title}</p>
                <p className="text-xs text-muted">
                  {fmt.dateTime(a.createdAt)}
                  {a.actorLabel ? ` · ${a.actorLabel}` : ''}
                </p>
              </div>
            ))
          ) : (
            <p className="px-5 py-4 text-sm text-muted">No activity yet.</p>
          )}
        </Card>
      </Section>
      <Section title="Communications">
        <CommunicationLog clientId={c.profile.id} />
      </Section>
    </div>
  );
}

function FeedbackTab({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'feedback', clientId],
    queryFn: () => call(api.GET('/api/admin/feedback', { params: { query: { clientId } } })),
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <EmptyState icon={<MessageSquarePlus className="h-7 w-7" />} title="No feedback yet" description="Teachers leave feedback after sessions." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {data.map((f) => (
        <Card key={f.id} className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{f.teacher?.name ?? 'Teacher'}</p>
            <span className="text-xs text-muted">
              {f.sessionTitle} · {fmt.weekdayDate(f.sessionStartsAt)}
            </span>
          </div>
          {f.comment && <p>“{f.comment}”</p>}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(f.scores)
              .filter(([, v]) => v !== null)
              .map(([k, v]) => (
                <span key={k} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold capitalize text-brand-800">
                  {k} {v}/5
                </span>
              ))}
            {!f.isVisibleToClient && <Badge>hidden from client</Badge>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PrivacyTab({ client: c }: { client: ClientDetail }) {
  const qc = useQueryClient();
  const canManage = useCan('clients.manage');
  const canDelete = useCan('clients.delete');
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [guardianPhone, setGuardianPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);
  const [anonReason, setAnonReason] = useState('');
  const id = c.profile.id;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: adminKeys.client(id) }), qc.invalidateQueries({ queryKey: ['admin', 'clients'] })]);

  const link = useMutation({
    mutationFn: () => call(api.POST('/api/admin/clients/{id}/guardians', { params: { path: { id } }, body: { guardianPhone, relationship: relationship.trim() || undefined } })),
    onSuccess: async () => {
      await refresh();
      setGuardianOpen(false);
      toast.success('Parent / guardian linked.');
    },
  });
  const archive = useMutation({
    mutationFn: () =>
      c.status === 'ARCHIVED'
        ? call(api.POST('/api/admin/clients/{id}/unarchive', { params: { path: { id } } }))
        : call(api.POST('/api/admin/clients/{id}/archive', { params: { path: { id } } })),
    onSuccess: async () => {
      await refresh();
      setArchiveOpen(false);
    },
    onError: toastError,
  });
  const anonymize = useMutation({
    mutationFn: () => call(api.POST('/api/admin/clients/{id}/anonymize', { params: { path: { id } }, body: { reason: anonReason } })),
    onSuccess: async () => {
      await refresh();
      setAnonOpen(false);
      toast.success('Personal data anonymized.');
    },
    onError: toastError,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section
        title="Family"
        action={
          canManage && (
            <Button size="sm" variant="outline" leftIcon={<UserRoundPlus className="h-4 w-4" />} onClick={() => setGuardianOpen(true)}>
              Link parent
            </Button>
          )
        }
      >
        <Card className="space-y-3 text-sm">
          {c.guardians.map((g) => (
            <p key={g.userId}>
              <span className="font-semibold">{g.name}</span> {g.relationship ? `(${g.relationship})` : ''} · {fmt.phone(g.phone)}
            </p>
          ))}
          {c.children.map((ch) => (
            <p key={ch.id}>
              Parent of{' '}
              <Link className="font-semibold text-brand-700" href={`/admin/clients/${ch.id}`}>
                {ch.name}
              </Link>
            </p>
          ))}
          {!c.guardians.length && !c.children.length && <p className="text-muted">No linked family members.</p>}
        </Card>
      </Section>
      <Section title="Consents">
        <Card padded={false} className="divide-y divide-line/70">
          {c.consents.length ? (
            c.consents.map((k, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium">
                  {k.documentType.replace(/_/g, ' ').toLowerCase()} v{k.version}
                </span>
                <span className="text-muted">
                  {fmt.dateTime(k.acceptedAt)} · {k.context.toLowerCase()}
                </span>
              </div>
            ))
          ) : (
            <p className="px-5 py-4 text-sm text-muted">No consents recorded (client created by staff).</p>
          )}
        </Card>
      </Section>
      <Section title="Account actions">
        <Card className="space-y-3">
          {c.deletionRequestedAt && (
            <InlineAlert tone="danger" title="The client asked to delete their data">
              Requested {fmt.dateTime(c.deletionRequestedAt)}. Anonymize the profile to complete the request.
            </InlineAlert>
          )}
          <div className="flex flex-wrap gap-2">
            {canDelete && c.status !== 'ANONYMIZED' && (
              <Button variant="outline" size="sm" leftIcon={c.status === 'ARCHIVED' ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} onClick={() => setArchiveOpen(true)}>
                {c.status === 'ARCHIVED' ? 'Restore client' : 'Archive client'}
              </Button>
            )}
            {canDelete && c.status !== 'ANONYMIZED' && (
              <Button variant="ghost" size="sm" className="text-danger-700" leftIcon={<ShieldX className="h-4 w-4" />} onClick={() => setAnonOpen(true)}>
                Anonymize (GDPR)
              </Button>
            )}
          </div>
        </Card>
      </Section>

      <Modal
        open={guardianOpen}
        onOpenChange={setGuardianOpen}
        title="Link a parent or guardian"
        description="They will be able to book and pay for this client from their own app account."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGuardianOpen(false)}>
              Cancel
            </Button>
            <Button loading={link.isPending} onClick={() => link.mutate()}>
              Link
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Parent's phone" htmlFor="g-phone">
            <PhoneInput id="g-phone" value={guardianPhone} onChange={setGuardianPhone} />
          </Field>
          <Field label="Relationship" htmlFor="g-rel">
            <Input id="g-rel" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Mother, father…" />
          </Field>
          {link.error && <InlineAlert tone="danger">{errorMessage(link.error)}</InlineAlert>}
        </div>
      </Modal>
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={c.status === 'ARCHIVED' ? 'Restore this client?' : 'Archive this client?'}
        description={c.status === 'ARCHIVED' ? 'The client will appear in lists again.' : 'Archived clients are hidden from lists and campaigns. History is kept.'}
        confirmLabel={c.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
        loading={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
      <ConfirmDialog
        open={anonOpen}
        onOpenChange={setAnonOpen}
        title="Anonymize personal data?"
        description="Name, phone, email, birth date, photo and notes are erased permanently. Bookings and payments stay for accounting, without personal data. This cannot be undone."
        confirmLabel="Anonymize"
        tone="danger"
        loading={anonymize.isPending}
        disabled={anonReason.trim().length < 3}
        onConfirm={() => anonymize.mutate()}
      >
        <Textarea placeholder="Reason (e.g. client's deletion request of 1 Oct)" rows={2} value={anonReason} onChange={(e) => setAnonReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}
