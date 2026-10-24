'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarX2, SlidersHorizontal, X } from 'lucide-react';
import type { DateTime } from 'luxon';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { ClientTopBar } from '@/components/client/client-shell';
import { SessionCard } from '@/components/client/session-card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { ChipGroup, Field, Select, Switch } from '@/components/ui/inputs';
import { Modal } from '@/components/ui/overlay';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAuth } from '@/lib/auth';
import { clubNow, fmt, formatDate, localDayLabel } from '@/lib/format';
import { messagesFor, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { sessionMessages } from '@/lib/i18n/messages/sessions';
import { keys, useClub, useLevels, useTeachers } from '@/lib/queries';
import { useHydrated } from '@/lib/use-hydrated';
import { cn, FORMAT_LABELS, TIME_OF_DAY_LABELS } from '@/lib/utils';

type TimeOfDay = S<'TimeOfDay'>;
type SessionFormat = S<'SessionFormat'>;

interface Filters {
  teacherId?: string;
  levelId?: string;
  timeOfDay?: TimeOfDay;
  format?: SessionFormat;
  availableOnly?: boolean;
  matchMyLevel?: boolean;
}

function readFilters(params: URLSearchParams): Filters {
  return {
    teacherId: params.get('teacher') ?? undefined,
    levelId: params.get('level') ?? undefined,
    timeOfDay: (params.get('time') as TimeOfDay | null) ?? undefined,
    format: (params.get('format') as SessionFormat | null) ?? undefined,
    availableOnly: params.get('available') === '1' || undefined,
    matchMyLevel: params.get('mine') === '1' || undefined,
  };
}

function writeFilters(f: Filters, day: string | null): string {
  const p = new URLSearchParams();
  if (day) p.set('day', day);
  if (f.teacherId) p.set('teacher', f.teacherId);
  if (f.levelId) p.set('level', f.levelId);
  if (f.timeOfDay) p.set('time', f.timeOfDay);
  if (f.format) p.set('format', f.format);
  if (f.availableOnly) p.set('available', '1');
  if (f.matchMyLevel) p.set('mine', '1');
  const s = p.toString();
  return s ? `?${s}` : '';
}

function Schedule() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user, actingClientId } = useAuth();
  const isClient = !!(user?.client || actingClientId);
  const { data: club } = useClub();
  const filters = readFilters(params);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const t = useT(sessionMessages);

  const hydrated = useHydrated();
  const daysAhead = hydrated ? Math.min(Math.max(club?.policies.bookingOpenDaysAhead ?? 14, 7), 31) : 14;
  const today = clubNow().startOf('day');
  const days = useMemo(() => Array.from({ length: daysAhead }, (_, i) => today.plus({ days: i })), [today.toISODate(), daysAhead]); // eslint-disable-line react-hooks/exhaustive-deps
  const from = today.toUTC().toISO()!;
  const to = today.plus({ days: daysAhead }).toUTC().toISO()!;

  const query = useQuery({
    queryKey: [...keys.sessions({ from, to, ...filters }), actingClientId ?? user?.client?.id ?? 'guest'],
    queryFn: () =>
      call(
        api.GET('/api/sessions', {
          params: { query: { from, to, ...filters, matchMyLevel: isClient ? filters.matchMyLevel : undefined } },
        }),
      ),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof query.data>>();
    for (const s of query.data ?? []) {
      const list = map.get(s.localDate) ?? [];
      list.push(s);
      map.set(s.localDate, list);
    }
    return map;
  }, [query.data]);

  // Default to the first day that still has sessions ahead.
  const requested = params.get('day');
  const firstWithSessions = days.find((d) => (byDay.get(d.toISODate()!) ?? []).some((s) => s.status !== 'COMPLETED'))?.toISODate();
  const selected = requested ?? firstWithSessions ?? today.toISODate()!;
  const sessions = byDay.get(selected) ?? [];
  const activeFilterCount = [filters.teacherId, filters.levelId, filters.timeOfDay, filters.format, filters.availableOnly, filters.matchMyLevel].filter(Boolean).length;

  const update = (next: Filters, day: string | null = requested) => router.replace(`${pathname}${writeFilters(next, day)}`, { scroll: false });
  const closedDay = (d: DateTime) => {
    const hours = (hydrated ? club?.location?.workingHours : undefined) as Record<string, unknown> | undefined;
    const value = hours?.[String(d.weekday)];
    return hours ? value === null || value === undefined : d.weekday === 7;
  };

  return (
    <div className="space-y-4">
      <ClientTopBar title={t.schedule} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none" role="tablist" aria-label={t.chooseDay}>
        {days.map((d) => {
          const iso = d.toISODate()!;
          const count = (byDay.get(iso) ?? []).filter((s) => s.available > 0 && s.status !== 'COMPLETED' && s.status !== 'STARTED').length;
          const active = iso === selected;
          const closed = closedDay(d);
          return (
            <button
              key={iso}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => update(filters, iso)}
              className={cn(
                'flex w-[52px] shrink-0 flex-col items-center rounded-2xl py-2.5 transition',
                active ? 'bg-brand-700 text-white shadow-float' : 'bg-white text-ink ring-1 ring-line hover:ring-brand-200',
                closed && !active && 'opacity-50',
              )}
            >
              <span className={cn('text-[11px] font-semibold uppercase', active ? 'text-white/80' : 'text-muted')}>{formatDate(d, 'ccc')}</span>
              <span className="font-display text-lg font-semibold leading-tight">{d.day}</span>
              <span className={cn('mt-1 h-1.5 w-1.5 rounded-full', count ? (active ? 'bg-zest' : 'bg-brand-500') : 'bg-transparent')} />
            </button>
          );
        })}
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 scrollbar-none">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold',
            activeFilterCount ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" /> {t.filters}
          {activeFilterCount ? ` · ${activeFilterCount}` : ''}
        </button>
        <QuickChip active={!!filters.availableOnly} onClick={() => update({ ...filters, availableOnly: !filters.availableOnly || undefined })}>
          {t.freeSeats}
        </QuickChip>
        {isClient && (
          <QuickChip active={!!filters.matchMyLevel} onClick={() => update({ ...filters, matchMyLevel: !filters.matchMyLevel || undefined })}>
            {t.myLevel}
          </QuickChip>
        )}
        {(['AFTERNOON', 'EVENING'] as const).map((time) => (
          <QuickChip key={time} active={filters.timeOfDay === time} onClick={() => update({ ...filters, timeOfDay: filters.timeOfDay === time ? undefined : time })}>
            {TIME_OF_DAY_LABELS[time]}
          </QuickChip>
        ))}
        {activeFilterCount > 0 && (
          <button type="button" onClick={() => update({})} className="inline-flex shrink-0 items-center gap-1 px-2 text-sm font-semibold text-brand-700">
            <X className="h-4 w-4" /> {t.clear}
          </button>
        )}
      </div>

      <h2 className="pt-1 font-display text-lg font-semibold">{headingFor(selected)}</h2>

      {query.isLoading ? (
        <SkeletonList count={4} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<CalendarX2 className="h-7 w-7" />}
          title={closedDay(days.find((d) => d.toISODate() === selected) ?? today) ? t.closedDay : t.noMatch}
          description={activeFilterCount ? t.removeFilters : t.pickAnotherDay}
          action={
            activeFilterCount ? (
              <Button variant="outline" size="sm" onClick={() => update({}, requested)}>
                {t.clearFilters}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}

      <FiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} isClient={isClient} onApply={(f) => update(f)} />
    </div>
  );
}

