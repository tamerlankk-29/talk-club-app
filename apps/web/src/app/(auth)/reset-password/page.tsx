'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Lock, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { destinationFor } from '@/components/auth/auth-flow';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Field, Input, OtpInput, PhoneInput } from '@/components/ui/inputs';
import { toastError } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { phoneDigitsComplete } from '@/lib/format';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { applySession } = useAuth();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

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
    onSuccess: (tokens) => {
      applySession(tokens);
      router.replace(destinationFor(tokens.user, null));
    },
  });
  const errors = fieldErrors(reset.error);

  return (
    <div className="pt-5">
      <Link href="/login" className="-ml-2 inline-flex rounded-xl p-2 hover:bg-brand-50" aria-label="Back to sign in">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <h1 className="mt-6 font-display text-[28px] font-semibold">Reset password</h1>
      <p className="mt-2 text-[15px] text-muted">{sent ? `Enter the code we sent to ${phone} and choose a new password.` : 'We will send a code to your phone number.'}</p>
      {!sent ? (
        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate();
          }}
        >
          <Field label="Phone number" htmlFor="phone">
            <PhoneInput id="phone" value={phone} onChange={setPhone} autoFocus />
          </Field>
          <Button type="submit" size="lg" block loading={request.isPending} disabled={!phoneDigitsComplete(phone)}>
            Send code
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
            <InlineAlert tone="info" icon={<MessageSquareText className="h-5 w-5" />} title="Development mode">
              Your code is{' '}
              <button type="button" className="font-mono font-bold underline" onClick={() => setCode(devCode)}>
                {devCode}
              </button>
            </InlineAlert>
          )}
          <Field label="New password" hint="At least 8 characters" htmlFor="password" error={errors.newPassword}>
            <Input id="password" type="password" autoComplete="new-password" leftIcon={<Lock className="h-4 w-4" />} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </Field>
          {reset.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(reset.error)}</InlineAlert>}
          <Button type="submit" size="lg" block loading={reset.isPending} disabled={code.length !== 6 || password.length < 8}>
            Save and sign in
          </Button>
        </form>
      )}
    </div>
  );
}
