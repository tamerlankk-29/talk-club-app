'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, LayoutDashboard, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, ErrorState, InlineAlert, Skeleton } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/inputs';
import { Card, KeyValue } from '@/components/ui/layout';
import { Modal } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';

export default function TeacherProfile() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  const { data, error, refetch } = useQuery({ queryKey: ['teacher', 'me'], queryFn: () => call(api.GET('/api/teacher/me')) });
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-5">
      <Card className="flex items-center gap-4">
        {data ? (
          <>
            <Avatar name={data.name} src={data.photoUrl} size="xl" />
            <div className="min-w-0">
              <p className="font-display text-xl font-semibold">{data.name}</p>
              <p className="text-sm text-muted">{[data.country, data.headline].filter(Boolean).join(' · ')}</p>
              <p className="mt-1 text-xs font-semibold text-brand-700">{data.levelsLabel}</p>
            </div>
          </>
        ) : (
          <Skeleton className="h-20 w-full" />
        )}
      </Card>
      {data && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <Card className="p-4">
            <p className="font-display text-2xl font-semibold">{data.stats.sessionsThisMonth}</p>
            <p className="text-xs text-muted">sessions this month</p>
          </Card>
          <Card className="p-4">
            <p className="font-display text-2xl font-semibold">{data.stats.participantsThisMonth}</p>
            <p className="text-xs text-muted">participants</p>
          </Card>
          <Card className="p-4">
            <p className="font-display text-2xl font-semibold">{data.stats.attendanceRate === null ? '—' : `${Math.round(data.stats.attendanceRate)}%`}</p>
            <p className="text-xs text-muted">attendance</p>
          </Card>
        </div>
      )}
      {data && (
        <Card>
          <KeyValue
            items={[
              { label: 'Login', value: data.email ?? '—' },
              { label: 'Native language', value: data.nativeLanguage ?? '—' },
              { label: 'Specialization', value: data.specialization ?? '—' },
            ]}
          />
          {data.bio && <p className="mt-3 whitespace-pre-line text-sm text-muted">{data.bio}</p>}
          <p className="mt-3 text-xs text-subtle">To update your public profile or photo, ask the administrator.</p>
        </Card>
      )}
      <div className="grid gap-2">
        <Button variant="outline" leftIcon={<KeyRound className="h-4 w-4" />} onClick={() => setPwOpen(true)}>
          Change password
        </Button>
        {user?.areas.admin && (
          <Link href="/admin" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm font-semibold">
            <LayoutDashboard className="h-4 w-4" /> Admin panel
          </Link>
        )}
        <Button
          variant="ghost"
          className="text-danger-700"
          leftIcon={<LogOut className="h-4 w-4" />}
          onClick={async () => {
            await logout();
            router.replace('/login?next=/teacher');
          }}
        >
          Sign out
        </Button>
      </div>
      {pwOpen && <PasswordDialog onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => call(api.POST('/api/auth/password/change', { body: { currentPassword: current, newPassword: next } })),
    onSuccess: () => {
      toast.success('Password changed.');
      onClose();
    },
  });
  const errors = fieldErrors(change.error);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Change password"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={change.isPending} disabled={!current || next.length < 8} onClick={() => change.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Current password" htmlFor="tp-current" error={errors.currentPassword}>
          <Input id="tp-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 8 characters" htmlFor="tp-new" error={errors.newPassword}>
          <Input id="tp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        {change.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(change.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}
