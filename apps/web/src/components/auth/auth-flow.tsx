'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, Lock, Mail, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Logo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Field, Input, OtpInput, PhoneInput } from '@/components/ui/inputs';
import { toastError } from '@/components/ui/toast';
import { api, call, errorCode, errorMessage } from '@/lib/api/client';
import type { AuthTokens, SessionUser } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { phoneDigitsComplete } from '@/lib/format';
import { RegistrationForm } from './registration-form';

/** Where to go after signing in: the requested page, else the area the account can use. */
export function destinationFor(user: SessionUser, next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  if (user.client || user.managedClients.length) return '/';
  if (user.areas.admin) return '/admin';
  if (user.areas.teacher) return '/teacher';
  return '/';
}

const REF_KEY = 'tc.ref';

/** Remembers ?ref= from a referral link until registration. */
function useReferralCode(): string | undefined {
  const params = useSearchParams();
  const [code, setCode] = useState<string | undefined>(undefined);
  useEffect(() => {
    const fromUrl = params.get('ref');
    try {
      if (fromUrl) localStorage.setItem(REF_KEY, fromUrl);
      setCode(fromUrl ?? localStorage.getItem(REF_KEY) ?? undefined);
    } catch {
      setCode(fromUrl ?? undefined);
    }
  }, [params]);
  return code;
}

export function clearReferralCode(): void {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}

function AuthHeader({ title, subtitle, onBack }: { title: string; subtitle?: ReactNode; onBack?: () => void }) {
  return (
    <div className="pb-6 pt-5">
      <div className="flex h-11 items-center justify-between">
        {onBack ? (
          <button type="button" onClick={onBack} className="-ml-2 rounded-xl p-2 hover:bg-brand-50" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link href="/" aria-label="Talk Club home">
            <Logo />
          </Link>
        )}
      </div>
      <h1 className="mt-6 font-display text-[28px] font-semibold leading-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
    </div>
  );
}

type Step = { name: 'phone' } | { name: 'code'; phone: string } | { name: 'register'; phone: string; token: string } | { name: 'password' };

/**
 * Phone-first sign-in: phone → SMS code → (new users) profile details.
 * The same flow serves /login and /register; returning members are simply
 * signed in when they verify their number.
 */
