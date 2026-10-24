'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Checkbox, ChipGroup, Field, Input, Select } from '@/components/ui/inputs';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import type { AuthTokens, S } from '@/lib/api/types';
import { useLeadSources, useLevels } from '@/lib/queries';
import { Rich, useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';
import { FORMAT_LABELS, TIME_OF_DAY_LABELS, WEEKDAYS_SHORT } from '@/lib/utils';

type TimeOfDay = S<'TimeOfDay'>;
type FormatPreference = S<'FormatPreference'>;


export function RegistrationForm({
  registrationToken,
  referralCode,
  onDone,
}: {
  registrationToken: string;
  referralCode?: string;
  onDone: (tokens: AuthTokens) => void;
}) {
  const t = useT(authMessages);
  const DAY_OPTIONS = [1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }));
  const TIME_OPTIONS = (['MORNING', 'AFTERNOON', 'EVENING'] as const).map((v) => ({ value: v, label: TIME_OF_DAY_LABELS[v] }));
  const FORMAT_OPTIONS = (['OFFLINE', 'ONLINE', 'ANY'] as const).map((f) => ({ value: f, label: FORMAT_LABELS[f] }));
  const { data: levels } = useLevels();
  const { data: sources } = useLeadSources();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [levelId, setLevelId] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [times, setTimes] = useState<TimeOfDay[]>([]);
  const [format, setFormat] = useState<FormatPreference>('OFFLINE');
  const [sourceCode, setSourceCode] = useState(referralCode ? 'REFERRAL' : '');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const register = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/auth/register', {
          body: {
            registrationToken,
            firstName: firstName.trim(),
            lastName: lastName.trim() || undefined,
            email: email.trim() || undefined,
            levelId: levelId || undefined,
            preferredDays: days,
            preferredTimes: times,
            formatPreference: format,
            sourceCode: sourceCode || undefined,
            referralCode,
            acceptTerms,
            marketingConsent: marketing,
          },
        }),
      ),
    onSuccess: onDone,
  });
  const errors = fieldErrors(register.error);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        register.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.firstName} required htmlFor="firstName" error={errors.firstName}>
          <Input id="firstName" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={60} autoFocus />
        </Field>
        <Field label={t.lastName} htmlFor="lastName" error={errors.lastName}>
          <Input id="lastName" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} />
        </Field>
      </div>
      <Field label={t.email} hint={t.emailHint} htmlFor="email" error={errors.email}>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
      </Field>
      <Field label={t.level} hint={t.levelHint} htmlFor="level">
        <Select id="level" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          <option value="">{t.levelUnsure}</option>
          {levels?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.days}>
        <ChipGroup options={DAY_OPTIONS} value={days} onChange={(v) => setDays(v as number[])} multiple size="sm" />
      </Field>
      <Field label={t.time}>
        <ChipGroup options={TIME_OPTIONS} value={times} onChange={(v) => setTimes(v as TimeOfDay[])} multiple size="sm" />
      </Field>
      <Field label={t.format}>
        <ChipGroup options={FORMAT_OPTIONS} value={format} onChange={(v) => setFormat(v as FormatPreference)} size="sm" />
      </Field>
      <Field label={t.source} htmlFor="source">
        <Select id="source" value={sourceCode} onChange={(e) => setSourceCode(e.target.value)}>
          <option value="">{t.choose}</option>
          {sources?.map((s) => (
            <option key={s.id} value={s.code}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-line">
        <Checkbox
          checked={acceptTerms}
          onChange={setAcceptTerms}
          label={
            <Rich
              text={t.acceptTerms}
              tags={{
                terms: (c) => (
                  <Link href="/legal/TERMS" target="_blank" className="font-semibold text-brand-700 underline">
                    {c}
                  </Link>
                ),
                privacy: (c) => (
                  <Link href="/legal/PRIVACY_POLICY" target="_blank" className="font-semibold text-brand-700 underline">
                    {c}
                  </Link>
                ),
              }}
            />
          }
        />
        <Checkbox checked={marketing} onChange={setMarketing} label={t.marketing} description={t.marketingHint} />
      </div>
      {register.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(register.error)}</InlineAlert>}
      <Button type="submit" size="lg" block loading={register.isPending} disabled={!firstName.trim() || !acceptTerms}>
        {t.create}
      </Button>
    </form>
  );
}
