'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, Phone } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, InlineAlert, SkeletonList, StatusBadge, statusLabel } from '@/components/ui/feedback';
import { Checkbox, Field, Select, Textarea } from '@/components/ui/inputs';
import { Card, Tabs, TabsList, TabsTrigger } from '@/components/ui/layout';
import { Modal } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useUrlState } from '@/lib/admin-queries';
import { clubNow, fmt } from '@/lib/format';
import { TIME_OF_DAY_LABELS, WEEKDAYS_SHORT } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { crmMessages } from '@/lib/i18n/messages/admin/crm';

type Trial = S<'TrialDto'>;
type TrialStatus = S<'TrialStatus'>;

function Trials() {
  const tr = useT(crmMessages);
  const url = useUrlState();
  const status = (url.get('status') || 'REQUESTED') as TrialStatus;
  const query = useQuery({
    queryKey: ['admin', 'trials', status],
    queryFn: () => call(api.GET('/api/admin/trials', { params: { query: { status } } })),
  });
  const [scheduling, setScheduling] = useState<Trial | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<Trial | null>(null);
  const [cancelling, setCancelling] = useState<Trial | null>(null);

  return (
    <AdminPage title={tr.trialSessions} description={tr.requestsWebsiteAppSchedule}>
      <Tabs value={status} onValueChange={(v) => url.set({ status: v === 'REQUESTED' ? null : v })}>
        <TabsList className="max-w-2xl">
          <TabsTrigger value="REQUESTED">{tr.requested}</TabsTrigger>
          <TabsTrigger value="SCHEDULED">{tr.scheduled}</TabsTrigger>
          <TabsTrigger value="ATTENDED">{tr.attended}</TabsTrigger>
          <TabsTrigger value="NO_SHOW">{tr.noShow}</TabsTrigger>
          <TabsTrigger value="CANCELLED">{tr.cancelled}</TabsTrigger>
        </TabsList>
      </Tabs>
      {query.isLoading ? (
        <SkeletonList count={4} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState icon={<CalendarCheck2 className="h-7 w-7" />} title={tr.nothingHere} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {query.data.map((t) => (
            <TrialCard key={t.id} trial={t} onSchedule={() => setScheduling(t)} onOutcome={() => setOutcomeFor(t)} onCancel={() => setCancelling(t)} />
          ))}
        </div>
      )}
      {scheduling && <ScheduleDialog trial={scheduling} onClose={() => setScheduling(null)} />}
      {outcomeFor && <OutcomeDialog trial={outcomeFor} onClose={() => setOutcomeFor(null)} />}
      {cancelling && <CancelDialog trial={cancelling} onClose={() => setCancelling(null)} />}
    </AdminPage>
  );
}

