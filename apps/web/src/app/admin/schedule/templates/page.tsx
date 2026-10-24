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
import { messagesFor, useT } from '@/lib/i18n';
import { scheduleMessages } from '@/lib/i18n/messages/admin/schedule';

type Template = S<'SessionTemplateDto'>;
type Result = S<'TemplateGenerationResultDto'>;
const KEY = ['admin', 'session-templates'];

function summary(r: Result): string {
  const details = `${r.skipped.slice(0, 3).map((s) => `${s.date}: ${s.reason}`).join('; ')}${r.skipped.length > 3 ? '…' : ''}`;
  return messagesFor(scheduleMessages).summary(r.created, r.updated, r.removed, r.skipped.length, details);
}

export default function TemplatesPage() {
  const tr = useT(scheduleMessages);
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
      toast.success(tr.scheduleUpdated(summary(r)));
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (t: Template) => call(api.DELETE('/api/admin/session-templates/{id}', { params: { path: { id: t.id }, query: { removeFuture } } })),
    onSuccess: async (r) => {
      await refresh();
      setDeleting(null);
      toast.success(tr.templateRemoved(r.removed));
    },
    onError: toastError,
  });

  return (
    <AdminPage
      title={tr.weeklyTemplates}
      back="/admin/schedule"
      description={tr.recurringSlotsGenerateSchedule}
      actions={
        canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            {tr.newTemplate}
          </Button>
        )
      }
    >
      {query.isLoading ? (
        <SkeletonList count={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState title={tr.noTemplatesYet} description={tr.createWeeklySlotsLike} />
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
                    {t.title ?? t.groupTypeName ?? tr.sessionFallback} · {t.levelLabel} · {tr.templateLine(t.durationMinutes, t.capacity)}
                  </p>
                </div>
                {t.isActive ? <Badge tone="success">{tr.active}</Badge> : <Badge>{tr.paused}</Badge>}
              </div>
              <p className="text-sm">
                {t.teacherName ?? tr.noTeacher} · {t.format === 'ONLINE' ? tr.online : (t.roomName ?? tr.noRoom)}
              </p>
              <p className="text-xs text-muted">
                {tr.templateDates(
                  fmt.dateShort(`${t.validFrom}T12:00:00Z`),
                  t.validUntil ? fmt.dateShort(`${t.validUntil}T12:00:00Z`) : null,
                  t.generatedUntil ? fmt.dateShort(`${t.generatedUntil}T12:00:00Z`) : '—',
                  t.upcomingCount,
                )}
              </p>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button size="xs" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(t)}>
                    {tr.edit}
                  </Button>
                  <Button size="xs" variant="secondary" leftIcon={<RefreshCw className="h-3.5 w-3.5" />} loading={generate.isPending && generate.variables === t.id} onClick={() => generate.mutate(t.id)}>
                    {tr.generateNow}
                  </Button>
                  <Button size="xs" variant="ghost" className="text-danger-700" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleting(t)}>
                    {tr.delete}
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
        title={tr.deleteTemplate}
        description={tr.pastSessionsStayFuture}
        confirmLabel={tr.deleteTemplate2}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      >
        <Checkbox checked={removeFuture} onChange={setRemoveFuture} label={tr.alsoRemoveFutureSessions} />
      </ConfirmDialog>
    </AdminPage>
  );
}

function TemplateDrawer({ template, open, onOpenChange, onSaved }: { template?: Template; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => Promise<unknown> }) {
  const tr = useT(scheduleMessages);
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
      toast.success(tr.templateSaved(summary(r)));
      onOpenChange(false);
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={template ? tr.editTemplate : tr.newWeeklyTemplate}
      description={tr.changesApplyFutureSessions}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!f.daysOfWeek.length} onClick={() => save.mutate()}>
            {tr.saveGenerate}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr.days} error={errors.daysOfWeek}>
          <ChipGroup size="sm" multiple options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }))} value={f.daysOfWeek} onChange={(v) => setF({ ...f, daysOfWeek: v as number[] })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={tr.start} htmlFor="tp-time" error={errors.startTime}>
            <Input id="tp-time" type="time" step={300} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
          </Field>
          <Field label={tr.minutes} htmlFor="tp-dur">
            <Input id="tp-dur" type="number" min={15} max={480} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: e.target.value })} />
          </Field>
          <Field label={tr.capacity} htmlFor="tp-cap">
            <Input id="tp-cap" type="number" min={1} max={50} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr.format} htmlFor="tp-format">
            <Select id="tp-format" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as S<'SessionFormat'> })}>
              <option value="OFFLINE">{tr.club}</option>
              <option value="ONLINE">{tr.online}</option>
            </Select>
          </Field>
          {f.format === 'OFFLINE' ? (
            <Field label={tr.room} htmlFor="tp-room">
              <Select id="tp-room" value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
                <option value="">{tr.noRoom}</option>
                {rooms?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={tr.onlineLink} htmlFor="tp-url">
              <Input id="tp-url" type="url" value={f.onlineUrl} onChange={(e) => setF({ ...f, onlineUrl: e.target.value })} />
            </Field>
          )}
          <Field label={tr.teacher} htmlFor="tp-teacher">
            <Select id="tp-teacher" value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}>
              <option value="">{tr.notAssigned}</option>
              {teachers?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.groupType} htmlFor="tp-gt">
            <Select id="tp-gt" value={f.groupTypeId} onChange={(e) => setF({ ...f, groupTypeId: e.target.value })}>
              <option value="">—</option>
              {groupTypes?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.level} htmlFor="tp-lmin">
            <Select id="tp-lmin" value={f.levelMinId} onChange={(e) => setF({ ...f, levelMinId: e.target.value })}>
              <option value="">{tr.any}</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.level2} htmlFor="tp-lmax">
            <Select id="tp-lmax" value={f.levelMaxId} onChange={(e) => setF({ ...f, levelMaxId: e.target.value })}>
              <option value="">{tr.any}</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.valid} htmlFor="tp-from">
            <Input id="tp-from" type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} />
          </Field>
          <Field label={tr.validUntil} htmlFor="tp-until" hint={tr.emptyNoEndDate}>
            <Input id="tp-until" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} />
          </Field>
        </div>
        <Field label={tr.title} htmlFor="tp-title" hint={tr.defaultsGroupType}>
          <Input id="tp-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label={tr.description} htmlFor="tp-desc">
          <Textarea id="tp-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label={tr.active} description={tr.pausedTemplatesStopGenerating} />
        {save.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}
