'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/client/require-auth';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/inputs';
import { Card, PageHeader } from '@/components/ui/layout';
import { Modal } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { keys, useLevels } from '@/lib/queries';
import { CATEGORY_LABELS } from '@/lib/utils';

export default function FamilyPage() {
  return (
    <RequireAuth>
      <Family />
    </RequireAuth>
  );
}

function Family() {
  const router = useRouter();
  const { setActingClient, reloadUser } = useAuth();
  const qc = useQueryClient();
  const { data: levels } = useLevels();
  const query = useQuery({ queryKey: keys.family, queryFn: () => call(api.GET('/api/my/family')) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', birthDate: '', levelId: '', category: 'CHILD' as 'CHILD' | 'TEEN' });

  const add = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/my/family', {
          body: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim() || undefined,
            birthDate: form.birthDate || undefined,
            levelId: form.levelId || undefined,
            category: form.category,
          },
        }),
      ),
    onSuccess: async (data) => {
      qc.setQueryData(keys.family, data);
      await reloadUser();
      setOpen(false);
      setForm({ firstName: '', lastName: '', birthDate: '', levelId: '', category: 'CHILD' });
      toast.success('Profile added. You can now book sessions for them.');
    },
  });
  const errors = fieldErrors(add.error);

  return (
    <div className="space-y-5 pt-5">
      <PageHeader back="/profile" title="Family" subtitle="Book sessions and manage memberships for your children." />
      {query.isLoading ? (
        <SkeletonList count={2} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data?.length ? (
        <div className="space-y-3">
          {query.data.map((m) => (
            <Card key={m.profile.id} className="flex items-center gap-3">
              <Avatar name={m.profile.fullName} src={m.profile.photoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.profile.fullName}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge>{CATEGORY_LABELS[m.profile.category] ?? m.profile.category}</Badge>
                  {m.profile.level && <Badge tone="brand">{m.profile.level.name}</Badge>}
                  {m.membership ? <Badge tone="success">{m.membership.visitsRemaining} visits left</Badge> : <Badge tone="warning">No membership</Badge>}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setActingClient(m.profile.id);
                  router.push('/');
                }}
              >
                Switch
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Users className="h-7 w-7" />} title="No children added" description="Add your child's profile to book Kids or Teens sessions for them." />
      )}
      <Button variant="outline" size="lg" block leftIcon={<Plus className="h-5 w-5" />} onClick={() => setOpen(true)}>
        Add a child
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Add a child"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={add.isPending} disabled={!form.firstName.trim()} onClick={() => add.mutate()}>
              Add profile
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" required htmlFor="c-first" error={errors.firstName}>
              <Input id="c-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} maxLength={60} />
            </Field>
            <Field label="Last name" htmlFor="c-last" error={errors.lastName}>
              <Input id="c-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} maxLength={60} />
            </Field>
          </div>
          <Field label="Group" htmlFor="c-cat">
            <Select id="c-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as 'CHILD' | 'TEEN' })}>
              <option value="CHILD">Kids</option>
              <option value="TEEN">Teens</option>
            </Select>
          </Field>
          <Field label="Date of birth" htmlFor="c-birth" error={errors.birthDate}>
            <Input id="c-birth" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          </Field>
          <Field label="English level" htmlFor="c-level">
            <Select id="c-level" value={form.levelId} onChange={(e) => setForm({ ...form, levelId: e.target.value })}>
              <option value="">Not sure</option>
              {levels?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          {add.error && !Object.keys(errors).length && <p className="text-sm text-danger-600">{errorMessage(add.error)}</p>}
        </div>
      </Modal>
    </div>
  );
}
