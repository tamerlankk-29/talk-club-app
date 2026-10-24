'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { PartyPopper } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SessionCard } from '@/components/client/session-card';
import { Button, buttonClasses } from '@/components/ui/button';
import { InlineAlert, SkeletonList } from '@/components/ui/feedback';
import { ChipGroup, Field, Input, PhoneInput, Select, Textarea } from '@/components/ui/inputs';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { Rich, useT } from '@/lib/i18n';
import { trialMessages } from '@/lib/i18n/messages/club';
import { fmt, phoneDigitsComplete } from '@/lib/format';
import { keys, useClub, useLeadSources, useLevels } from '@/lib/queries';
import { TIME_OF_DAY_LABELS, WEEKDAYS_SHORT } from '@/lib/utils';

type TimeOfDay = S<'TimeOfDay'>;

export default function TrialPage() {
  const t = useT(trialMessages);
  const { status, user, actingClientId } = useAuth();
  const { data: club } = useClub();
  const trial = club?.policies.trial;
  const isClient = status === 'authenticated' && !!(user?.client || actingClientId);

  return (
    <div className="space-y-5 pt-5">
      <PageHeader back title={t.title} subtitle={trial ? t.subtitle(fmt.money(trial.price)) : undefined} />
      {trial && !trial.enabled ? (
        <InlineAlert tone="info">{t.unavailable}</InlineAlert>
      ) : isClient && trial?.selfBooking ? (
        <TrialSessions />
      ) : (
        <>
          {trial?.selfBooking && status === 'anonymous' && (
            <InlineAlert tone="brand" action={<Link href="/register?next=/trial" className={buttonClasses('primary', 'sm')}>{t.createAccount}</Link>}>
              {t.createAccountText}
            </InlineAlert>
          )}
          <TrialRequestForm />
        </>
      )}
    </div>
  );
}

function TrialSessions() {
  const t = useT(trialMessages);
  const query = useQuery({
    queryKey: keys.sessions({ trial: true }),
    queryFn: () => call(api.GET('/api/sessions', { params: { query: { availableOnly: true } } })),
  });
  const trialable = (query.data ?? []).filter((s) => s.bookability?.canBookTrial);
  return (
    <Section title={t.chooseFirst} description={t.chooseFirstText}>
      {query.isLoading ? (
        <SkeletonList count={3} />
      ) : trialable.length ? (
        <div className="space-y-3">
          {trialable.slice(0, 15).map((s) => (
            <SessionCard key={s.id} session={s} showDate />
          ))}
        </div>
      ) : (
        <InlineAlert tone="info">
          {query.data?.some((s) => s.bookability?.reason === 'BOOKING_TRIAL_ALREADY_USED')
            ? t.alreadyUsed
            : t.noneOpen}
        </InlineAlert>
      )}
    </Section>
  );
}

function TrialRequestForm() {
  const t = useT(trialMessages);
  const { data: levels } = useLevels();
  const { data: sources } = useLeadSources();
  const [form, setForm] = useState({ name: '', phone: '', levelId: '', days: [] as number[], times: [] as TimeOfDay[], comment: '', sourceCode: '' });
  const submit = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/public/trial-requests', {
          body: {
            name: form.name.trim(),
            phone: form.phone,
            levelId: form.levelId || undefined,
            preferredDays: form.days,
            preferredTimes: form.times,
            comment: form.comment.trim() || undefined,
            sourceCode: form.sourceCode || undefined,
          },
        }),
      ),
  });
  const errors = fieldErrors(submit.error);

  if (submit.isSuccess) {
    return (
      <Card className="py-10 text-center">
        <PartyPopper className="mx-auto h-12 w-12 animate-pop text-brand-700" />
        <p className="mt-4 font-display text-xl font-semibold">{t.received}</p>
        <p className="mt-2 text-sm text-muted">{t.receivedText}</p>
        <Link href="/schedule" className={buttonClasses('outline', 'md', 'mt-6')}>
          {t.browseSchedule}
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Field label={t.name} required htmlFor="t-name" error={errors.name}>
          <Input id="t-name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
        </Field>
        <Field label={t.phone} required htmlFor="t-phone" error={errors.phone}>
          <PhoneInput id="t-phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
        </Field>
        <Field label={t.level} htmlFor="t-level">
          <Select id="t-level" value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })}>
            <option value="">{t.notSure}</option>
            {levels?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.days}>
          <ChipGroup size="sm" multiple options={[1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }))} value={form.days} onChange={(v) => setForm({ ...form, days: v as number[] })} />
        </Field>
        <Field label={t.time}>
          <ChipGroup
            size="sm"
            multiple
            options={(['AFTERNOON', 'EVENING'] as const).map((tod) => ({ value: tod, label: TIME_OF_DAY_LABELS[tod] }))}
            value={form.times}
            onChange={(v) => setForm({ ...form, times: v as TimeOfDay[] })}
          />
        </Field>
        <Field label={t.source} htmlFor="t-source">
          <Select id="t-source" value={form.sourceCode} onChange={(e) => setForm({ ...form, sourceCode: e.target.value })}>
            <option value="">{t.choose}</option>
            {sources?.map((s) => (
              <option key={s.id} value={s.code}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.comment} htmlFor="t-comment">
          <Textarea id="t-comment" rows={3} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} maxLength={500} />
        </Field>
        {submit.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(submit.error)}</InlineAlert>}
        <Button type="submit" size="lg" block loading={submit.isPending} disabled={!form.name.trim() || !phoneDigitsComplete(form.phone)}>
          {t.submit}
        </Button>
        <p className="text-center text-xs text-muted">
          <Rich
            text={t.consent}
            tags={{
              a: (c) => (
                <Link href="/legal/PRIVACY_POLICY" className="underline">
                  {c}
                </Link>
              ),
            }}
          />
        </p>
      </form>
    </Card>
  );
}