export function AuthFlow({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const { status, user, applySession } = useAuth();
  const referralCode = useReferralCode();
  const [step, setStep] = useState<Step>({ name: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Already signed in → leave the auth screens.
  useEffect(() => {
    if (status === 'authenticated' && user && step.name !== 'register') router.replace(destinationFor(user, next));
  }, [status, user, next, router, step.name]);

  useEffect(() => {
    if (step.name !== 'code') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step.name]);

  const finish = (tokens: AuthTokens) => {
    applySession(tokens);
    router.replace(destinationFor(tokens.user, next));
  };

  const requestOtp = useMutation({
    mutationFn: (value: string) => call(api.POST('/api/auth/otp/request', { body: { phone: value } })),
    onSuccess: (result, value) => {
      setDevCode(result.devCode);
      setResendAt(Date.now() + result.resendInSeconds * 1000);
      setNow(Date.now());
      setCode('');
      setCodeError(null);
      setStep({ name: 'code', phone: value });
    },
    onError: toastError,
  });

  const verifyOtp = useMutation({
    mutationFn: ({ value, otp }: { value: string; otp: string }) => call(api.POST('/api/auth/otp/verify', { body: { phone: value, code: otp } })),
    onSuccess: (result, { value }) => {
      if (result.status === 'AUTHENTICATED' && result.auth) {
        clearReferralCode();
        finish(result.auth);
      } else if (result.registrationToken) {
        setStep({ name: 'register', phone: result.phone ?? value, token: result.registrationToken });
      }
    },
    onError: (error) => {
      setCode('');
      setCodeError(errorMessage(error));
    },
  });

  // Submit automatically once 6 digits are entered (also after SMS autofill).
  useEffect(() => {
    if (step.name === 'code' && code.length === 6 && !verifyOtp.isPending) {
      verifyOtp.mutate({ value: step.phone, otp: code });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (step.name === 'register') {
    return (
      <>
        <AuthHeader title="Nice to meet you!" subtitle="A few details so we can find the right group for you." onBack={() => setStep({ name: 'phone' })} />
        <RegistrationForm registrationToken={step.token} referralCode={referralCode} onDone={(tokens) => {
          clearReferralCode();
          applySession(tokens);
          router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/?welcome=1');
        }} />
      </>
    );
  }

  if (step.name === 'password') {
    return <PasswordLogin onBack={() => setStep({ name: 'phone' })} onDone={finish} />;
  }

  if (step.name === 'code') {
    const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
    return (
      <>
        <AuthHeader title="Enter the code" subtitle={<>We sent a 6-digit code to <span className="font-semibold text-ink">{step.phone}</span></>} onBack={() => setStep({ name: 'phone' })} />
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) verifyOtp.mutate({ value: step.phone, otp: code });
          }}
        >
          <OtpInput value={code} onChange={(v) => { setCode(v); setCodeError(null); }} autoFocus invalid={!!codeError} />
          {codeError && (
            <p className="text-sm font-medium text-danger-600" role="alert">
              {codeError}
            </p>
          )}
          {devCode && (
            <InlineAlert tone="info" icon={<MessageSquareText className="h-5 w-5" />} title="Development mode">
              SMS is not connected. Your code is <button type="button" className="font-mono font-bold underline" onClick={() => setCode(devCode)}>{devCode}</button>
            </InlineAlert>
          )}
          <Button type="submit" size="lg" block loading={verifyOtp.isPending} disabled={code.length !== 6}>
            Continue
          </Button>
          <div className="text-center text-sm">
            {wait > 0 ? (
              <span className="text-muted">Resend code in 0:{String(wait).padStart(2, '0')}</span>
            ) : (
              <button type="button" className="font-semibold text-brand-700" onClick={() => requestOtp.mutate(step.phone)} disabled={requestOtp.isPending}>
                Send a new code
              </button>
            )}
          </div>
        </form>
      </>
    );
  }

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    if (phoneDigitsComplete(phone)) requestOtp.mutate(phone);
  };

  return (
    <>
      <AuthHeader
        title={mode === 'register' ? 'Join Talk Club' : 'Welcome back'}
        subtitle={mode === 'register' ? 'Create your account with your phone number — it takes a minute.' : 'Sign in with your phone number. We will send you a code.'}
      />
      {referralCode && mode === 'register' && (
        <InlineAlert tone="zest" className="mb-5" title="You were invited by a friend 🎉">
          Your referral code <span className="font-semibold">{referralCode}</span> will be applied.
        </InlineAlert>
      )}
      <form onSubmit={submitPhone} className="space-y-5">
        <Field label="Phone number" htmlFor="phone">
          <PhoneInput id="phone" value={phone} onChange={setPhone} autoFocus />
        </Field>
        <Button type="submit" size="lg" block loading={requestOtp.isPending} disabled={!phoneDigitsComplete(phone)}>
          Get code
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-subtle">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <Button variant="outline" size="lg" block leftIcon={<KeyRound className="h-5 w-5" />} onClick={() => setStep({ name: 'password' })}>
        Sign in with password
      </Button>
      <p className="mt-auto pt-10 text-center text-sm text-muted">
        {mode === 'register' ? (
          <>
            Already a member?{' '}
            <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Talk Club?{' '}
            <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700">
              Create an account
            </Link>
          </>
        )}
      </p>
      <p className="mt-3 text-center text-xs text-subtle">
        By continuing you agree to the <Link href="/legal/TERMS" className="underline">Terms</Link> and{' '}
        <Link href="/legal/PRIVACY_POLICY" className="underline">Privacy Policy</Link>.
      </p>
    </>
  );
}

function PasswordLogin({ onBack, onDone }: { onBack: () => void; onDone: (tokens: AuthTokens) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => call(api.POST('/api/auth/login', { body: { login: login.trim(), password } })),
    onSuccess: onDone,
  });
  return (
    <>
      <AuthHeader title="Sign in" subtitle="Use your email or phone number and password." onBack={onBack} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Email or phone" htmlFor="login">
          <Input id="login" autoComplete="username" leftIcon={<Mail className="h-4 w-4" />} value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" leftIcon={<Lock className="h-4 w-4" />} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {mutation.error && (
          <InlineAlert tone="danger">
            {errorCode(mutation.error) === 'AUTH_INVALID_CREDENTIALS' ? 'Wrong login or password.' : errorMessage(mutation.error)}
          </InlineAlert>
        )}
        <Button type="submit" size="lg" block loading={mutation.isPending} disabled={!login || !password}>
          Sign in
        </Button>
        <p className="text-center text-sm">
          <Link href="/reset-password" className="font-semibold text-brand-700">
            Forgot password?
          </Link>
        </p>
      </form>
    </>
  );
}