function headingFor(isoDate: string): string {
  const label = fmt.localDate(isoDate);
  const relative = localDayLabel(isoDate);
  const common = messagesFor(commonMessages);
  return relative === common.today || relative === common.tomorrow ? `${relative} · ${label}` : label;
}

function QuickChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition',
        active ? 'border-brand-200 bg-brand-100 text-brand-800' : 'border-line bg-white text-ink hover:border-brand-200',
      )}
    >
      {children}
    </button>
  );
}

function FiltersSheet({
  open,
  onOpenChange,
  filters,
  isClient,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Filters;
  isClient: boolean;
  onApply: (f: Filters) => void;
}) {
  const { data: teachers } = useTeachers();
  const { data: levels } = useLevels();
  const [draft, setDraft] = useState<Filters>(filters);
  const t = useT(sessionMessages);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setDraft(filters);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t.filters}
      footer={
        <>
          <Button variant="ghost" onClick={() => setDraft({})}>
            {t.reset}
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            {t.showSessions}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label={t.teacher} htmlFor="f-teacher">
          <Select id="f-teacher" value={draft.teacherId ?? ''} onChange={(e) => setDraft({ ...draft, teacherId: e.target.value || undefined })}>
            <option value="">{t.anyTeacher}</option>
            {teachers?.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.level} htmlFor="f-level">
          <Select id="f-level" value={draft.levelId ?? ''} onChange={(e) => setDraft({ ...draft, levelId: e.target.value || undefined, matchMyLevel: undefined })}>
            <option value="">{t.anyLevel}</option>
            {levels?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.timeOfDay}>
          <ChipGroup
            size="sm"
            options={(['MORNING', 'AFTERNOON', 'EVENING'] as const).map((time) => ({ value: time, label: TIME_OF_DAY_LABELS[time] }))}
            value={draft.timeOfDay ?? null}
            onChange={(v) => setDraft({ ...draft, timeOfDay: v === draft.timeOfDay ? undefined : (v as TimeOfDay) })}
          />
        </Field>
        <Field label={t.format}>
          <ChipGroup
            size="sm"
            options={(['OFFLINE', 'ONLINE'] as const).map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
            value={draft.format ?? null}
            onChange={(v) => setDraft({ ...draft, format: v === draft.format ? undefined : (v as SessionFormat) })}
          />
        </Field>
        <Switch checked={!!draft.availableOnly} onChange={(v) => setDraft({ ...draft, availableOnly: v || undefined })} label={t.onlyFree} />
        {isClient && (
          <Switch
            checked={!!draft.matchMyLevel}
            onChange={(v) => setDraft({ ...draft, matchMyLevel: v || undefined, levelId: v ? undefined : draft.levelId })}
            label={t.matchMyLevel}
            description={t.matchMyLevelHint}
          />
        )}
      </div>
    </Modal>
  );
}

export default function SchedulePage() {
  return (
    <Suspense>
      <Schedule />
    </Suspense>
  );
}
