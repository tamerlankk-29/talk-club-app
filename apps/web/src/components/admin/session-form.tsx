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
      else toast.success(session ? 'Session updated.' : 'Session created.');
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
      title={session ? 'Edit session' : 'New session'}
      description={session ? `${session.title} · ${session.localDate} ${session.startTime}` : 'One-off session. Use templates for a weekly schedule.'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!form.date || !form.startTime} onClick={() => save.mutate()}>
            {session ? 'Save changes' : 'Create session'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" required htmlFor="sf-date" error={errors.date}>
            <Input id="sf-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Start" required htmlFor="sf-time" error={errors.startTime}>
            <Input id="sf-time" type="time" step={300} value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
          <Field label="Minutes" htmlFor="sf-dur" error={errors.durationMinutes}>
            <Input id="sf-dur" type="number" min={15} max={480} step={5} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Format" htmlFor="sf-format">
            <Select id="sf-format" value={form.format} onChange={(e) => set('format', e.target.value as Format)}>
              <option value="OFFLINE">At the club</option>
              <option value="ONLINE">Online</option>
            </Select>
          </Field>
          {form.format === 'OFFLINE' ? (
            <Field label="Room" htmlFor="sf-room" error={errors.roomId}>
              <Select id="sf-room" value={form.roomId} onChange={(e) => set('roomId', e.target.value)}>
                <option value="">No room yet</option>
                {rooms
                  ?.filter((r) => r.isActive)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.capacity} seats)
                    </option>
                  ))}
              </Select>
            </Field>
          ) : (
            <Field label="Online link" htmlFor="sf-url" error={errors.onlineUrl} hint="Shown to booked clients only">
              <Input id="sf-url" type="url" placeholder="https://meet.google.com/…" value={form.onlineUrl} onChange={(e) => set('onlineUrl', e.target.value)} />
            </Field>
          )}
          <Field label="Teacher" htmlFor="sf-teacher">
            <Select id="sf-teacher" value={form.teacherId} onChange={(e) => set('teacherId', e.target.value)}>
              <option value="">Not assigned</option>
              {teachers
                ?.filter((t) => t.isActive || t.id === form.teacherId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Group type" htmlFor="sf-gt">
            <Select id="sf-gt" value={form.groupTypeId} onChange={(e) => set('groupTypeId', e.target.value)}>
              <option value="">—</option>
              {groupTypes?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level from" htmlFor="sf-lmin">
            <Select id="sf-lmin" value={form.levelMinId} onChange={(e) => set('levelMinId', e.target.value)}>
              <option value="">Any</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level to" htmlFor="sf-lmax">
            <Select id="sf-lmax" value={form.levelMaxId} onChange={(e) => set('levelMaxId', e.target.value)}>
              <option value="">Any</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Capacity" htmlFor="sf-cap" error={errors.capacity} hint={hasBookings ? `${session!.booked} already booked` : undefined}>
            <Input id="sf-cap" type="number" min={1} max={50} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
          </Field>
          <Field label="Title" htmlFor="sf-title" hint="Defaults to the group type name">
            <Input id="sf-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
          </Field>
        </div>
        <Field label="Topic" htmlFor="sf-topic" hint="Shown to clients, e.g. “Travel stories”">
          <Input id="sf-topic" value={form.topic} onChange={(e) => set('topic', e.target.value)} maxLength={160} />
        </Field>
        <Field label="Description" htmlFor="sf-desc">
          <Textarea id="sf-desc" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
        </Field>
        <div className="space-y-3">
          <Checkbox checked={form.trialsAllowed} onChange={(v) => set('trialsAllowed', v)} label="Open for trial sessions" />
          <Checkbox checked={form.bookingClosed} onChange={(v) => set('bookingClosed', v)} label="Close online booking" description="Staff can still add participants." />
          {hasBookings && <Checkbox checked={notifyClients} onChange={setNotifyClients} label="Notify booked clients about changes" description="Sent when time, room or teacher changes." />}
        </div>
        {save.error && !Object.keys(errors).length && (
          <InlineAlert tone="danger" title={conflict ? 'Scheduling conflict' : undefined}>
            {errorMessage(save.error)}
          </InlineAlert>
        )}
      </div>
    </Drawer>
  );
}
