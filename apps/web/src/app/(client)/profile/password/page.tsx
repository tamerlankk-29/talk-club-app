'use client';

import { useMutation } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/client/require-auth';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/inputs';
import { Card, PageHeader } from '@/components/ui/layout';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { messagesFor } from '@/lib/i18n';
import { useT } from '@/lib/i18n';
import { profileMessages } from '@/lib/i18n/messages/profile';

export default function PasswordPage() {
  return (
    <RequireAuth>
      <PasswordForm />
    </RequireAuth>
  );
}

function PasswordForm() {
  const router = useRouter();
  const { user, reloadUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const t = useT(profileMessages);
  const change = useMutation({
    mutationFn: () => call(api.POST('/api/auth/password/change', { body: { currentPassword: current || undefined, newPassword: next } })),
    onSuccess: async () => {
      await reloadUser();
      toast.success(messagesFor(profileMessages).passwordSaved);
      router.push('/profile');
    },
  });
  const errors = fieldErrors(change.error);
  const mismatch = confirm.length > 0 && confirm !== next;

  return (
    <div className="space-y-5 pt-5">
      <PageHeader back="/profile" title={user?.hasPassword ? t.menu.changePassword : t.menu.setPassword} subtitle={t.passwordSubtitle} />
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mismatch) change.mutate();
          }}
        >
          {user?.hasPassword && (
            <Field label={t.currentPassword} htmlFor="current" error={errors.currentPassword}>
              <Input id="current" type="password" autoComplete="current-password" leftIcon={<Lock className="h-4 w-4" />} value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
          )}
          <Field label={t.newPassword} hint={t.newPasswordHint} htmlFor="new" error={errors.newPassword}>
            <Input id="new" type="password" autoComplete="new-password" leftIcon={<Lock className="h-4 w-4" />} value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
          </Field>
          <Field label={t.repeatPassword} htmlFor="confirm" error={mismatch ? t.mismatch : null}>
            <Input id="confirm" type="password" autoComplete="new-password" leftIcon={<Lock className="h-4 w-4" />} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          {change.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(change.error)}</InlineAlert>}
          <Button type="submit" block size="lg" loading={change.isPending} disabled={next.length < 8 || mismatch || (user?.hasPassword && !current)}>
            {t.savePassword}
          </Button>
        </form>
      </Card>
    </div>
  );
}
