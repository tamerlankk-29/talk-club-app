'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, InlineAlert, SkeletonList } from '@/components/ui/feedback';
import { Checkbox, ChipGroup, Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Card } from '@/components/ui/layout';
import { ConfirmDialog, Drawer } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminGroupTypes, useAdminLevels, useAdminRooms, useAdminTeachers } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { clubNow, fmt } from '@/lib/format';
import { useClub } from '@/lib/queries';
import { WEEKDAYS_SHORT } from '@/lib/utils';

type Template = S<'SessionTemplateDto'>;
type Result = S<'TemplateGenerationResultDto'>;
const KEY = ['admin', 'session-templates'];

function summary(r: Result): string {
  const parts = [`${r.created} created`, `${r.updated} updated`, `${r.removed} removed`];
  if (r.skipped.length) parts.push(`${r.skipped.length} skipped (${r.skipped.slice(0, 3).map((s) => `${s.date}: ${s.reason}`).join('; ')}${r.skipped.length > 3 ? '…' : ''})`);
  return parts.join(', ');
}

export default function TemplatesPage() {
  const qc = useQueryClient();
  const canManage = useCan('schedule.manage');
  const query = useQuery({ queryKey: KEY, queryFn: () => call(api.GET('/api/admin/session-templates')) });
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [removeFuture, setRemoveFuture] = useState(true);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ['admin', 'sessions'] })]);

  const generate = useMutation({
    mutationFn: (id: string) => call(api.POST('/api/admin/session-templates/{id}/generate', { params: { path: { id } } })),
    onSuccess: async (r) => {
      await refresh();
      toast.success(`Schedule updated: ${summary(r)}.`);
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (t: Template) => call(api.DELETE('/api/admin/session-templates/{id}', { params: { path: { id: t.id }, query: { removeFuture } } })),
    onSuccess: async (r) => {
      await refresh();
      setDeleting(null);
      toast.success(`Template removed. ${r.removed} future sessions without bookings removed.`);
    },
    onError: toastError,
  });

  return (
    <AdminPage
      title="Weekly templates"
      back="/admin/schedule"
      description="Recurring slots generate the schedule ahead automatically. Sessions with bookings are never deleted by a template change."
      actions={
        canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New template
          </Button>
        )
      }
    >
      {query.isLoading ? (
        <SkeletonList count={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState title="No templates yet" description="Create weekly slots like “Mon/Wed/Fri 18:30, Office 314, Intermediate”." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {query.data.map((t) => (
            <Card key={t.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold">
                    {t.daysOfWeek.map((d) => WEEKDAYS_SHORT[d]).join(' · ')} {t.startTime}
                  </p>
                  <p className="text-sm text-muted">
                    {t.title ?? t.groupTypeName ?? 'Session'} · {t.levelLabel} · {t.durationMinutes} min · {t.capacity} seats
                  </p>
                </div>
                {t.isActive ? <Badge tone="success">Active</Badge> : <Badge>Paused</Badge>}
              </div>
              <p className="text-sm">
                {t.teacherName ?? 'No teacher'} · {t.format === 'ONLINE' ? 'Online' : (t.roomName ?? 'No room')}
              </p>
              <p className="text-xs text-muted">
                From {fmt.dateShort(`${t.validFrom}T12:00:00Z`)}
                {t.validUntil ? ` until ${fmt.dateShort(`${t.validUntil}T12:00:00Z`)}` : ''} · generated until {t.generatedUntil ? fmt.dateShort(`${t.generatedUntil}T12:00:00Z`) : '—'} · {t.upcomingCount} upcoming
              </p>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button size="xs" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button size="xs" variant="secondary" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} loading={generate.isPending && generate.variables === t.id} onClick={() => generate.mutate(t.id)}>
                    Generate now
                  </Button>
                  <Button size="xs" variant="ghost" className="text-danger-700" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleting(t)}>
                    Delete
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <TemplateDrawer template={editing === 'new' ? undefined : (editing ?? undefined)} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} onSaved={refresh} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this template?"
        description="Past sessions stay. Future sessions that already have bookings are kept either way."
        confirmLabel="Delete template"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      >
        <Checkbox checked={removeFuture} onChange={setRemoveFuture} label="Also remove future sessions without bookings" />
      </ConfirmDialog>
    </AdminPage>
  );
}

function TemplateDrawer({ template, open, onOpenChange, onSaved }: { template?: Template; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => Promise<unknown> }) {
  const { data: club } = useClub();
  const { data: rooms } = useAdminRooms();
  const { data: teachers } = useAdminTeachers();
  const { data: groupTypes } = useAdminGroupTypes();
  const { data: levels } = useAdminLevels();
  const init = () => ({
    daysOfWeek: template?.daysOfWeek ?? [1],
    startTime: template?.startTime ?? '18:30',
    durationMinutes: String(template?.durationMinutes ?? club?.policies.sessionDurationMinutes ?? 90),
    capacity: String(template?.capacity ?? club?.policies.groupSize ?? 7),
    format: (template?.format ?? 'OFFLINE') as S<'SessionFormat'>,
    roomId: template?.roomId ?? '',
    teacherId: template?.teacherId ?? '',
    groupTypeId: template?.groupTypeId ?? '',
    levelMinId: template?.levelMinId ?? '',
    levelMaxId: template?.levelMaxId ?? '',
    title: template?.title ?? '',
    description: template?.description ?? '',
    onlineUrl: template?.onlineUrl ?? '',
    validFrom: template?.validFrom ?? clubNow().toISODate()!,
    validUntil: template?.validUntil ?? '',
    isActive: template?.isActive ?? true,
  });
  const [f, setF] = useState(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setF(init());
  }
  const save = useMutation({
    mutationFn: () => {
      const body = {
        daysOfWeek: f.daysOfWeek,
        startTime: f.startTime,
        durationMinutes: Number(f.durationMinutes),
        capacity: Number(f.capacity),
        format: f.format,
        roomId: f.format === 'OFFLINE' ? f.roomId || null : null,
        teacherId: f.teacherId || null,
        groupTypeId: f.groupTypeId || null,
        levelMinId: f.levelMinId || null,
        levelMaxId: f.levelMaxId || null,
        title: f.title.trim() || null,
        description: f.description.trim() || null,
        onlineUrl: f.format === 'ONLINE' ? f.onlineUrl.trim() || null : null,
        validFrom: f.validFrom,
        validUntil: f.validUntil || null,
        isActive: f.isActive,
      };
      return template
        ? call(api.PATCH('/api/admin/session-templates/{id}', { params: { path: { id: template.id } }, body }))
        : call(api.POST('/api/admin/session-templates', { body }));
    },
    onSuccess: async (r) => {
      await onSaved();
      toast.success(`Template saved. ${summary(r)}.`);
      onOpenChange(false);
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={template ? 'Edit template' : 'New weekly template'}
      description="Changes apply to future sessions without manual edits."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.daysOfWeek.length} onClick={() => save.mutate()}>
            Save & generate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Days" error={errors.daysOfWeek}>
          <ChipGroup size="sm" multiple options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }))} value={f.daysOfWeek} onChange={(v) => setF({ ...f, daysOfWeek: v as number[] })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Start" htmlFor="tp-time" error={errors.startTime}>
            <Input id="tp-time" type="time" step={300} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          </Field>
          <Field label="Minutes" htmlFor="tp-dur">
            <Input id="tp-dur" type="number" min={15} max={480} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: e.target.value })} />
          </Field>
          <Field label="Capacity" htmlFor="tp-cap">
            <Input id="tp-cap" type="number" min={1} max={50} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Format" htmlFor="tp-format">
            <Select id="tp-format" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as S<'SessionFormat'> })}>
              <option value="OFFLINE">At the club</option>
              <option value="ONLINE">Online</option>
            </Select>
          </Field>
          {f.format === 'OFFLINE' ? (
            <Field label="Room" htmlFor="tp-room">
              <Select id="tp-room" value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
                <option value="">No room</option>
                {rooms?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Online link" htmlFor="tp-url">
              <Input id="tp-url" type="url" value={f.onlineUrl} onChange={(e) => setF({ ...f, onlineUrl: e.target.value })} />
            </Field>
          )}
          <Field label="Teacher" htmlFor="tp-teacher">
            <Select id="tp-teacher" value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}>
              <option value="">Not assigned</option>
              {teachers?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Group type" htmlFor="tp-gt">
            <Select id="tp-gt" value={f.groupTypeId} onChange={(e) => setF({ ...f, groupTypeId: e.target.value })}>
              <option value="">—</option>
              {groupTypes?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level from" htmlFor="tp-lmin">
            <Select id="tp-lmin" value={f.levelMinId} onChange={(e) => setF({ ...f, levelMinId: e.target.value })}>
              <option value="">Any</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level to" htmlFor="tp-lmax">
            <Select id="tp-lmax" value={f.levelMaxId} onChange={(e) => setF({ ...f, levelMaxId: e.target.value })}>
              <option value="">Any</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valid from" htmlFor="tp-from">
            <Input id="tp-from" type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} />
          </Field>
          <Field label="Valid until" htmlFor="tp-until" hint="Empty = no end date">
            <Input id="tp-until" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} />
          </Field>
        </div>
        <Field label="Title" htmlFor="tp-title" hint="Defaults to the group type">
          <Input id="tp-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor="tp-desc">
          <Textarea id="tp-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" description="Paused templates stop generating new sessions." />
        {save.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}
