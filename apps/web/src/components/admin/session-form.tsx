'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Drawer } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorCode, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminGroupTypes, useAdminLevels, useAdminRooms, useAdminTeachers } from '@/lib/admin-queries';
import { useClub } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { scheduleMessages } from '@/lib/i18n/messages/admin/schedule';

type SessionAdmin = S<'SessionAdminDto'>;
type Format = S<'SessionFormat'>;

export interface SessionDraft {
  date?: string;
  startTime?: string;
  roomId?: string;
  teacherId?: string;
}

interface FormState {
  date: string;
  startTime: string;
  durationMinutes: string;
  format: Format;
  roomId: string;
  teacherId: string;
  groupTypeId: string;
  levelMinId: string;
  levelMaxId: string;
  capacity: string;
  title: string;
  topic: string;
  description: string;
  onlineUrl: string;
  trialsAllowed: boolean;
  bookingClosed: boolean;
}

function fromSession(s: SessionAdmin | undefined, draft: SessionDraft | undefined, defaults: { duration: number; capacity: number }): FormState {
  return {
    date: s?.localDate ?? draft?.date ?? '',
    startTime: s?.startTime ?? draft?.startTime ?? '18:30',
    durationMinutes: String(s?.durationMinutes ?? defaults.duration),
    format: (s?.format as Format) ?? 'OFFLINE',
    roomId: s?.room?.id ?? draft?.roomId ?? '',
    teacherId: s?.teacher?.id ?? draft?.teacherId ?? '',
    groupTypeId: s?.groupType?.id ?? '',
    levelMinId: s?.levelMin?.id ?? '',
    levelMaxId: s?.levelMax?.id ?? '',
    capacity: String(s?.capacity ?? defaults.capacity),
    title: s && s.groupType && s.title === s.groupType.name ? '' : (s?.title ?? ''),
    topic: s?.topic ?? '',
    description: s?.description ?? '',
    onlineUrl: s?.onlineUrl ?? '',
    trialsAllowed: s?.trialsAllowed ?? true,
    bookingClosed: s?.bookingClosed ?? false,
  };
}

const CONFLICT_CODES = ['SESSION_ROOM_CONFLICT', 'SESSION_TEACHER_CONFLICT'];

