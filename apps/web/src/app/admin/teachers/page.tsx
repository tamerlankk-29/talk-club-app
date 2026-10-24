'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, KeyRound, Plus, Trash2 } from 'lucide-react';
import { Suspense, useRef, useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, ErrorState, InlineAlert, SkeletonList } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Card } from '@/components/ui/layout';
import { Drawer, Modal } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors, uploadFile } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys, useAdminLevels, useAdminTeachers, useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { WEEKDAYS_SHORT } from '@/lib/utils';

type Teacher = S<'TeacherAdminDto'>;
type Slot = S<'AvailabilitySlotDto'>;

function Teachers() {
  const url = useUrlState();
  const { data, isLoading, error, refetch } = useAdminTeachers();
  const [creating, setCreating] = useState(false);
  const openId = url.get('id') || null;
  const selected = data?.find((t) => t.id === openId);
  return (
    <AdminPage
      title="Teachers"
      description="Profiles shown in the client app, level ranges, availability and logins for the teacher panel."
      actions={
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          New teacher
        </Button>
      }
    >
      {isLoading ? (
        <SkeletonList count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((t) => (
            <button key={t.id} type="button" onClick={() => url.set({ id: t.id })} className="flex gap-4 rounded-3xl bg-white p-5 text-left shadow-card ring-1 ring-line/70 transition hover:ring-brand-200">
              <Avatar name={t.name} src={t.photoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{t.name}</p>
                  {!t.isActive && <Badge>inactive</Badge>}
                </div>
                <p className="truncate text-sm text-muted">{[t.country, t.headline].filter(Boolean).join(' · ')}</p>
                <p className="mt-1 text-xs font-semibold text-brand-700">{t.levelsLabel}</p>
                <p className="mt-1 text-xs text-muted">
                  {t.upcomingSessions} upcoming sessions · {t.loginEmail ? `login ${t.loginEmail}` : 'no login'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      <TeacherDrawer teacher={creating ? undefined : selected} open={creating || !!selected} onOpenChange={(o) => {
        if (!o) {
          setCreating(false);
          url.set({ id: null });
        }
      }} />
    </AdminPage>
  );
}

function TeacherDrawer({ teacher, open, onOpenChange }: { teacher?: Teacher; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const canRates = useCan('teachers.view_rates');
  const canStaff = useCan('staff.manage');
  const { data: levels } = useAdminLevels();
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const init = () => ({
    firstName: teacher?.firstName ?? '',
    lastName: teacher?.lastName ?? '',
    photoUrl: teacher?.photoUrl ?? '',
    country: teacher?.country ?? '',
    nativeLanguage: teacher?.nativeLanguage ?? 'English',
    englishLevel: teacher?.englishLevel ?? 'Native',
    headline: teacher?.headline ?? '',
    bio: teacher?.bio ?? '',
    specialization: teacher?.specialization ?? '',
    levelFromId: teacher?.levelFrom?.id ?? '',
    levelToId: teacher?.levelTo?.id ?? '',
    availability: (teacher?.availability ?? []) as Slot[],
    sessionRate: teacher?.sessionRate !== null && teacher?.sessionRate !== undefined ? String(teacher.sessionRate) : '',
    isActive: teacher?.isActive ?? true,
    sortOrder: String(teacher?.sortOrder ?? 0),
  });
  const [f, setF] = useState(init);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (teacher?.id ?? 'new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) setF(init());
  }
  const save = useMutation({
    mutationFn: () => {
      const body = {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim() || undefined,
        photoUrl: f.photoUrl || undefined,
        country: f.country.trim() || undefined,
        nativeLanguage: f.nativeLanguage.trim() || undefined,
        englishLevel: f.englishLevel.trim() || undefined,
        headline: f.headline.trim() || undefined,
        bio: f.bio.trim() || undefined,
        specialization: f.specialization.trim() || undefined,
        levelFromId: f.levelFromId || null,
        levelToId: f.levelToId || null,
        availability: f.availability,
        ...(canRates ? { sessionRate: f.sessionRate ? Number(f.sessionRate) : null } : {}),
        isActive: f.isActive,
        sortOrder: Number(f.sortOrder) || 0,
      };
      return teacher ? call(api.PATCH('/api/admin/teachers/{id}', { params: { path: { id: teacher.id } }, body })) : call(api.POST('/api/admin/teachers', { body }));
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: adminKeys.teachers }), qc.invalidateQueries({ queryKey: ['public', 'teachers'] })]);
      toast.success('Teacher saved.');
      onOpenChange(false);
    },
  });
  const errors = fieldErrors(save.error);
  const onPhoto = async (file?: File) => {
    if (!file) return;
    try {
      const uploaded = await uploadFile<{ url: string }>('/api/files?purpose=teacher', file);
      setF((x) => ({ ...x, photoUrl: uploaded.url }));
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={teacher ? teacher.name : 'New teacher'}
      width="lg"
      footer={
        <>
          {teacher && canStaff && !teacher.userId && (
            <Button variant="outline" className="mr-auto" leftIcon={<KeyRound className="h-4 w-4" />} onClick={() => setAccountOpen(true)}>
              Create login
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.firstName.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button type="button" className="relative" onClick={() => fileRef.current?.click()} aria-label="Upload photo">
            <Avatar name={`${f.firstName} ${f.lastName}`} src={f.photoUrl || null} size="xl" />
            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-white ring-4 ring-white">
              <Camera className="h-4 w-4" />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
          <p className="text-sm text-muted">Square photo, at least 400×400 px. Shown in the app and on the website.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" required htmlFor="tc-first" error={errors.firstName}>
            <Input id="tc-first" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
          </Field>
          <Field label="Last name" htmlFor="tc-last">
            <Input id="tc-last" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
          </Field>
          <Field label="Country" htmlFor="tc-country">
            <Input id="tc-country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />
          </Field>
          <Field label="Native language" htmlFor="tc-lang">
            <Input id="tc-lang" value={f.nativeLanguage} onChange={(e) => setF({ ...f, nativeLanguage: e.target.value })} />
          </Field>
          <Field label="Teaches from level" htmlFor="tc-lf">
            <Select id="tc-lf" value={f.levelFromId} onChange={(e) => setF({ ...f, levelFromId: e.target.value })}>
              <option value="">Any</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teaches up to level" htmlFor="tc-lt">
            <Select id="tc-lt" value={f.levelToId} onChange={(e) => setF({ ...f, levelToId: e.target.value })}>
              <option value="">Any</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Headline" htmlFor="tc-head" hint="One line, e.g. “Native English Speaker · Business English”">
          <Input id="tc-head" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Bio" htmlFor="tc-bio">
          <Textarea id="tc-bio" rows={4} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} maxLength={2000} />
        </Field>
        <Field label="Specialization" htmlFor="tc-spec">
          <Input id="tc-spec" value={f.specialization} onChange={(e) => setF({ ...f, specialization: e.target.value })} />
        </Field>
        <Field label="Availability" hint="Used when planning the schedule">
          <div className="space-y-2">
            {f.availability.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={String(slot.day)} onChange={(e) => setF({ ...f, availability: f.availability.map((s, j) => (j === i ? { ...s, day: Number(e.target.value) } : s)) })} className="h-10 w-28" aria-label="Day">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      {WEEKDAYS_SHORT[d]}
                    </option>
                  ))}
                </Select>
                <Input type="time" value={slot.from} onChange={(e) => setF({ ...f, availability: f.availability.map((s, j) => (j === i ? { ...s, from: e.target.value } : s)) })} className="h-10 w-32" aria-label="From" />
                <span className="text-muted">–</span>
                <Input type="time" value={slot.to} onChange={(e) => setF({ ...f, availability: f.availability.map((s, j) => (j === i ? { ...s, to: e.target.value } : s)) })} className="h-10 w-32" aria-label="To" />
                <button type="button" className="rounded-xl p-2 text-muted hover:bg-brand-50" aria-label="Remove slot" onClick={() => setF({ ...f, availability: f.availability.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button size="xs" variant="outline" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setF({ ...f, availability: [...f.availability, { day: 1, from: '12:30', to: '20:00' }] })}>
              Add slot
            </Button>
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {canRates && (
            <Field label="Rate per session, ₸" htmlFor="tc-rate" hint="Visible only to staff with rate access">
              <Input id="tc-rate" type="number" min={0} value={f.sessionRate} onChange={(e) => setF({ ...f, sessionRate: e.target.value })} />
            </Field>
          )}
          <Field label="Sort order" htmlFor="tc-sort">
            <Input id="tc-sort" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
          </Field>
        </div>
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active (shown in the app)" />
        {teacher?.loginEmail && <InlineAlert tone="success">Teacher panel login: {teacher.loginEmail}</InlineAlert>}
        {save.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
      {teacher && accountOpen && <AccountDialog teacher={teacher} onClose={() => setAccountOpen(false)} />}
    </Drawer>
  );
}

function AccountDialog({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<S<'TeacherAccountResultDto'> | null>(null);
  const create = useMutation({
    mutationFn: () => call(api.POST('/api/admin/teachers/{id}/account', { params: { path: { id: teacher.id } }, body: { email: email.trim() } })),
    onSuccess: async (r) => {
      setResult(r);
      await qc.invalidateQueries({ queryKey: adminKeys.teachers });
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Teacher panel login for ${teacher.firstName}`}
      size="sm"
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={create.isPending} disabled={!email.includes('@')} onClick={() => create.mutate()}>
              Create login
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <InlineAlert tone="success" title="Login created">
            {result.email}
          </InlineAlert>
          {result.temporaryPassword && (
            <div className="rounded-2xl bg-canvas p-3">
              <p className="text-muted">Temporary password — shown only once, share it securely:</p>
              <p className="mt-1 select-all font-mono text-base font-semibold">{result.temporaryPassword}</p>
            </div>
          )}
          <p className="text-muted">The teacher signs in at /login with this email and should change the password in their profile.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Email" htmlFor="ta-email">
            <Input id="ta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          {create.error && <InlineAlert tone="danger">{errorMessage(create.error)}</InlineAlert>}
          <p className="text-xs text-muted">Created {fmt.date(new Date().toISOString())} · role: Teacher</p>
        </div>
      )}
    </Modal>
  );
}

export default function TeachersPage() {
  return (
    <Suspense>
      <Teachers />
    </Suspense>
  );
}
