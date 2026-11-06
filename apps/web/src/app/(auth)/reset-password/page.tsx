'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Lock, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { destinationFor } from '@/components/auth/auth-flow';
import { TwoFactorChallenge, twoFactorChallenge, TwoFactorStep } from '@/components/auth/two-factor-step';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Field, Input, OtpInput, PhoneInput } from '@/components/ui/inputs';
import { toastError } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { phoneDigitsComplete } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';
import { LanguageSwitcher } from '@/components/ui/language-switcher';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { applySession } = useAuth();
  const t = useT(authMessages);
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);

  const request = useMutation({
    mutationFn: () => call(api.POST('/api/auth/password/reset/request', { body: { phone } })),
    onSuccess: (r) => {
      setDevCode(r.devCode);
      setSent(true);
    },
    onError: toastError,
  });
  const reset = useMutation({
    mutationFn: () => call(api.POST('/api/auth/password/reset', { body: { phone, code, newPassword: password } })),
    onSuccess: (tokens) => finish(tokens),
    // The new password is saved; owners and admins still confirm with their authenticator app.
    onError: (error) => setChallenge(twoFactorChallenge(error)),
  });
  const finish = (tokens: Parameters<typeof applySession>[0]) => {
    applySession(tokens);
    router.replace(destinationFor(tokens.user, null));
  };

  if (challenge) {
    return <TwoFactorStep challenge={challenge} onBack={() => router.replace('/login')} onDone={finish} />;
  }
  const errors = fieldErrors(reset.error);

  return (
    <div className="pt-5">
      <div className="flex h-11 items-center justify-between">
        <Link href="/login" className="-ml-2 inline-flex rounded-xl p-2 hover:bg-brand-50" aria-label={t.backToSignIn}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <LanguageSwitcher />
      </div>
      <h1 className="mt-6 font-display text-[28px] font-semibold">{t.resetTitle}</h1>
      <p className="mt-2 text-[15px] text-muted">{sent ? t.resetSent(phone) : t.resetSubtitle}</p>
      {!sent ? (
        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate();
          }}
        >
          <Field label={t.phone} htmlFor="phone">
            <PhoneInput id="phone" value={phone} onChange={setPhone} autoFocus />
          </Field>
          <Button type="submit" size="lg" block loading={request.isPending} disabled={!phoneDigitsComplete(phone)}>
            {t.sendCode}
          </Button>
        </form>
      ) : (
        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          <OtpInput value={code} onChange={setCode} autoFocus />
          {devCode && (
            <InlineAlert tone="info" icon={<MessageSquareText className="h-5 w-5" />} title={t.devMode}>
              {t.devCodeShort}{' '}
              <button type="button" className="font-mono font-bold underline" onClick={() => setCode(devCode)}>
                {devCode}
              </button>
            </InlineAlert>
          )}
          <Field label={t.newPassword} hint={t.newPasswordHint} htmlFor="password" error={errors.newPassword}>
            <Input id="password" type="password" autoComplete="new-password" leftIcon={<Lock className="h-4 w-4" />} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </Field>
          {reset.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(reset.error)}</InlineAlert>}
          <Button type="submit" size="lg" block loading={reset.isPending} disabled={code.length !== 6 || password.length < 8}>
            {t.saveAndSignIn}
          </Button>
        </form>
      )}
    </div>
  );
}
