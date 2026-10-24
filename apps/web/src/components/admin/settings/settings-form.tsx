'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/inputs';
import { Card } from '@/components/ui/layout';
import { toast } from '@/components/ui/toast';
import { ApiError, api, call, errorMessage } from '@/lib/api/client';
import { adminKeys } from '@/lib/admin-queries';

export type SettingsGroups = Record<string, Record<string, unknown>>;

export type FieldSpec =
  | { key: string; label: string; type: 'text' | 'textarea' | 'time' | 'color'; hint?: string; placeholder?: string }
  | { key: string; label: string; type: 'number'; hint?: string; min?: number; max?: number; suffix?: string }
  | { key: string; label: string; type: 'boolean'; hint?: string }
  | { key: string; label: string; type: 'select'; hint?: string; options: Array<{ value: string; label: string }> }
  | { key: string; label: string; type: 'numbers'; hint?: string };

/** Reads/writes a dotted path ("adminAlerts.noShow") inside a settings group. */
function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}
function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  if (!rest.length) return { ...obj, [head]: value };
  return { ...obj, [head]: setPath((obj[head] as Record<string, unknown>) ?? {}, rest.join('.'), value) };
}

function issues(error: unknown): Array<{ path: string; message: string }> {
  if (!(error instanceof ApiError) || error.code !== 'SETTINGS_INVALID') return [];
  return ((error.details as { issues?: Array<{ path: string; message: string }> } | undefined)?.issues ?? []) as Array<{ path: string; message: string }>;
}

/** One settings group rendered from a field spec; saves the whole group (validated server-side). */
export function SettingsGroupForm({
  group,
  value,
  fields,
  title,
  description,
  extra,
}: {
  group: string;
  value: Record<string, unknown>;
  fields: FieldSpec[];
  title?: string;
  description?: ReactNode;
  extra?: ReactNode;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(value);
  const [base, setBase] = useState(value);
  if (base !== value) {
    setBase(value);
    setDraft(value);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const save = useMutation({
    mutationFn: () => call(api.PATCH('/api/admin/settings/{key}', { params: { path: { key: group } }, body: draft })),
    onSuccess: async (saved) => {
      qc.setQueryData<SettingsGroups>(adminKeys.settings, (all) => (all ? { ...all, [group]: saved as Record<string, unknown> } : all));
      await qc.invalidateQueries({ queryKey: ['public', 'club'] });
      toast.success('Settings saved.');
    },
  });
  const problems = issues(save.error);

  return (
    <Card className="space-y-5">
      {(title || description) && (
        <div>
          {title && <h3 className="font-display text-lg font-semibold">{title}</h3>}
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => {
          const v = getPath(draft, f.key);
          const error = problems.find((p) => p.path === f.key)?.message;
          const set = (next: unknown) => setDraft((d) => setPath(d, f.key, next));
          if (f.type === 'boolean') {
            return (
              <div key={f.key} className="md:col-span-2">
                <Switch checked={!!v} onChange={set} label={f.label} description={f.hint} />
              </div>
            );
          }
          return (
            <Field key={f.key} label={f.label} hint={f.hint} error={error} htmlFor={`s-${group}-${f.key}`} className={f.type === 'textarea' ? 'md:col-span-2' : undefined}>
              {f.type === 'select' ? (
                <Select id={`s-${group}-${f.key}`} value={String(v ?? '')} onChange={(e) => set(e.target.value)}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === 'number' ? (
                <div className="relative">
                  <Input id={`s-${group}-${f.key}`} type="number" min={f.min} max={f.max} value={String(v ?? '')} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} className={f.suffix ? 'pr-20' : undefined} />
                  {f.suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{f.suffix}</span>}
                </div>
              ) : f.type === 'numbers' ? (
                <Input
                  id={`s-${group}-${f.key}`}
                  value={Array.isArray(v) ? (v as number[]).join(', ') : ''}
                  onChange={(e) =>
                    set(
                      e.target.value
                        .split(/[,\s]+/)
                        .filter(Boolean)
                        .map(Number)
                        .filter((n) => !Number.isNaN(n)),
                    )
                  }
                  placeholder="1440, 120"
                />
              ) : f.type === 'textarea' ? (
                <Textarea id={`s-${group}-${f.key}`} rows={3} value={String(v ?? '')} onChange={(e) => set(e.target.value)} />
              ) : f.type === 'color' ? (
                <div className="flex gap-2">
                  <input type="color" value={String(v ?? '#6d28d9')} onChange={(e) => set(e.target.value)} className="h-12 w-14 cursor-pointer rounded-xl border border-line bg-white p-1" aria-label={f.label} />
                  <Input id={`s-${group}-${f.key}`} value={String(v ?? '')} onChange={(e) => set(e.target.value)} />
                </div>
              ) : (
                <Input id={`s-${group}-${f.key}`} type={f.type === 'time' ? 'time' : 'text'} value={String(v ?? '')} onChange={(e) => set(e.target.value)} placeholder={'placeholder' in f ? f.placeholder : undefined} />
              )}
            </Field>
          );
        })}
      </div>
      {extra}
      {save.error && !problems.length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      {problems.length > 0 && !problems.some((p) => fields.some((f) => f.key === p.path)) && <InlineAlert tone="danger">{problems.map((p) => `${p.path}: ${p.message}`).join('; ')}</InlineAlert>}
      <div className="flex justify-end gap-2">
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(value)}>
            Discard
          </Button>
        )}
        <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </Card>
  );
}
