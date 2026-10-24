'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChipGroup, Input, Select } from '@/components/ui/inputs';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys, useAdminLevels, useAdminSources, useAdminTags, useAdminTeachers } from '@/lib/admin-queries';
import { CATEGORY_LABELS, FORMAT_LABELS } from '@/lib/utils';

type Field = S<'SegmentFieldDto'>;
export interface Rule {
  field: string;
  op: string;
  value: unknown;
}
export interface Definition {
  [key: string]: unknown;
  match: 'all' | 'any';
  rules: Rule[];
}

const OP_LABELS: Record<string, string> = { eq: 'is', lte: 'at most', gte: 'at least', in: 'is one of' };

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New lead',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  TRIAL_BOOKED: 'Trial booked',
  TRIAL_ATTENDED: 'Trial attended',
  MEMBERSHIP_PURCHASED: 'Membership purchased',
  ACTIVE_CLIENT: 'Active client',
  MEMBERSHIP_EXPIRING: 'Membership expiring',
  RENEWED: 'Renewed',
  INACTIVE: 'Inactive',
  LOST: 'Lost',
};

const ENUM_LABELS: Record<string, string> = { ...CATEGORY_LABELS, ...FORMAT_LABELS, ...STAGE_LABELS, ACTIVE: 'Active', NONE: 'Never had one', EXPIRED: 'Expired' };

export function useSegmentFields() {
  return useQuery({ queryKey: adminKeys.segmentFields, queryFn: () => call(api.GET('/api/admin/segments/fields')), staleTime: Infinity });
}

function defaultValue(f: Field): unknown {
  if (f.valueType === 'boolean') return true;
  if (f.valueType === 'number') return 7;
  if (f.valueType.startsWith('enum:')) return f.valueType.slice(5).split(',')[0];
  return [];
}

function ValueInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const { data: levels } = useAdminLevels();
  const { data: teachers } = useAdminTeachers();
  const { data: tags } = useAdminTags();
  const { data: sources } = useAdminSources();
  const t = field.valueType;
  if (t === 'boolean') {
    return (
      <Select value={value ? 'true' : 'false'} onChange={(e) => onChange(e.target.value === 'true')} className="h-10" aria-label="Value">
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    );
  }
  if (t === 'number') {
    return <Input type="number" min={0} value={String(value ?? '')} onChange={(e) => onChange(Number(e.target.value))} className="h-10 w-28" aria-label="Value" />;
  }
  if (t.startsWith('enum:')) {
    return (
      <Select value={String(value)} onChange={(e) => onChange(e.target.value)} className="h-10" aria-label="Value">
        {t
          .slice(5)
          .split(',')
          .map((v) => (
            <option key={v} value={v}>
              {ENUM_LABELS[v] ?? v}
            </option>
          ))}
      </Select>
    );
  }
  const options: Array<{ value: string; label: string }> = t.startsWith('enum[]:')
    ? t
        .slice(7)
        .split(',')
        .map((v) => ({ value: v, label: ENUM_LABELS[v] ?? v }))
    : t === 'level[]'
      ? (levels ?? []).map((l) => ({ value: l.id, label: l.name }))
      : t === 'teacher[]'
        ? (teachers ?? []).map((x) => ({ value: x.id, label: x.name }))
        : t === 'tag[]'
          ? (tags ?? []).map((x) => ({ value: x.id, label: x.name }))
          : t === 'source[]'
            ? (sources ?? []).map((x) => ({ value: x.id, label: x.name }))
            : t === 'stage[]'
              ? Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }))
              : [];
  return <ChipGroup size="sm" multiple options={options} value={(value as string[]) ?? []} onChange={(v) => onChange(v)} />;
}

/** Visual editor for { match, rules } client filters. */
export function RuleBuilder({ value, onChange, allowMatch = true }: { value: Definition; onChange: (d: Definition) => void; allowMatch?: boolean }) {
  const { data: fields } = useSegmentFields();
  const byField = new Map((fields ?? []).map((f) => [f.field, f]));
  const update = (i: number, patch: Partial<Rule>) => onChange({ ...value, rules: value.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <div className="space-y-3">
      {allowMatch && value.rules.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          Clients matching
          <Select value={value.match} onChange={(e) => onChange({ ...value, match: e.target.value as 'all' | 'any' })} className="h-9 w-28" aria-label="Match">
            <option value="all">all</option>
            <option value="any">any</option>
          </Select>
          of these rules
        </div>
      )}
      {value.rules.map((r, i) => {
        const f = byField.get(r.field);
        return (
          <div key={i} className="flex flex-wrap items-start gap-2 rounded-2xl bg-canvas p-3">
            <Select
              value={r.field}
              onChange={(e) => {
                const nf = byField.get(e.target.value)!;
                update(i, { field: nf.field, op: nf.ops[0], value: defaultValue(nf) });
              }}
              className="h-10 w-64"
              aria-label="Field"
            >
              {(fields ?? []).map((x) => (
                <option key={x.field} value={x.field}>
                  {x.label}
                </option>
              ))}
            </Select>
            {f && f.ops.length > 1 ? (
              <Select value={r.op} onChange={(e) => update(i, { op: e.target.value })} className="h-10 w-32" aria-label="Operator">
                {f.ops.map((o) => (
                  <option key={o} value={o}>
                    {OP_LABELS[o] ?? o}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="flex h-10 items-center px-1 text-sm text-muted">{OP_LABELS[r.op] ?? r.op}</span>
            )}
            <div className="min-w-0 flex-1">{f && <ValueInput field={f} value={r.value} onChange={(v) => update(i, { value: v })} />}</div>
            <button type="button" className="rounded-xl p-2 text-muted hover:bg-white" aria-label="Remove rule" onClick={() => onChange({ ...value, rules: value.rules.filter((_, j) => j !== i) })}>
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        leftIcon={<Plus className="h-4 w-4" />}
        disabled={!fields?.length}
        onClick={() => {
          const f = fields![0];
          onChange({ ...value, rules: [...value.rules, { field: f.field, op: f.ops[0], value: defaultValue(f) }] });
        }}
      >
        Add rule
      </Button>
      {value.rules.length === 0 && <p className="text-xs text-muted">No rules — applies to all clients.</p>}
    </div>
  );
}

export function asDefinition(raw: unknown): Definition {
  const d = raw as Partial<Definition> | null | undefined;
  return { match: d?.match === 'any' ? 'any' : 'all', rules: Array.isArray(d?.rules) ? (d!.rules as Rule[]) : [] };
}
