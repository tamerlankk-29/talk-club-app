'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { RequireAuth } from '@/components/client/require-auth';
import { StickyActions } from '@/components/client/sticky-actions';
import { Button } from '@/components/ui/button';
import { Avatar, ErrorState, InlineAlert, Skeleton } from '@/components/ui/feedback';
import { ChipGroup, Field, Input, Select } from '@/components/ui/inputs';
import { PageHeader } from '@/components/ui/layout';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors, uploadFile } from '@/lib/api/client';
import type { ClientProfile, S } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { useLevels, useProfile, useTeachers } from '@/lib/queries';
import { FORMAT_LABELS, TIME_OF_DAY_LABELS, WEEKDAYS_SHORT } from '@/lib/utils';

type TimeOfDay = S<'TimeOfDay'>;
type FormatPreference = S<'FormatPreference'>;

export default function EditProfilePage() {
  return (
    <RequireAuth>
      <EditProfile />
    </RequireAuth>
  );
}

function EditProfile() {
  const { data, error, refetch } = useProfile();
  if (error) return <ErrorState error={error} onRetry={() => refetch()} className="mt-10" />;
  if (!data) return <Skeleton className="mt-16 h-96 w-full rounded-3xl" />;
  return <ProfileForm profile={data} />;
}

function ProfileForm({ profile }: { profile: ClientProfile }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { reloadUser } = useAuth();
  const { data: levels } = useLevels();
  const { data: teachers } = useTeachers();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    firstName: profile.firstName,
    lastName: profile.lastName ?? '',
    email: profile.email ?? '',
    birthDate: profile.birthDate ?? '',
    levelId: profile.level?.id ?? '',
    preferredDays: profile.preferredDays,
    preferredTimes: profile.preferredTimes as TimeOfDay[],
    formatPreference: profile.formatPreference as FormatPreference,
    preferredTeacherIds: profile.preferredTeachers.map((t) => t.id),
    photoUrl: profile.photoUrl,
  });
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    setForm((f) => ({ ...f, photoUrl: profile.photoUrl }));
  }, [profile.photoUrl]);

  const save = useMutation({
    mutationFn: () =>
      call(
        api.PATCH('/api/my/profile', {
          body: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim() || null,
            email: form.email.trim() || null,
            birthDate: form.birthDate || null,
            levelId: form.levelId || null,
            preferredDays: form.preferredDays,
            preferredTimes: form.preferredTimes,
            formatPreference: form.formatPreference,
            preferredTeacherIds: form.preferredTeacherIds,
            photoUrl: form.photoUrl,
          },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['my'] }), qc.invalidateQueries({ queryKey: ['sessions'] }), reloadUser()]);
      toast.success('Profile saved.');
      router.push('/profile');
    },
  });
  const errors = fieldErrors(save.error);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile<{ url: string }>('/api/files?purpose=avatar', file);
      setForm((f) => ({ ...f, photoUrl: uploaded.url }));
    } catch (e) {
      toastError(e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      className="space-y-5 pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <PageHeader back="/profile" title="Edit profile" />
      <div className="flex flex-col items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} className="relative" aria-label="Change photo">
          <Avatar name={`${form.firstName} ${form.lastName}`} src={form.photoUrl} size="xl" className="h-24 w-24 text-3xl" />
          <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-white ring-4 ring-canvas">
            <Camera className="h-4 w-4" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
        {uploading && <p className="text-xs text-muted">Uploading…</p>}
        {form.photoUrl && (
          <button type="button" className="text-xs font-semibold text-muted" onClick={() => setForm({ ...form, photoUrl: null })}>
            Remove photo
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" required htmlFor="firstName" error={errors.firstName}>
          <Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required maxLength={60} />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={errors.lastName}>
          <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} maxLength={60} />
        </Field>
      </div>
      <Field label="Email" htmlFor="email" error={errors.email}>
        <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Date of birth" htmlFor="birthDate" error={errors.birthDate}>
        <Input id="birthDate" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
      </Field>
      <Field label="English level" htmlFor="level" hint="Your teacher may update this after sessions.">
        <Select id="level" value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })}>
          <option value="">Not sure</option>
          {levels?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Preferred days">
        <ChipGroup
          size="sm"
          multiple
          options={[1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }))}
          value={form.preferredDays}
          onChange={(v) => setForm({ ...form, preferredDays: v as number[] })}
        />
      </Field>
      <Field label="Preferred time">
        <ChipGroup
          size="sm"
          multiple
          options={(['MORNING', 'AFTERNOON', 'EVENING'] as const).map((t) => ({ value: t, label: TIME_OF_DAY_LABELS[t] }))}
          value={form.preferredTimes}
          onChange={(v) => setForm({ ...form, preferredTimes: v as TimeOfDay[] })}
        />
      </Field>
      <Field label="Format">
        <ChipGroup
          size="sm"
          options={(['OFFLINE', 'ONLINE', 'ANY'] as const).map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
          value={form.formatPreference}
          onChange={(v) => setForm({ ...form, formatPreference: v as FormatPreference })}
        />
      </Field>
      {teachers && teachers.length > 0 && (
        <Field label="Favourite teachers" hint="We'll recommend their sessions first.">
          <ChipGroup
            size="sm"
            multiple
            options={teachers.map((t) => ({ value: t.id, label: t.firstName }))}
            value={form.preferredTeacherIds}
            onChange={(v) => setForm({ ...form, preferredTeacherIds: v as string[] })}
          />
        </Field>
      )}
      <p className="text-xs text-muted">To change your phone number, please contact the administrator.</p>
      {save.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      <StickyActions>
        <Button type="submit" size="lg" block loading={save.isPending} disabled={!form.firstName.trim() || uploading}>
          Save changes
        </Button>
      </StickyActions>
    </form>
  );
}
