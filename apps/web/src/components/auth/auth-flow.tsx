'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, Lock, Mail, MessageSquareText, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Logo } from '@/components/icons';
import { Button, buttonClasses } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Field, Input, OtpInput, PhoneInput } from '@/components/ui/inputs';
import { toastError } from '@/components/ui/toast';
import { api, call, errorCode, errorMessage } from '@/lib/api/client';
import type { AuthTokens, SessionUser } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { phoneDigitsComplete } from '@/lib/format';
import { Rich, useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';
import { commonMessages } from '@/lib/i18n/messages/common';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { RegistrationForm } from './registration-form';
import { Turnstile } from './turnstile';
import { TwoFactorChallenge, twoFactorChallenge, TwoFactorStep } from './two-factor-step';

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

const bold = { b: (c: ReactNode) => <span className="font-semibold text-ink">{c}</span> };

function AuthHeader({ title, subtitle, onBack }: { title: string; subtitle?: ReactNode; onBack?: () => void }) {
  const t = useT(authMessages);
  const common = useT(commonMessages);
  return (
    <div className="pb-6 pt-5">
      <div className="flex h-11 items-center justify-between">
        {onBack ? (
          <button type="button" onClick={onBack} className="-ml-2 rounded-xl p-2 hover:bg-brand-50" aria-label={common.back}>
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link href="/" aria-label={t.homeLink}>
            <Logo />
          </Link>
        )}
        <LanguageSwitcher />
      </div>
      <h1 className="mt-6 font-display text-[28px] font-semibold leading-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
    </div>
  );
}

type OtpChannel = 'sms' | 'telegram';

type Step =
  | { name: 'phone' }
  | { name: 'telegram-link'; phone: string; botUrl: string | null }
  | { name: 'code'; phone: string; channel: OtpChannel }
  | { name: 'register'; phone: string; token: string }
  | { name: 'password' }
  | { name: 'two-factor'; challenge: TwoFactorChallenge };

/**
 * Phone-first sign-in: phone → code by SMS or Telegram → (new users) profile details.
 * Telegram needs a one-time link: the member shares their number with the bot.
 * The same flow serves /login and /register; returning members are simply
 * signed in when they verify their number.
 */
export function AuthFlow({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const { status, user, applySession } = useAuth();
  const t = useT(authMessages);
  const common = useT(commonMessages);
  const referralCode = useReferralCode();
  const [step, setStep] = useState<Step>({ name: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // Set when the API asks for a captcha; the pending request is retried with the token.
  const [captcha, setCaptcha] = useState<{ siteKey: string; retry: { value: string; channel?: OtpChannel } } | null>(null);

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

  const channels = useQuery({
    queryKey: ['public', 'otp-channels'],
    queryFn: () => call(api.GET('/api/auth/otp/channels')),
    staleTime: 5 * 60_000,
  });

  const requestOtp = useMutation({
    mutationFn: ({ value, channel, captchaToken }: { value: string; channel?: OtpChannel; captchaToken?: string }) =>
      call(api.POST('/api/auth/otp/request', { body: { phone: value, channel, captchaToken } })),
    onSuccess: (result, { value }) => {
      setCaptcha(null);
      setDevCode(result.devCode);
      setResendAt(Date.now() + result.resendInSeconds * 1000);
      setNow(Date.now());
      setCode('');
      setCodeError(null);
      setStep({ name: 'code', phone: value, channel: result.channel });
    },
    onError: (error, { value, channel }) => {
      const code = errorCode(error);
      if (code === 'AUTH_CAPTCHA_REQUIRED' || code === 'AUTH_CAPTCHA_INVALID') {
        const siteKey = (error as { details?: { siteKey?: string | null } }).details?.siteKey ?? channels.data?.captchaSiteKey;
        if (siteKey) {
          setCaptcha({ siteKey, retry: { value, channel } });
          return;
        }
      }
      if (code === 'AUTH_TELEGRAM_NOT_LINKED') {
        const details = (error as { details?: { botUrl?: string | null } }).details;
        setStep({ name: 'telegram-link', phone: value, botUrl: details?.botUrl ?? channels.data?.telegramBotUrl ?? null });
        return;
      }
      toastError(error);
    },
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
      const challenge = twoFactorChallenge(error);
      if (challenge) {
        setStep({ name: 'two-factor', challenge });
        return;
      }
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
        <AuthHeader title={t.niceToMeet} subtitle={t.niceToMeetSubtitle} onBack={() => setStep({ name: 'phone' })} />
        <RegistrationForm registrationToken={step.token} referralCode={referralCode} onDone={(tokens) => {
          clearReferralCode();
          applySession(tokens);
          router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/?welcome=1');
        }} />
      </>
    );
  }

  if (step.name === 'password') {
    return (
      <PasswordLogin
        onBack={() => setStep({ name: 'phone' })}
        onDone={finish}
        onTwoFactor={(challenge) => setStep({ name: 'two-factor', challenge })}
      />
    );
  }

  if (step.name === 'two-factor') {
    return <TwoFactorStep challenge={step.challenge} onBack={() => setStep({ name: 'phone' })} onDone={finish} />;
  }

  const captchaPanel = captcha && (
    <div className="mb-5 rounded-2xl border border-line bg-white p-4">
      <p className="mb-3 text-center text-sm font-medium text-ink">{t.notRobot}</p>
      <Turnstile
        siteKey={captcha.siteKey}
        onToken={(token) => requestOtp.mutate({ ...captcha.retry, captchaToken: token })}
      />
    </div>
  );

  if (step.name === 'telegram-link') {
    return (
      <>
        <AuthHeader title={t.telegramTitle} subtitle={t.telegramSubtitle} onBack={() => setStep({ name: 'phone' })} />
        <ol className="mb-6 list-decimal space-y-2 pl-5 text-[15px] text-ink">
          {[t.telegramStep1, t.telegramStep2, t.telegramStep3].map((text) => (
            <li key={text}>
              <Rich text={text} tags={bold} />
            </li>
          ))}
        </ol>
        {captchaPanel}
        <div className="space-y-3">
          {step.botUrl && (
            <a href={step.botUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses('outline', 'lg', 'w-full gap-2')}>
              <Send className="h-5 w-5" /> {t.openTelegram}
            </a>
          )}
          <Button size="lg" block loading={requestOtp.isPending} onClick={() => requestOtp.mutate({ value: step.phone, channel: 'telegram' })}>
            {t.sendCode}
          </Button>
          {channels.data?.sms && (
            <Button variant="ghost" size="lg" block disabled={requestOtp.isPending} onClick={() => requestOtp.mutate({ value: step.phone, channel: 'sms' })}>
              {t.smsInstead}
            </Button>
          )}
        </div>
      </>
    );
  }

  if (step.name === 'code') {
    const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
    const sentTo = step.channel === 'telegram' ? t.codeSentTelegram(step.phone) : t.codeSentSms(step.phone);
    return (
      <>
        <AuthHeader title={t.enterCode} subtitle={<Rich text={sentTo} tags={bold} />} onBack={() => setStep({ name: 'phone' })} />
        {captchaPanel}
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
            <InlineAlert tone="info" icon={<MessageSquareText className="h-5 w-5" />} title={t.devMode}>
              {t.devCode} <button type="button" className="font-mono font-bold underline" onClick={() => setCode(devCode)}>{devCode}</button>
            </InlineAlert>
          )}
          <Button type="submit" size="lg" block loading={verifyOtp.isPending} disabled={code.length !== 6}>
            {common.continue}
          </Button>
          <div className="text-center text-sm">
            {wait > 0 ? (
              <span className="text-muted">{t.resendIn(`0:${String(wait).padStart(2, '0')}`)}</span>
            ) : (
              <button type="button" className="font-semibold text-brand-700" onClick={() => requestOtp.mutate({ value: step.phone, channel: step.channel })} disabled={requestOtp.isPending}>
                {t.sendNewCode}
              </button>
            )}
          </div>
        </form>
      </>
    );
  }

  // Telegram first when the bot is connected (free and instant); SMS as the alternative.
  const preferred: OtpChannel | undefined = channels.data?.telegram ? 'telegram' : channels.data?.sms ? 'sms' : undefined;
  const alternative: OtpChannel | undefined = preferred === 'telegram' && channels.data?.sms ? 'sms' : undefined;

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    if (phoneDigitsComplete(phone)) requestOtp.mutate({ value: phone, channel: preferred });
  };

  return (
    <>
      <AuthHeader
        title={mode === 'register' ? t.join : t.welcomeBack}
        subtitle={mode === 'register' ? t.joinSubtitle : t.welcomeBackSubtitle}
      />
      {referralCode && mode === 'register' && (
        <InlineAlert tone="zest" className="mb-5" title={t.invitedTitle}>
          <Rich text={t.invitedBody(referralCode)} tags={bold} />
        </InlineAlert>
      )}
      {captchaPanel}
      <form onSubmit={submitPhone} className="space-y-5">
        <Field label={t.phone} htmlFor="phone">
          <PhoneInput id="phone" value={phone} onChange={setPhone} autoFocus />
        </Field>
        <Button
          type="submit"
          size="lg"
          block
          leftIcon={preferred === 'telegram' ? <Send className="h-5 w-5" /> : undefined}
          loading={requestOtp.isPending && requestOtp.variables?.channel === preferred}
          disabled={!phoneDigitsComplete(phone) || requestOtp.isPending}
        >
          {preferred === 'telegram' ? t.getCodeTelegram : t.getCode}
        </Button>
        {alternative && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            block
            leftIcon={<MessageSquareText className="h-5 w-5" />}
            loading={requestOtp.isPending && requestOtp.variables?.channel === alternative}
            disabled={!phoneDigitsComplete(phone) || requestOtp.isPending}
            onClick={() => requestOtp.mutate({ value: phone, channel: alternative })}
          >
            {t.getCodeSms}
          </Button>
        )}
      </form>
      <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-subtle">
        <span className="h-px flex-1 bg-line" /> {t.or} <span className="h-px flex-1 bg-line" />
      </div>
      <Button variant="outline" size="lg" block leftIcon={<KeyRound className="h-5 w-5" />} onClick={() => setStep({ name: 'password' })}>
        {t.signInWithPassword}
      </Button>
      <p className="mt-auto pt-10 text-center text-sm text-muted">
        {mode === 'register' ? (
          <>
            {t.alreadyMember}{' '}
            <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700">
              {t.signIn}
            </Link>
          </>
        ) : (
          <>
            {t.newHere}{' '}
            <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700">
              {t.createAccount}
            </Link>
          </>
        )}
      </p>
      <p className="mt-3 text-center text-xs text-subtle">
        <Rich
          text={t.agreement}
          tags={{
            terms: (c) => (
              <Link href="/legal/TERMS" className="underline">
                {c}
              </Link>
            ),
            privacy: (c) => (
              <Link href="/legal/PRIVACY_POLICY" className="underline">
                {c}
              </Link>
            ),
          }}
        />
      </p>
    </>
  );
}