function TrialCard({ trial: t, onSchedule, onOutcome, onCancel }: { trial: Trial; onSchedule: () => void; onOutcome: () => void; onCancel: () => void }) {
  const tr = useT(crmMessages);
  const qc = useQueryClient();
  const attendance = useMutation({
    mutationFn: (attended: boolean) => call(api.POST('/api/admin/trials/{id}/attendance', { params: { path: { id: t.id } }, body: { attended } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'trials'] });
      toast.success(tr.attendanceSaved);
    },
    onError: toastError,
  });
  const past = t.session && new Date(t.session.startsAt).getTime() < Date.now();
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {t.clientId ? (
              <Link href={`/admin/clients/${t.clientId}`} className="hover:text-brand-700">
                {t.clientName ?? t.name}
              </Link>
            ) : (
              t.name
            )}
          </p>
          <a href={`tel:${t.phone}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand-700">
            <Phone className="h-3.5 w-3.5" /> {fmt.phone(t.phone)}
          </a>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <StatusBadge status={t.status} />
          {t.outcome !== 'PENDING' && <Badge tone={t.outcome === 'PURCHASED' ? 'success' : t.outcome === 'NOT_INTERESTED' ? 'danger' : 'info'}>{tr.outcomes[t.outcome] ?? t.outcome}</Badge>}
        </div>
      </div>
      <p className="text-sm text-muted">
        {t.level?.name ?? tr.levelUnknown} · {t.preferredDays.map((d) => WEEKDAYS_SHORT[d]).join(', ') || tr.anyDay} · {t.preferredTimes.map((x) => TIME_OF_DAY_LABELS[x]).join(', ') || tr.anyTime} · {tr.via(t.source.toLowerCase())}
      </p>
      {t.comment && <p className="rounded-2xl bg-canvas p-3 text-sm">“{t.comment}”</p>}
      {t.session && (
        <Link href={`/admin/sessions/${t.session.id}`} className="block rounded-2xl bg-brand-50 p-3 text-sm text-brand-900">
          <span className="font-semibold">{fmt.weekdayDate(t.session.startsAt)}, {fmt.time(t.session.startsAt)}</span> · {t.session.title}
          {t.session.teacherName ? ` · ${t.session.teacherName}` : ''}
        </Link>
      )}
      <p className="text-xs text-muted">
        {tr.requestedAgo(fmt.relative(t.createdAt))} · {fmt.money(t.price)}
        {t.payment ? tr.paymentStatus(statusLabel(t.payment.status).toLowerCase()) : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {t.status === 'REQUESTED' && (
          <Button size="xs" onClick={onSchedule}>
            {tr.schedule}
          </Button>
        )}
        {t.status === 'SCHEDULED' && (
          <>
            <Button size="xs" variant="secondary" onClick={onSchedule}>
              {tr.reschedule}
            </Button>
            {past && (
              <>
                <Button size="xs" loading={attendance.isPending && attendance.variables} onClick={() => attendance.mutate(true)}>
                  {tr.attended}
                </Button>
                <Button size="xs" variant="outline" loading={attendance.isPending && !attendance.variables} onClick={() => attendance.mutate(false)}>
                  {tr.noShow}
                </Button>
              </>
            )}
          </>
        )}
        {(t.status === 'ATTENDED' || t.status === 'NO_SHOW') && (
          <Button size="xs" variant="secondary" onClick={onOutcome}>
            {tr.recordOutcome}
          </Button>
        )}
        {(t.status === 'REQUESTED' || t.status === 'SCHEDULED') && (
          <Button size="xs" variant="ghost" className="text-danger-700" onClick={onCancel}>
            {tr.cancel}
          </Button>
        )}
      </div>
    </Card>
  );
}

function ScheduleDialog({ trial, onClose }: { trial: Trial; onClose: () => void }) {
  const tr = useT(crmMessages);
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState('');
  const [override, setOverride] = useState(false);
  const from = clubNow().toUTC().toISO()!;
  const to = clubNow().plus({ days: 14 }).toUTC().toISO()!;
  const { data: sessions } = useQuery({
    queryKey: ['admin', 'sessions', 'trial-targets', from.slice(0, 13)],
    queryFn: () => call(api.GET('/api/admin/sessions', { params: { query: { from, to } } })),
  });
  const options = (sessions ?? []).filter((s) => s.status !== 'CANCELLED' && s.trialsAllowed);
  const run = useMutation({
    mutationFn: () => call(api.POST('/api/admin/trials/{id}/schedule', { params: { path: { id: trial.id } }, body: { sessionId, overrideCapacity: override } })),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'trials'] }), qc.invalidateQueries({ queryKey: ['admin', 'sessions'] })]);
      toast.success(tr.trialScheduledClientWas);
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr.scheduleTrialOf(trial.name)}
      description={tr.prefers(trial.preferredDays.map((d) => WEEKDAYS_SHORT[d]).join(', ') || tr.anyDay, trial.preferredTimes.map((x) => TIME_OF_DAY_LABELS[x]).join(', ') || tr.anyTime, trial.level?.name ?? tr.levelUnknownLower)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.cancel}
          </Button>
          <Button loading={run.isPending} disabled={!sessionId} onClick={() => run.mutate()}>
            {tr.schedule}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr.session} htmlFor="tr-session">
          <Select id="tr-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">{tr.choose}</option>
            {options.map((s) => (
              <option key={s.id} value={s.id} disabled={s.available <= 0 && !override}>
                {s.localDate} {s.startTime} · {s.title} · {s.levelLabel} · {s.teacher?.name ?? '—'} · {tr.freeSeats(s.available)}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox checked={override} onChange={setOverride} label={tr.allowFullSessionsOver} />
        {run.error && <InlineAlert tone="danger">{errorMessage(run.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

function OutcomeDialog({ trial, onClose }: { trial: Trial; onClose: () => void }) {
  const tr = useT(crmMessages);
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<S<'TrialOutcome'>>(trial.outcome === 'PENDING' ? 'INTERESTED' : trial.outcome);
  const [notes, setNotes] = useState(trial.notes ?? '');
  const run = useMutation({
    mutationFn: () => call(api.POST('/api/admin/trials/{id}/outcome', { params: { path: { id: trial.id } }, body: { outcome, notes: notes.trim() || undefined } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'trials'] });
      toast.success(tr.outcomeSaved);
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr.trialOutcome}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.cancel}
          </Button>
          <Button loading={run.isPending} onClick={() => run.mutate()}>
            {tr.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr.outcome} htmlFor="to-outcome">
          <Select id="to-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as S<'TrialOutcome'>)}>
            <option value="INTERESTED">{tr.interestedFollowUp}</option>
            <option value="PURCHASED">{tr.boughtMembership}</option>
            <option value="NOT_INTERESTED">{tr.notInterested}</option>
            <option value="PENDING">{tr.undecided}</option>
          </Select>
        </Field>
        <Field label={tr.notes} htmlFor="to-notes">
          <Textarea id="to-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function CancelDialog({ trial, onClose }: { trial: Trial; onClose: () => void }) {
  const tr = useT(crmMessages);
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: () => call(api.POST('/api/admin/trials/{id}/cancel', { params: { path: { id: trial.id } }, body: { reason } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'trials'] });
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr.cancelTrial}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.back}
          </Button>
          <Button variant="danger" loading={run.isPending} disabled={reason.trim().length < 3} onClick={() => run.mutate()}>
            {tr.cancelTrial2}
          </Button>
        </>
      }
    >
      <Textarea rows={2} placeholder={tr.reason} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
    </Modal>
  );
}

export default function TrialsPage() {
  return (
    <Suspense>
      <Trials />
    </Suspense>
  );
}
