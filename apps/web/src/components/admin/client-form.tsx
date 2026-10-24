'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Checkbox, ChipGroup, Field, Input, PhoneInput, Select, Textarea } from '@/components/ui/inputs';
import { Drawer } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminLevels, useAdminSources } from '@/lib/admin-queries';
import { fmt, phoneDigitsComplete } from '@/lib/format';
import { CATEGORY_LABELS, FORMAT_LABELS, TIME_OF_DAY_LABELS, WEEKDAYS_SHORT } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { clientsMessages } from '@/lib/i18n/messages/admin/clients';

type ClientDetail = S<'ClientDetailDto'>;
type Category = S<'ClientCategory'>;
type TimeOfDay = S<'TimeOfDay'>;
type Format = S<'FormatPreference'>;

interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
  category: Category;
  levelId: string;
  levelReason: string;
  sourceId: string;
  preferredDays: number[];
  preferredTimes: TimeOfDay[];
  formatPreference: Format;
  notes: string;
  marketingConsent: boolean;
}

function initial(client?: ClientDetail): FormState {
  const p = client?.profile;
  return {
    firstName: p?.firstName ?? '',
    lastName: p?.lastName ?? '',
    phone: p?.phone ? fmt.phone(p.phone) : '',
    email: p?.email ?? '',
    birthDate: p?.birthDate ?? '',
    category: (p?.category as Category) ?? 'ADULT',
    levelId: p?.level?.id ?? '',
    levelReason: '',
    sourceId: '',
    preferredDays: p?.preferredDays ?? [],
    preferredTimes: (p?.preferredTimes as TimeOfDay[]) ?? [],
    formatPreference: (p?.formatPreference as Format) ?? 'OFFLINE',
    notes: client?.notes ?? '',
    marketingConsent: p?.marketingConsent ?? false,
  };
}

/** Create or edit a client (admin). */
export function ClientFormDrawer({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: ClientDetail;
  onSaved?: (client: ClientDetail) => void;
}) {
  const tr = useT(clientsMessages);
  const qc = useQueryClient();
  const { data: levels } = useAdminLevels();
  const { data: sources } = useAdminSources();
  const [form, setForm] = useState<FormState>(() => initial(client));
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setForm(initial(client));
  }
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const levelChanged = !!client && form.levelId !== (client.profile.level?.id ?? '');
  const phonePartial = form.phone.replace(/\D/g, '').length > 1 && !phoneDigitsComplete(form.phone);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        phone: phoneDigitsComplete(form.phone) ? form.phone.replace(/\s/g, '') : undefined,
        email: form.email.trim() || undefined,
        birthDate: form.birthDate || undefined,
        category: form.category,
        levelId: form.levelId || undefined,
        preferredDays: form.preferredDays,
        preferredTimes: form.preferredTimes,
        formatPreference: form.formatPreference,
        notes: form.notes.trim() || undefined,
        marketingConsent: form.marketingConsent,
      };
      if (client) {
        return call(
          api.PATCH('/api/admin/clients/{id}', {
            params: { path: { id: client.profile.id } },
            body: { ...body, levelReason: levelChanged ? form.levelReason.trim() || undefined : undefined },
          }),
        );
      }
      return call(api.POST('/api/admin/clients', { body: { ...body, sourceId: form.sourceId || undefined } }));
    },
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'clients'] });
      qc.setQueryData(['admin', 'client', saved.profile.id], saved);
      toast.success(client ? tr.clientUpdated : tr.clientCreated);
      onOpenChange(false);
      onSaved?.(saved);
    },
  });
  const errors = fieldErrors(save.error);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={client ? tr.editName(client.profile.fullName) : tr.newClient}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!form.firstName.trim() || phonePartial} onClick={() => save.mutate()}>
            {client ? tr.saveChanges : tr.createClient}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr.firstName} required htmlFor="cf-first" error={errors.firstName}>
            <Input id="cf-first" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} maxLength={60} />
          </Field>
          <Field label={tr.lastName} htmlFor="cf-last" error={errors.lastName}>
            <Input id="cf-last" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} maxLength={60} />
          </Field>
          <Field label={tr.phone} htmlFor="cf-phone" error={errors.phone ?? (phonePartial ? tr.enterFullNumber : null)} hint={tr.clientCanSignNumber}>
            <PhoneInput id="cf-phone" value={form.phone} onChange={(v) => set('phone', v)} />
          </Field>
          <Field label={tr.email} htmlFor="cf-email" error={errors.email}>
            <Input id="cf-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label={tr.dateBirth} htmlFor="cf-birth" error={errors.birthDate}>
            <Input id="cf-birth" type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
          </Field>
          <Field label={tr.category} htmlFor="cf-cat">
            <Select id="cf-cat" value={form.category} onChange={(e) => set('category', e.target.value as Category)}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.level} htmlFor="cf-level">
            <Select id="cf-level" value={form.levelId} onChange={(e) => set('levelId', e.target.value)}>
              <option value="">{tr.notSet}</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          {client ? (
            levelChanged && (
              <Field label={tr.reasonLevelChange} htmlFor="cf-lr" hint={tr.shownClientsLevelHistory}>
                <Input id="cf-lr" value={form.levelReason} onChange={(e) => set('levelReason', e.target.value)} placeholder={tr.eGPlacementAfter} />
              </Field>
            )
          ) : (
            <Field label={tr.leadSource} htmlFor="cf-src">
              <Select id="cf-src" value={form.sourceId} onChange={(e) => set('sourceId', e.target.value)}>
                <option value="">{tr.unknown}</option>
                {sources?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label={tr.preferredDays}>
          <ChipGroup size="sm" multiple options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] }))} value={form.preferredDays} onChange={(v) => set('preferredDays', v as number[])} />
        </Field>
        <Field label={tr.preferredTime}>
          <ChipGroup
            size="sm"
            multiple
            options={(['MORNING', 'AFTERNOON', 'EVENING'] as const).map((t) => ({ value: t, label: TIME_OF_DAY_LABELS[t] }))}
            value={form.preferredTimes}
            onChange={(v) => set('preferredTimes', v as TimeOfDay[])}
          />
        </Field>
        <Field label={tr.format}>
          <ChipGroup size="sm" options={(['OFFLINE', 'ONLINE', 'ANY'] as const).map((f) => ({ value: f, label: FORMAT_LABELS[f] }))} value={form.formatPreference} onChange={(v) => set('formatPreference', v as Format)} />
        </Field>
        <Field label={tr.internalNotes} htmlFor="cf-notes" hint={tr.visibleStaffOnly}>
          <Textarea id="cf-notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} />
        </Field>
        <Checkbox checked={form.marketingConsent} onChange={(v) => set('marketingConsent', v)} label={tr.agreedReceiveMarketingMessages} description={tr.onlyTickIfClient} />
        {save.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}