function PasswordLogin({
  onBack,
  onDone,
  onTwoFactor,
}: {
  onBack: () => void;
  onDone: (tokens: AuthTokens) => void;
  onTwoFactor: (challenge: TwoFactorChallenge) => void;
}) {
  const t = useT(authMessages);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => call(api.POST('/api/auth/login', { body: { login: login.trim(), password } })),
    onSuccess: onDone,
    onError: (error) => {
      const challenge = twoFactorChallenge(error);
      if (challenge) onTwoFactor(challenge);
    },
  });
  const shownError = mutation.error && !twoFactorChallenge(mutation.error) ? mutation.error : null;
  return (
    <>
      <AuthHeader title={t.passwordTitle} subtitle={t.passwordSubtitle} onBack={onBack} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label={t.login} htmlFor="login">
          <Input id="login" autoComplete="username" leftIcon={<Mail className="h-4 w-4" />} value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required />
        </Field>
        <Field label={t.password} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" leftIcon={<Lock className="h-4 w-4" />} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {shownError && (
          <InlineAlert tone="danger">
            {errorCode(shownError) === 'AUTH_INVALID_CREDENTIALS' ? t.wrongPassword : errorMessage(shownError)}
          </InlineAlert>
        )}
        <Button type="submit" size="lg" block loading={mutation.isPending} disabled={!login || !password}>
          {t.signIn}
        </Button>
        <p className="text-center text-sm">
          <Link href="/reset-password" className="font-semibold text-brand-700">
            {t.forgotPassword}
          </Link>
        </p>
      </form>
    </>
  );
}
