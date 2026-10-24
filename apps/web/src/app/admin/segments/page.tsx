'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { asDefinition, RuleBuilder, type Definition } from '@/components/admin/rule-builder';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, InlineAlert, SkeletonList } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/inputs';
import { Card } from '@/components/ui/layout';
import { ConfirmDialog, Drawer } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys } from '@/lib/admin-queries';
import { fmt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { marketingMessages } from '@/lib/i18n/messages/admin/marketing';

type Segment = S<'SegmentDto'>;

export default function SegmentsPage() {
  const tr = useT(marketingMessages);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: adminKeys.segments, queryFn: () => call(api.GET('/api/admin/segments')) });
  const [editing, setEditing] = useState<Segment | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Segment | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => call(api.DELETE('/api/admin/segments/{id}', { params: { path: { id } } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.segments });
      setDeleting(null);
    },
    onError: toastError,
  });
  return (
    <AdminPage
      title={tr.segments}
      description={tr.savedClientGroupsBroadcasts}
      actions={
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          {tr.newSegment}
        </Button>
      }
    >
      {query.isLoading ? (
        <SkeletonList count={6} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {query.data?.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {s.isSystem && <Lock className="h-3.5 w-3.5 text-subtle" />} {s.name}
                  </p>
                  {s.description && <p className="text-sm text-muted">{s.description}</p>}
                </div>
                <Link href={`/admin/clients?segment=${s.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-sm font-semibold text-brand-800">
                  <Users className="h-3.5 w-3.5" /> {s.clientCount}
                </Link>
              </div>
              <p className="text-xs text-muted">
                {tr.ruleCountUpdated(s.definition.rules.length, fmt.relative(s.updatedAt))}
              </p>
              <div className="mt-auto flex gap-2">
                <Button size="xs" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(s)}>
                  {s.isSystem ? tr.tune : tr.edit}
                </Button>
                {!s.isSystem && (
                  <Button size="xs" variant="ghost" className="text-danger-700" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleting(s)}>
                    {tr.delete}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <SegmentDrawer segment={editing === 'new' ? undefined : (editing ?? undefined)} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={tr.deleteNamed(deleting?.name ?? '')}
        description={tr.scheduledBroadcastsUsingWill}
        confirmLabel={tr.delete}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </AdminPage>
  );
}

function SegmentDrawer({ segment, open, onOpenChange }: { segment?: Segment; open: boolean; onOpenChange: (o: boolean) => void }) {
  const tr = useT(marketingMessages);
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [definition, setDefinition] = useState<Definition>({ match: 'all', rules: [] });
  const [debounced, setDebounced] = useState(definition);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(segment?.name ?? '');
      setDescription(segment?.description ?? '');
      const d = asDefinition(segment?.definition);
      setDefinition(d);
      setDebounced(d);
    }
  }
  useEffect(() => {
    const t = setTimeout(() => setDebounced(definition), 400);
    return () => clearTimeout(t);
  }, [definition]);
  const preview = useQuery({
    queryKey: ['admin', 'segment-preview', debounced],
    queryFn: () => call(api.POST('/api/admin/segments/preview', { body: { definition: debounced } })),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: () =>
      segment
        ? call(api.PATCH('/api/admin/segments/{id}', { params: { path: { id: segment.id } }, body: { name: name.trim(), description: description.trim() || undefined, definition } }))
        : call(api.POST('/api/admin/segments', { body: { name: name.trim(), description: description.trim() || undefined, definition } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.segments });
      toast.success(tr.segmentSaved);
      onOpenChange(false);
    },
  });
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={segment ? segment.name : tr.newSegment}
      width="xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
            {tr.saveSegment}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr.name} required htmlFor="sg-name">
            <Input id="sg-name" value={name} onChange={(e) => setName(e.target.value)} disabled={segment?.isSystem} />
          </Field>
          <Field label={tr.description} htmlFor="sg-desc">
            <Textarea id="sg-desc" rows={1} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <RuleBuilder value={definition} onChange={setDefinition} />
        <div className="rounded-2xl border border-line p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4 text-brand-700" /> {preview.isFetching ? tr.counting : preview.data ? tr.clientsMatch(preview.data.count) : preview.error ? tr.invalidRules : ''}
          </p>
          {preview.error && <p className="mt-1 text-sm text-danger-700">{errorMessage(preview.error)}</p>}
          {preview.data && preview.data.sample.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {preview.data.sample.map((c) => (
                <Link key={c.id} href={`/admin/clients/${c.id}`} target="_blank">
                  <Badge>{c.name}</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
        {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}
