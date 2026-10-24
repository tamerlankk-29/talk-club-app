'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Copy, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Field, Input, OtpInput } from '@/components/ui/inputs';
import { api, ApiError, call, errorMessage } from '@/lib/api/client';
import type { AuthTokens } from '@/lib/api/types';

/** What the API sends with AUTH_TOTP_REQUIRED / AUTH_TOTP_SETUP_REQUIRED. */
export interface TwoFactorChallenge {
  challengeToken: string;
  /** Only for setup: the secret for manual entry and the otpauth:// URL for the QR code. */
  secret?: string;
  otpauthUrl?: string;
}

/** Reads the 2FA challenge from a sign-in error, or null when the error is something else. */
export function twoFactorChallenge(error: unknown): TwoFactorChallenge | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== 'AUTH_TOTP_REQUIRED' && error.code !== 'AUTH_TOTP_SETUP_REQUIRED') return null;
  const details = error.details as Partial<TwoFactorChallenge> | undefined;
  return details?.challengeToken ? (details as TwoFactorChallenge) : null;
}

/**
 * Second sign-in step for owners and admins: set up an authenticator app (QR code,
 * then recovery codes shown once) or enter the app's current code.
 */
export function TwoFactorStep({ challenge, onBack, onDone }: { challenge: TwoFactorChallenge; onBack: () => void; onDone: (tokens: AuthTokens) => void }) {
  const setup = !!challenge.secret;
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ tokens: AuthTokens; recoveryCodes: string[] } | null>(null);

  useEffect(() => {
    if (!challenge.otpauthUrl) return;
    QRCode.toDataURL(challenge.otpauthUrl, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [challenge.otpauthUrl]);

  const verify = useMutation({
    mutationFn: (value: string) => call(api.POST('/api/auth/totp/verify', { body: { challengeToken: challenge.challengeToken, code: value } })),
    onSuccess: (result) => {
      if (result.recoveryCodes?.length) setSaved({ tokens: result, recoveryCodes: result.recoveryCodes });
      else onDone(result);
    },
    onError: () => setCode(''),
  });

  // Submit as soon as six digits are in.
  useEffect(() => {
    if (!useRecovery && code.length === 6 && !verify.isPending) verify.mutate(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (saved) {
    return (
      <>
        <Header title="Save your recovery codes" subtitle="Each code signs you in once if you lose your phone. Keep them somewhere safe — they won't be shown again." />
        <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-white p-4 font-mono text-[15px]">
          {saved.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="mt-5 space-y-3">
          <Button
            variant="outline"
            size="lg"
            block
            leftIcon={<Copy className="h-5 w-5" />}
            onClick={() => void navigator.clipboard?.writeText(saved.recoveryCodes.join('\n'))}
          >
            Copy codes
          </Button>
          <Button size="lg" block onClick={() => onDone(saved.tokens)}>
            I saved them — continue
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        onBack={onBack}
        title={setup ? 'Protect your account' : 'Two-factor sign-in'}
        subtitle={
          setup
            ? 'Your role needs a second step at sign-in. Scan the QR code with Google Authenticator (or any authenticator app) and enter the 6-digit code.'
            : 'Enter the 6-digit code from your authenticator app.'
        }
      />
      {setup && (
        <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-4">
          {qr ? <img src={qr} alt="QR code for the authenticator app" width={220} height={220} /> : <div className="h-[220px] w-[220px]" />}
          <p className="text-center text-xs text-muted">
            Can't scan? Enter this key: <span className="break-all font-mono font-semibold text-ink">{challenge.secret?.replace(/(.{4})/g, '$1 ').trim()}</span>
          </p>
        </div>
      )}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (code) verify.mutate(code);
        }}
      >
        {useRecovery ? (
          <Field label="Recovery code" htmlFor="recovery">
            <Input id="recovery" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoFocus placeholder="xxxx-xxxx" />
          </Field>
        ) : (
          <OtpInput value={code} onChange={setCode} autoFocus invalid={!!verify.error} />
        )}
        {verify.error && <InlineAlert tone="danger">{errorMessage(verify.error)}</InlineAlert>}
        <Button type="submit" size="lg" block loading={verify.isPending} disabled={useRecovery ? code.trim().length < 8 : code.length !== 6}>
          {setup ? 'Turn on and sign in' : 'Sign in'}
        </Button>
        {!setup && (
          <button
            type="button"
            className="block w-full text-center text-sm font-semibold text-brand-700"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setCode('');
            }}
          >
            {useRecovery ? 'Use the authenticator app' : 'Lost your phone? Use a recovery code'}
          </button>
        )}
      </form>
    </>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) {
  return (
    <div className="pb-6 pt-5">
      <div className="flex h-11 items-center">
        {onBack ? (
          <button type="button" onClick={onBack} className="-ml-2 rounded-xl p-2 hover:bg-brand-50" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <ShieldCheck className="h-7 w-7 text-brand-700" />
        )}
      </div>
      <h1 className="mt-6 font-display text-[28px] font-semibold leading-tight">{title}</h1>
      <p className="mt-2 text-[15px] text-muted">{subtitle}</p>
    </div>
  );
}
