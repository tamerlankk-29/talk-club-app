'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { asDefinition, RuleBuilder } from '@/components/admin/rule-builder';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, InlineAlert, SkeletonList } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/inputs';
import { Card } from '@/components/ui/layout';
import { ConfirmDialog, Drawer } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { clubNow, fmt, fromClubInput, toClubInput } from '@/lib/format';

type Announcement = S<'AnnouncementDto'>;
const KEY = ['admin', 'announcements'];

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => call(api.GET('/api/admin/announcements')) });
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => call(api.DELETE('/api/admin/announcements/{id}', { params: { path: { id } } })),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ['my', 'home'] })]);
      setDeleting(null);
    },
    onError: toastError,
  });
  const now = Date.now();
  return (
    <AdminPage
      title="Announcements"
      description="Cards on the client home screen — news, new groups, holiday hours."
      actions={
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          New announcement
        </Button>
      }
    >
      {query.isLoading ? (
        <SkeletonList count={3} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState icon={<Megaphone className="h-7 w-7" />} title="No announcements" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {query.data.map((a) => {
            const live = a.isActive && new Date(a.startsAt).getTime() <= now && (!a.endsAt || new Date(a.endsAt).getTime() > now);
            return (
              <Card key={a.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {a.isPinned && <Pin className="h-3.5 w-3.5 text-brand-700" />} {a.title}
                  </p>
                  {live ? <Badge tone="success">Live</Badge> : a.isActive ? <Badge tone="info">Scheduled / ended</Badge> : <Badge>Hidden</Badge>}
                </div>
                <p className="line-clamp-3 text-sm text-muted">{a.body}</p>
                <p className="text-xs text-muted">
                  {fmt.dateShort(a.startsAt)} – {a.endsAt ? fmt.dateShort(a.endsAt) : 'no end'}
                  {a.audience ? ' · targeted' : ' · everyone'}
                </p>
                <div className="flex gap-2">
                  <Button size="xs" variant="secondary" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                  <Button size="xs" variant="ghost" className="text-danger-700" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleting(a)}>
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <AnnouncementDrawer announcement={editing === 'new' ? undefined : (editing ?? undefined)} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete announcement?"
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </AdminPage>
  );
}

function AnnouncementDrawer({ announcement, open, onOpenChange }: { announcement?: Announcement; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const init = () => ({
    title: announcement?.title ?? '',
    body: announcement?.body ?? '',
    buttonLabel: announcement?.buttonLabel ?? '',
    buttonUrl: announcement?.buttonUrl ?? '',
    startsAt: announcement ? toClubInput(announcement.startsAt) : clubNow().toFormat("yyyy-MM-dd'T'HH:mm"),
    endsAt: toClubInput(announcement?.endsAt),
    isPinned: announcement?.isPinned ?? false,
    isActive: announcement?.isActive ?? true,
    targeted: !!announcement?.audience,
    audience: asDefinition(announcement?.audience),
  });
  const [f, setF] = useState(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setF(init());
  }
  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: f.title.trim(),
        body: f.body.trim(),
        buttonLabel: f.buttonLabel.trim() || null,
        buttonUrl: f.buttonUrl.trim() || null,
        startsAt: fromClubInput(f.startsAt),
        endsAt: f.endsAt ? fromClubInput(f.endsAt) : null,
        isPinned: f.isPinned,
        isActive: f.isActive,
        audience: f.targeted ? (f.audience as unknown as Record<string, never>) : null,
      };
      return announcement
        ? call(api.PATCH('/api/admin/announcements/{id}', { params: { path: { id: announcement.id } }, body }))
        : call(api.POST('/api/admin/announcements', { body }));
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ['my', 'home'] })]);
      toast.success('Announcement saved.');
      onOpenChange(false);
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={announcement ? 'Edit announcement' : 'New announcement'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.title.trim() || !f.body.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required htmlFor="an-title" error={errors.title}>
          <Input id="an-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Text" required htmlFor="an-body" error={errors.body}>
          <Textarea id="an-body" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={1000} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button label" htmlFor="an-bl">
            <Input id="an-bl" value={f.buttonLabel} onChange={(e) => setF({ ...f, buttonLabel: e.target.value })} />
          </Field>
          <Field label="Button link" htmlFor="an-bu">
            <Input id="an-bu" value={f.buttonUrl} onChange={(e) => setF({ ...f, buttonUrl: e.target.value })} placeholder="/schedule" />
          </Field>
          <Field label="Show from" htmlFor="an-from">
            <Input id="an-from" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
          </Field>
          <Field label="Until" htmlFor="an-until" hint="Empty = until removed">
            <Input id="an-until" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
          </Field>
        </div>
        <div className="space-y-2">
          <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Visible" />
          <Checkbox checked={f.isPinned} onChange={(v) => setF({ ...f, isPinned: v })} label="Pin to the top" />
          <Checkbox checked={f.targeted} onChange={(v) => setF({ ...f, targeted: v })} label="Only show to some clients" />
        </div>
        {f.targeted && <RuleBuilder value={f.audience} onChange={(audience) => setF({ ...f, audience })} />}
        {save.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}
