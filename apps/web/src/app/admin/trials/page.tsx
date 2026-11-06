'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, Phone } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, InlineAlert, SkeletonList, StatusBadge } from '@/components/ui/feedback';
import { Checkbox, Field, Select, Textarea } from '@/components/ui/inputs';
import { Card, Tabs, TabsList, TabsTrigger } from '@/components/ui/layout';
import { Modal } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useUrlState } from '@/lib/admin-queries';
import { clubNow, fmt } from '@/lib/format';
import { TIME_OF_DAY_LABELS, WEEKDAYS_SHORT } from '@/lib/utils';

type Trial = S<'TrialDto'>;
type TrialStatus = S<'TrialStatus'>;

function Trials() {
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
    <AdminPage title="Trial sessions" description="Requests from the website and app. Schedule them into a session, then record attendance and the outcome.">
      <Tabs value={status} onValueChange={(v) => url.set({ status: v === 'REQUESTED' ? null : v })}>
        <TabsList className="max-w-2xl">
          <TabsTrigger value="REQUESTED">Requested</TabsTrigger>
          <TabsTrigger value="SCHEDULED">Scheduled</TabsTrigger>
          <TabsTrigger value="ATTENDED">Attended</TabsTrigger>
          <TabsTrigger value="NO_SHOW">No-show</TabsTrigger>
          <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>
      {query.isLoading ? (
        <SkeletonList count={4} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState icon={<CalendarCheck2 className="h-7 w-7" />} title="Nothing here" />
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
  const qc = useQueryClient();
  const attendance = useMutation({
    mutationFn: (attended: boolean) => call(api.POST('/api/admin/trials/{id}/attendance', { params: { path: { id: t.id } }, body: { attended } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'trials'] });
      toast.success('Attendance saved.');
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
          {t.outcome !== 'PENDING' && <Badge tone={t.outcome === 'PURCHASED' ? 'success' : t.outcome === 'NOT_INTERESTED' ? 'danger' : 'info'}>{t.outcome.toLowerCase().replace('_', ' ')}</Badge>}
        </div>
      </div>
      <p className="text-sm text-muted">
        {t.level?.name ?? 'Level unknown'} · {t.preferredDays.map((d) => WEEKDAYS_SHORT[d]).join(', ') || 'any day'} · {t.preferredTimes.map((x) => TIME_OF_DAY_LABELS[x]).join(', ') || 'any time'} · via {t.source.toLowerCase()}
      </p>
      {t.comment && <p className="rounded-2xl bg-canvas p-3 text-sm">“{t.comment}”</p>}
      {t.session && (
        <Link href={`/admin/sessions/${t.session.id}`} className="block rounded-2xl bg-brand-50 p-3 text-sm text-brand-900">
          <span className="font-semibold">{fmt.weekdayDate(t.session.startsAt)}, {fmt.time(t.session.startsAt)}</span> · {t.session.title}
          {t.session.teacherName ? ` · ${t.session.teacherName}` : ''}
        </Link>
      )}
      <p className="text-xs text-muted">
        Requested {fmt.relative(t.createdAt)} · {fmt.money(t.price)}
        {t.payment ? ` · payment ${t.payment.status.toLowerCase()}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {t.status === 'REQUESTED' && (
          <Button size="xs" onClick={onSchedule}>
            Schedule
          </Button>
        )}
        {t.status === 'SCHEDULED' && (
          <>
            <Button size="xs" variant="secondary" onClick={onSchedule}>
              Reschedule
            </Button>
            {past && (
              <>
                <Button size="xs" loading={attendance.isPending && attendance.variables} onClick={() => attendance.mutate(true)}>
                  Attended
                </Button>
                <Button size="xs" variant="outline" loading={attendance.isPending && !attendance.variables} onClick={() => attendance.mutate(false)}>
                  No-show
                </Button>
              </>
            )}
          </>
        )}
        {(t.status === 'ATTENDED' || t.status === 'NO_SHOW') && (
          <Button size="xs" variant="secondary" onClick={onOutcome}>
            Record outcome
          </Button>
        )}
        {(t.status === 'REQUESTED' || t.status === 'SCHEDULED') && (
          <Button size="xs" variant="ghost" className="text-danger-700" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}

function ScheduleDialog({ trial, onClose }: { trial: Trial; onClose: () => void }) {
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
      toast.success('Trial scheduled. The client was notified.');
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Schedule ${trial.name}'s trial`}
      description={`Prefers ${trial.preferredDays.map((d) => WEEKDAYS_SHORT[d]).join(', ') || 'any day'}, ${trial.preferredTimes.map((x) => TIME_OF_DAY_LABELS[x]).join(', ') || 'any time'} · ${trial.level?.name ?? 'level unknown'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={run.isPending} disabled={!sessionId} onClick={() => run.mutate()}>
            Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Session" htmlFor="tr-session">
          <Select id="tr-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((s) => (
              <option key={s.id} value={s.id} disabled={s.available <= 0 && !override}>
                {s.localDate} {s.startTime} · {s.title} · {s.levelLabel} · {s.teacher?.name ?? '—'} · {s.available} free
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox checked={override} onChange={setOverride} label="Allow full sessions (over capacity)" />
        {run.error && <InlineAlert tone="danger">{errorMessage(run.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

function OutcomeDialog({ trial, onClose }: { trial: Trial; onClose: () => void }) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<S<'TrialOutcome'>>(trial.outcome === 'PENDING' ? 'INTERESTED' : trial.outcome);
  const [notes, setNotes] = useState(trial.notes ?? '');
  const run = useMutation({
    mutationFn: () => call(api.POST('/api/admin/trials/{id}/outcome', { params: { path: { id: trial.id } }, body: { outcome, notes: notes.trim() || undefined } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'trials'] });
      toast.success('Outcome saved.');
      onClose();
    },
    onError: toastError,
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Trial outcome"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={run.isPending} onClick={() => run.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Outcome" htmlFor="to-outcome">
          <Select id="to-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as S<'TrialOutcome'>)}>
            <option value="INTERESTED">Interested — follow up</option>
            <option value="PURCHASED">Bought a membership</option>
            <option value="NOT_INTERESTED">Not interested</option>
            <option value="PENDING">Undecided</option>
          </Select>
        </Field>
        <Field label="Notes" htmlFor="to-notes">
          <Textarea id="to-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function CancelDialog({ trial, onClose }: { trial: Trial; onClose: () => void }) {
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
      title="Cancel trial?"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" loading={run.isPending} disabled={reason.trim().length < 3} onClick={() => run.mutate()}>
            Cancel trial
          </Button>
        </>
      }
    >
      <Textarea rows={2} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
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