/** Create or edit a single session. Conflicts (room/teacher double-booking) are enforced by the API. */
export function SessionFormDrawer({
  open,
  onOpenChange,
  session,
  draft,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: SessionAdmin;
  draft?: SessionDraft;
  onSaved?: (session: SessionAdmin) => void;
}) {
  const tr = useT(scheduleMessages);
  const qc = useQueryClient();
  const { data: club } = useClub();
  const { data: rooms } = useAdminRooms();
  const { data: teachers } = useAdminTeachers();
  const { data: groupTypes } = useAdminGroupTypes();
  const { data: levels } = useAdminLevels();
  const defaults = { duration: club?.policies.sessionDurationMinutes ?? 90, capacity: club?.policies.groupSize ?? 7 };
  const [form, setForm] = useState<FormState>(() => fromSession(session, draft, defaults));
  const [notifyClients, setNotifyClients] = useState(true);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setForm(fromSession(session, draft, defaults));
  }
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        date: form.date,
        startTime: form.startTime,
        durationMinutes: Number(form.durationMinutes),
        format: form.format,
        roomId: form.format === 'OFFLINE' ? form.roomId || null : null,
        teacherId: form.teacherId || null,
        groupTypeId: form.groupTypeId || null,
        levelMinId: form.levelMinId || null,
        levelMaxId: form.levelMaxId || null,
        capacity: Number(form.capacity),
        title: form.title.trim() || null,
        topic: form.topic.trim() || null,
        description: form.description.trim() || null,
        onlineUrl: form.format === 'ONLINE' ? form.onlineUrl.trim() || null : null,
        trialsAllowed: form.trialsAllowed,
        bookingClosed: form.bookingClosed,
      };
      return session
        ? call(api.PATCH('/api/admin/sessions/{id}', { params: { path: { id: session.id } }, body: { ...body, notifyClients } }))
        : call(api.POST('/api/admin/sessions', { body }));
    },
    onSuccess: async (saved) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'sessions'] }), qc.invalidateQueries({ queryKey: ['admin', 'session'] }), qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] })]);
      if (saved.warnings.length) toast.warning(saved.warnings.join(' '));
      else toast.success(session ? tr.sessionUpdated : tr.sessionCreated);
      onOpenChange(false);
      onSaved?.(saved);
    },
  });
  const errors = fieldErrors(save.error);
  const conflict = CONFLICT_CODES.includes(errorCode(save.error) ?? '');
  const hasBookings = !!session && session.booked > 0;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={session ? tr.editSession : tr.newSession}
      description={session ? `${session.title} · ${session.localDate} ${session.startTime}` : 'One-off session. Use templates for a weekly schedule.'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!form.date || !form.startTime} onClick={() => save.mutate()}>
            {session ? tr.saveChanges : tr.createSession}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={tr.date} required htmlFor="sf-date" error={errors.date}>
            <Input id="sf-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label={tr.start} required htmlFor="sf-time" error={errors.startTime}>
            <Input id="sf-time" type="time" step={300} value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
          <Field label={tr.minutes} htmlFor="sf-dur" error={errors.durationMinutes}>
            <Input id="sf-dur" type="number" min={15} max={480} step={5} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr.format} htmlFor="sf-format">
            <Select id="sf-format" value={form.format} onChange={(e) => set('format', e.target.value as Format)}>
              <option value="OFFLINE">{tr.club}</option>
              <option value="ONLINE">{tr.online}</option>
            </Select>
          </Field>
          {form.format === 'OFFLINE' ? (
            <Field label={tr.room} htmlFor="sf-room" error={errors.roomId}>
              <Select id="sf-room" value={form.roomId} onChange={(e) => set('roomId', e.target.value)}>
                <option value="">{tr.noRoomYet}</option>
                {rooms
                  ?.filter((r) => r.isActive)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({tr.seatsCount(r.capacity)})
                    </option>
                  ))}
              </Select>
            </Field>
          ) : (
            <Field label={tr.onlineLink} htmlFor="sf-url" error={errors.onlineUrl} hint={tr.shownBookedClientsOnly}>
              <Input id="sf-url" type="url" placeholder={tr.httpsMeetGoogleCom} value={form.onlineUrl} onChange={(e) => set('onlineUrl', e.target.value)} />
            </Field>
          )}
          <Field label={tr.teacher} htmlFor="sf-teacher">
            <Select id="sf-teacher" value={form.teacherId} onChange={(e) => set('teacherId', e.target.value)}>
              <option value="">{tr.notAssigned}</option>
              {teachers
                ?.filter((t) => t.isActive || t.id === form.teacherId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={tr.groupType} htmlFor="sf-gt">
            <Select id="sf-gt" value={form.groupTypeId} onChange={(e) => set('groupTypeId', e.target.value)}>
              <option value="">—</option>
              {groupTypes?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.level} htmlFor="sf-lmin">
            <Select id="sf-lmin" value={form.levelMinId} onChange={(e) => set('levelMinId', e.target.value)}>
              <option value="">{tr.any}</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.level2} htmlFor="sf-lmax">
            <Select id="sf-lmax" value={form.levelMaxId} onChange={(e) => set('levelMaxId', e.target.value)}>
              <option value="">{tr.any}</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.capacity} htmlFor="sf-cap" error={errors.capacity} hint={hasBookings ? tr.alreadyBooked(session!.booked) : undefined}>
            <Input id="sf-cap" type="number" min={1} max={50} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
          </Field>
          <Field label={tr.title} htmlFor="sf-title" hint={tr.defaultsGroupTypeName}>
            <Input id="sf-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
          </Field>
        </div>
        <Field label={tr.topic} htmlFor="sf-topic" hint={tr.shownClientsEG}>
          <Input id="sf-topic" value={form.topic} onChange={(e) => set('topic', e.target.value)} maxLength={160} />
        </Field>
        <Field label={tr.description} htmlFor="sf-desc">
          <Textarea id="sf-desc" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
        </Field>
        <div className="space-y-3">
          <Checkbox checked={form.trialsAllowed} onChange={(v) => set('trialsAllowed', v)} label={tr.openTrialSessions} />
          <Checkbox checked={form.bookingClosed} onChange={(v) => set('bookingClosed', v)} label={tr.closeOnlineBooking} description={tr.staffCanStillAdd} />
          {hasBookings && <Checkbox checked={notifyClients} onChange={setNotifyClients} label={tr.notifyBookedClientsAbout} description={tr.sentWhenTimeRoom} />}
        </div>
        {save.error && !Object.keys(errors).length && (
          <InlineAlert tone="danger" title={conflict ? tr.schedulingConflict : undefined}>
            {errorMessage(save.error)}
          </InlineAlert>
        )}
      </div>
    </Drawer>
  );
}
