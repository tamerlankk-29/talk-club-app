'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Ban, CalendarClock, CheckCheck, Copy, MapPin, MessageSquareQuote, MoreHorizontal, Pencil, Trash2, UserPlus, Users, Video } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ClientPicker, type PickedClient } from '@/components/admin/client-picker';
import { FeedbackDialog } from '@/components/admin/feedback-dialog';
import { SessionFormDrawer } from '@/components/admin/session-form';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState, ErrorState, InlineAlert, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Card, Section } from '@/components/ui/layout';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { clubNow, fmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { scheduleMessages } from '@/lib/i18n/messages/admin/schedule';

type Detail = S<'AdminSessionDetailDto'>;
type Participant = S<'ParticipantDto'>;
type AttendanceStatus = S<'AttendanceStatus'>;

const ATTENDANCE: Array<{ value: AttendanceStatus; active: string }> = [
  { value: 'PRESENT', active: 'bg-success-600 text-white border-success-600' },
  { value: 'LATE', active: 'bg-warning-600 text-white border-warning-600' },
  { value: 'ABSENT', active: 'bg-danger-600 text-white border-danger-600' },
];

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: adminKeys.session(id), queryFn: () => call(api.GET('/api/admin/sessions/{id}', { params: { path: { id } } })) });
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data) return <Skeleton className="h-[500px] w-full rounded-3xl" />;
  return <SessionView detail={query.data} />;
}

function useInvalidateSession(id: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: adminKeys.session(id) }),
      qc.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'client'] }),
    ]);
}

function SessionView({ detail }: { detail: Detail }) {
  const tr = useT(scheduleMessages);
  const s = detail.session;
  const canSchedule = useCan('schedule.manage');
  const canBook = useCan('bookings.manage');
  const canAttend = useCan('attendance.manage');
  const invalidate = useInvalidateSession(s.id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const started = new Date(s.startsAt).getTime() <= Date.now();
  const cancelled = s.status === 'CANCELLED';
  const active = detail.participants.filter((p) => p.status !== 'CANCELLED' && p.status !== 'LATE_CANCELLED');
  const unmarked = active.filter((p) => !p.attendance).length;

  const allPresent = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/admin/sessions/{id}/attendance', {
          params: { path: { id: s.id } },
          body: { items: active.filter((p) => !p.attendance).map((p) => ({ bookingId: p.bookingId, status: 'PRESENT' as const })) },
        }),
      ),
    onSuccess: async (r) => {
      await invalidate();
      toast.success(tr.markedPresent(r.length));
    },
    onError: toastError,
  });

  const sessionForEdit: S<'SessionAdminDto'> = { ...s, isDetached: detail.isDetached, cancelReason: detail.cancelReason, onlineUrl: detail.onlineUrl, attendanceFinalizedAt: detail.attendanceFinalizedAt, warnings: [] };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/admin/schedule?view=day&date=${s.localDate}`} className="text-sm font-semibold text-brand-700">
              ← {fmt.localDate(s.localDate)}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold">{s.title}</h1>
              <StatusBadge status={s.status} />
              {detail.isDetached && <Badge>{tr.editedTemplate}</Badge>}
            </div>
            {s.topic && <p className="mt-1 text-sm text-muted">{tr.topicLabel} {s.topic}</p>}
          </div>
          {canSchedule && !cancelled && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                {tr.edit}
              </Button>
              <Button variant="outline" size="sm" leftIcon={<Copy className="h-4 w-4" />} onClick={() => setDuplicating(true)}>
                {tr.repeat}
              </Button>
              {!started && (
                <Button variant="ghost" size="sm" className="text-danger-700" leftIcon={<Ban className="h-4 w-4" />} onClick={() => setCancelling(true)}>
                  {tr.cancelSession2}
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Info icon={<CalendarClock className="h-4 w-4" />} label={tr.time} value={`${s.startTime}–${s.endTime} (${tr.minutesShort(s.durationMinutes)})`} />
          <Info icon={<Users className="h-4 w-4" />} label={tr.teacher} value={s.teacher?.name ?? tr.notAssigned} />
          <Info
            icon={s.format === 'ONLINE' ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
            label={s.format === 'ONLINE' ? tr.online : tr.room}
            value={s.format === 'ONLINE' ? (detail.onlineUrl ? <a className="text-brand-700 underline" href={detail.onlineUrl} target="_blank" rel="noreferrer">{tr.meetingLink}</a> : tr.noLinkYet) : (s.room?.name ?? tr.noRoom)}
          />
          <Info icon={<Users className="h-4 w-4" />} label={tr.seats} value={`${tr.bookedOf(s.booked, s.capacity)} · ${s.levelLabel}`} />
        </div>
        {cancelled && detail.cancelReason && <InlineAlert tone="warning" title={tr.cancelled}>{detail.cancelReason}</InlineAlert>}
        {s.bookingClosed && !cancelled && <InlineAlert tone="info">{tr.onlineBookingClosedSession}</InlineAlert>}
      </Card>

      <Section
        title={tr.participantsCount(active.length, s.capacity)}
        action={
          <div className="flex gap-2">
            {canAttend && started && unmarked > 0 && !cancelled && (
              <Button size="sm" variant="secondary" leftIcon={<CheckCheck className="h-4 w-4" />} loading={allPresent.isPending} onClick={() => allPresent.mutate()}>
                {tr.markNPresent(unmarked)}
              </Button>
            )}
            {canBook && !cancelled && (
              <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>
                {tr.addParticipant}
              </Button>
            )}
          </div>
        }
      >
        {active.length === 0 ? (
          <EmptyState icon={<Users className="h-7 w-7" />} title={tr.noParticipantsYet} />
        ) : (
          <Card padded={false} className="divide-y divide-line/70">
            {active.map((p) => (
              <ParticipantRow key={p.bookingId} p={p} sessionId={s.id} started={started} cancelled={cancelled} />
            ))}
          </Card>
        )}
      </Section>

      {detail.waitlist.length > 0 && (
        <Section title={tr.waitlistCount(detail.waitlist.length)}>
          <Card padded={false} className="divide-y divide-line/70">
            {detail.waitlist.map((w) => (
              <WaitlistRow key={w.entryId} entry={w} sessionId={s.id} />
            ))}
          </Card>
        </Section>
      )}

      {detail.cancelled.length > 0 && (
        <Section title={tr.cancelledBookings}>
          <Card padded={false} className="divide-y divide-line/70">
            {detail.cancelled.map((p) => (
              <div key={p.bookingId} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <Link href={`/admin/clients/${p.client.id}`} className="font-semibold hover:text-brand-700">
                  {p.client.name}
                </Link>
                <StatusBadge status={p.status} />
                <span className="text-muted">
                  {p.cancelledAt ? fmt.dateTime(p.cancelledAt) : ''} · {p.visitReturned ? tr.visitReturned : tr.visitUsed}
                  {p.cancelReason ? ` · ${p.cancelReason}` : ''}
                </span>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <SessionFormDrawer open={editing} onOpenChange={setEditing} session={sessionForEdit} onSaved={() => void invalidate()} />
      <AddParticipantDialog open={adding} onOpenChange={setAdding} sessionId={s.id} full={s.available <= 0} />
      <DuplicateDialog open={duplicating} onOpenChange={setDuplicating} sessionId={s.id} startTime={s.startTime} weekday={s.weekday} />
      <CancelSessionDialog open={cancelling} onOpenChange={setCancelling} sessionId={s.id} booked={active.length} waitlist={detail.waitlist.length} />
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-canvas p-3">
      <span className="mt-0.5 text-brand-700">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate font-medium">{value}</p>
      </div>
    </div>
  );
}

function ParticipantRow({ p, sessionId, started, cancelled }: { p: Participant; sessionId: string; started: boolean; cancelled: boolean }) {
  const tr = useT(scheduleMessages);
  const canAttend = useCan('attendance.manage');
  const canBook = useCan('bookings.manage');
  const canFeedback = useCan('feedback.write');
  const invalidate = useInvalidateSession(sessionId);
  const [dialog, setDialog] = useState<'cancel' | 'move' | 'feedback' | null>(null);
  const mark = useMutation({
    mutationFn: (status: AttendanceStatus) => call(api.POST('/api/admin/bookings/{id}/attendance', { params: { path: { id: p.bookingId } }, body: { status } })),
    onSuccess: () => invalidate(),
    onError: toastError,
  });
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <Avatar name={p.client.name} src={p.client.photoUrl} size="sm" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/admin/clients/${p.client.id}`} className="font-semibold hover:text-brand-700">
            {p.client.name}
          </Link>
          {p.kind === 'TRIAL' && <Badge tone="zest">{tr.trial}</Badge>}
          {p.isFirstVisit && <Badge tone="brand">{tr.firstVisit}</Badge>}
          {p.capacityOverride && <Badge tone="warning">{tr.overCapacity}</Badge>}
          {p.hasFeedback && <Badge tone="success">{tr.feedback}</Badge>}
        </div>
        <p className="text-xs text-muted">
          {fmt.phone(p.client.phone)} · {p.client.levelName ?? tr.levelNotSet} ·{' '}
          {p.membershipName ? tr.membershipLeft(p.membershipName, p.membershipVisitsRemaining ?? 0) : p.kind === 'TRIAL' ? tr.trial2 : tr.noMembership} ·{' '}
          {tr.bookedVia(fmt.dateShort(p.bookedAt), tr.bookingSources[p.source] ?? p.source.toLowerCase())}
        </p>
        {p.notes && <p className="text-xs text-warning-700">{p.notes}</p>}
      </div>
      {started && !cancelled ? (
        <div className="flex gap-1" role="group" aria-label={tr.attendanceFor(p.client.name)}>
          {ATTENDANCE.map((a) => (
            <button
              key={a.value}
              type="button"
              disabled={!canAttend || mark.isPending}
              onClick={() => mark.mutate(a.value)}
              aria-pressed={p.attendance?.status === a.value}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60',
                p.attendance?.status === a.value ? a.active : 'border-line bg-white text-ink hover:border-brand-300',
              )}
            >
              {tr.attendanceStatus[a.value]}
            </button>
          ))}
        </div>
      ) : (
        <StatusBadge status={p.status} />
      )}
      {(canBook || canFeedback) && !cancelled && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="rounded-xl p-2 text-muted hover:bg-brand-50" aria-label={tr.moreActions}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" className="z-50 min-w-48 rounded-2xl border border-line bg-white p-1.5 shadow-float">
              {canFeedback && started && (
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-brand-50" onSelect={() => setDialog('feedback')}>
                  <MessageSquareQuote className="h-4 w-4" /> Write feedback
                </DropdownMenu.Item>
              )}
              {canBook && !started && (
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-brand-50" onSelect={() => setDialog('move')}>
                  <ArrowLeftRight className="h-4 w-4" /> Move to another session
                </DropdownMenu.Item>
              )}
              {canBook && (
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-danger-700 outline-none data-[highlighted]:bg-danger-50" onSelect={() => setDialog('cancel')}>
                  <Trash2 className="h-4 w-4" /> Cancel booking
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
      {dialog === 'cancel' && <CancelBookingDialog p={p} sessionId={sessionId} onClose={() => setDialog(null)} />}
      {dialog === 'move' && <MoveBookingDialog p={p} sessionId={sessionId} onClose={() => setDialog(null)} />}
      {dialog === 'feedback' && <FeedbackDialog bookingId={p.bookingId} clientName={p.client.firstName} onClose={() => setDialog(null)} onSaved={() => void invalidate()} />}
    </div>
  );
}

function CancelBookingDialog({ p, sessionId, onClose }: { p: Participant; sessionId: string; onClose: () => void }) {
  const tr = useT(scheduleMessages);
  const canOverride = useCan('bookings.override');
  const invalidate = useInvalidateSession(sessionId);
  const [reason, setReason] = useState('');
  const [waive, setWaive] = useState(false);
  const [notify, setNotify] = useState(true);
  const run = useMutation({
    mutationFn: () => call(api.POST('/api/admin/bookings/{id}/cancel', { params: { path: { id: p.bookingId } }, body: { reason, waivePenalty: waive, notifyClient: notify } })),
    onSuccess: async (r) => {
      await invalidate();
      toast.success(r.visitReturned ? tr.bookingCancelledVisitReturned : tr.bookingCancelledLateCancellation);
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr.cancelBookingOf(p.client.firstName)}
      description={tr.beforeFreeCancellationDeadline}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.back}
          </Button>
          <Button variant="danger" loading={run.isPending} disabled={reason.trim().length < 3} onClick={() => run.mutate()}>
            {tr.cancelBooking}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr.reason} required htmlFor="cb-reason">
          <Textarea id="cb-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr.eGClientCalled} autoFocus />
        </Field>
        {canOverride && <Checkbox checked={waive} onChange={setWaive} label={tr.returnVisitEvenIf} />}
        <Checkbox checked={notify} onChange={setNotify} label={tr.notifyClient} />
        {run.error && <InlineAlert tone="danger">{errorMessage(run.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

function MoveBookingDialog({ p, sessionId, onClose }: { p: Participant; sessionId: string; onClose: () => void }) {
  const tr = useT(scheduleMessages);
  const canOverride = useCan('bookings.override');
  const invalidate = useInvalidateSession(sessionId);
  const [target, setTarget] = useState('');
  const [override, setOverride] = useState(false);
  const from = clubNow().toUTC().toISO()!;
  const to = clubNow().plus({ days: 21 }).toUTC().toISO()!;
  const { data: sessions } = useQuery({
    queryKey: ['admin', 'sessions', 'move-targets', from.slice(0, 13)],
    queryFn: () => call(api.GET('/api/admin/sessions', { params: { query: { from, to } } })),
  });
  const run = useMutation({
    mutationFn: () => call(api.POST('/api/admin/bookings/{id}/move', { params: { path: { id: p.bookingId } }, body: { targetSessionId: target, overrideCapacity: override, overrideRules: override } })),
    onSuccess: async () => {
      await invalidate();
      toast.success(tr.bookingMovedClientWas);
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr.moveClientTitle(p.client.firstName)}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.back}
          </Button>
          <Button loading={run.isPending} disabled={!target} onClick={() => run.mutate()}>
            {tr.moveBooking}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr.newSession} htmlFor="mv-target">
          <Select id="mv-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{tr.choose}</option>
            {sessions
              ?.filter((x) => x.id !== sessionId && x.status !== 'CANCELLED')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {fmt.weekdayDate(x.startsAt)} {x.startTime} · {x.title} · {x.teacher?.name ?? '—'} · {x.booked}/{x.capacity}
                </option>
              ))}
          </Select>
        </Field>
        {canOverride && <Checkbox checked={override} onChange={setOverride} label={tr.overrideCapacityBookingRules} />}
        {run.error && <InlineAlert tone="danger">{errorMessage(run.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

function WaitlistRow({ entry, sessionId }: { entry: Detail['waitlist'][number]; sessionId: string }) {
  const tr = useT(scheduleMessages);
  const canBook = useCan('bookings.manage');
  const invalidate = useInvalidateSession(sessionId);
  const remove = useMutation({
    mutationFn: () => call(api.DELETE('/api/admin/waitlist/{id}', { params: { path: { id: entry.entryId } } })),
    onSuccess: () => invalidate(),
    onError: toastError,
  });
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
      <span className="w-6 font-display font-semibold text-muted">#{entry.position}</span>
      <Link href={`/admin/clients/${entry.client.id}`} className="font-semibold hover:text-brand-700">
        {entry.client.name}
      </Link>
      <StatusBadge status={entry.status} />
      {entry.offerExpiresAt && <span className="text-muted">{tr.offerUntil(fmt.time(entry.offerExpiresAt))}</span>}
      <span className="ml-auto text-xs text-muted">{tr.joinedAgo(fmt.relative(entry.createdAt))}</span>
      {canBook && (
        <Button size="xs" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
          {tr.remove}
        </Button>
      )}
    </div>
  );
}

function AddParticipantDialog({ open, onOpenChange, sessionId, full }: { open: boolean; onOpenChange: (o: boolean) => void; sessionId: string; full: boolean }) {
  const tr = useT(scheduleMessages);
  const canOverride = useCan('bookings.override');
  const invalidate = useInvalidateSession(sessionId);
  const [client, setClient] = useState<PickedClient | null>(null);
  const [kind, setKind] = useState<'MEMBERSHIP' | 'TRIAL' | 'COMPLIMENTARY'>('MEMBERSHIP');
  const [overrideCapacity, setOverrideCapacity] = useState(false);
  const [overrideRules, setOverrideRules] = useState(false);
  const [notes, setNotes] = useState('');
  const add = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/admin/sessions/{id}/participants', {
          params: { path: { id: sessionId } },
          body: { clientId: client!.id, kind, overrideCapacity, overrideRules, notes: notes.trim() || undefined },
        }),
      ),
    onSuccess: async (r) => {
      await invalidate();
      toast.success(r.visitsRemaining !== null ? tr.bookedVisitsLeft(r.visitsRemaining) : tr.booked2);
      setClient(null);
      setNotes('');
      onOpenChange(false);
    },
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={tr.addParticipant}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={add.isPending} disabled={!client} onClick={() => add.mutate()}>
            {tr.book}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ClientPicker value={client} onChange={setClient} autoFocus />
        <Field label={tr.bookingType} htmlFor="ap-kind">
          <Select id="ap-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="MEMBERSHIP">{tr.usesMembershipVisit}</option>
            <option value="TRIAL">{tr.trialSession}</option>
            <option value="COMPLIMENTARY">{tr.complimentaryNoVisitUsed}</option>
          </Select>
        </Field>
        {full && <InlineAlert tone="warning">{tr.sessionFull}</InlineAlert>}
        {canOverride && (
          <div className="space-y-2">
            <Checkbox checked={overrideCapacity} onChange={setOverrideCapacity} label={tr.allowOverCapacity} />
            <Checkbox checked={overrideRules} onChange={setOverrideRules} label={tr.skipLevelCategoryBooking} />
          </div>
        )}
        <Field label={tr.note} htmlFor="ap-notes">
          <Input id="ap-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
        {add.error && <InlineAlert tone="danger">{errorMessage(add.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

function DuplicateDialog({ open, onOpenChange, sessionId, startTime, weekday }: { open: boolean; onOpenChange: (o: boolean) => void; sessionId: string; startTime: string; weekday: number }) {
  const tr = useT(scheduleMessages);
  const invalidate = useInvalidateSession(sessionId);
  const [weeks, setWeeks] = useState('4');
  const [time, setTime] = useState(startTime);
  const dates = Array.from({ length: Math.min(26, Math.max(0, Number(weeks) || 0)) }, (_, i) => {
    const base = clubNow().startOf('week').plus({ days: weekday - 1 });
    const first = base <= clubNow().startOf('day') ? base.plus({ weeks: 1 }) : base;
    return first.plus({ weeks: i }).toISODate()!;
  });
  const run = useMutation({
    mutationFn: () => call(api.POST('/api/admin/sessions/{id}/duplicate', { params: { path: { id: sessionId } }, body: { dates, startTime: time } })),
    onSuccess: async (r) => {
      await invalidate();
      toast.success(tr.repeatResult(r.created.length, r.skipped.length, r.skipped.map((x) => `${x.date}: ${x.reason}`).join('; ')));
      onOpenChange(false);
    },
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={tr.repeatSession}
      description={tr.createsCopiesSameWeekday}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={run.isPending} disabled={!dates.length} onClick={() => run.mutate()}>
            {tr.createN(dates.length)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr.nextWeeks} htmlFor="dp-weeks">
            <Input id="dp-weeks" type="number" min={1} max={26} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </Field>
          <Field label={tr.startTime} htmlFor="dp-time">
            <Input id="dp-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted">{dates.map((d) => fmt.dateShort(`${d}T12:00:00Z`)).join(', ')}</p>
        {run.error && <InlineAlert tone="danger">{errorMessage(run.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

function CancelSessionDialog({ open, onOpenChange, sessionId, booked, waitlist }: { open: boolean; onOpenChange: (o: boolean) => void; sessionId: string; booked: number; waitlist: number }) {
  const tr = useT(scheduleMessages);
  const invalidate = useInvalidateSession(sessionId);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const run = useMutation({
    mutationFn: () => call(api.POST('/api/admin/sessions/{id}/cancel', { params: { path: { id: sessionId } }, body: { reason, notifyClients: notify } })),
    onSuccess: async (r) => {
      await invalidate();
      toast.success(tr.sessionCancelledResult(r.cancelledBookings, r.visitsReturned));
      onOpenChange(false);
    },
    onError: toastError,
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tr.cancelSession}
      description={tr.cancelSessionWarning(booked, waitlist)}
      confirmLabel={tr.cancelSession2}
      cancelLabel={tr.keep}
      tone="danger"
      loading={run.isPending}
      disabled={reason.trim().length < 3}
      onConfirm={() => run.mutate()}
    >
      <div className="space-y-3">
        <Textarea rows={2} placeholder={tr.reasonShownClientsE} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Checkbox checked={notify} onChange={setNotify} label={tr.notifyBookedWaitlistedClients} />
      </div>
    </ConfirmDialog>
  );
}
