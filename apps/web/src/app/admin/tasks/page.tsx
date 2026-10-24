'use client';

import { useQuery } from '@tanstack/react-query';
import { ListTodo, Plus } from 'lucide-react';
import { Suspense, useState } from 'react';
import { NewTaskDialog, TaskRow } from '@/components/admin/crm-panels';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { Card, SegmentedControl } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import { useAdminTeam, useUrlState } from '@/lib/admin-queries';
import { useAuth, useCan } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { crmMessages } from '@/lib/i18n/messages/admin/crm';

type Scope = 'open' | 'overdue' | 'done' | 'all';

function Tasks() {
  const tr = useT(crmMessages);
  const url = useUrlState();
  const { user } = useAuth();
  const canManage = useCan('crm.manage');
  const { data: staff } = useAdminTeam();
  const [creating, setCreating] = useState(false);
  const scope = (url.get('scope', 'open') as Scope) || 'open';
  const assignee = url.get('assignee', 'me');
  const query = useQuery({
    queryKey: ['admin', 'tasks', { scope, assignee }],
    queryFn: () => call(api.GET('/api/admin/tasks', { params: { query: { scope, assignee: assignee === 'all' ? undefined : assignee === 'me' ? user?.id : assignee } } })),
  });
  return (
    <AdminPage
      title={tr.tasks}
      description={tr.followUpsTeamSome}
      actions={
        canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            {tr.newTask}
          </Button>
        )
      }
    >
      <Toolbar>
        <SegmentedControl
          options={[
            { value: 'open', label: tr.open },
            { value: 'overdue', label: tr.overdue },
            { value: 'done', label: tr.done },
            { value: 'all', label: tr.all },
          ]}
          value={scope}
          onChange={(v) => url.set({ scope: v === 'open' ? null : v })}
        />
        <FilterSelect label={tr.assignee} value={assignee} onChange={(v) => url.set({ assignee: v === 'me' ? null : v })}>
          <option value="me">{tr.myTasks}</option>
          <option value="all">{tr.everyone}</option>
          {staff
            ?.filter((s) => s.id !== user?.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
        </FilterSelect>
      </Toolbar>
      {query.isLoading ? (
        <SkeletonList count={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState icon={<ListTodo className="h-7 w-7" />} title={scope === 'overdue' ? tr.nothingOverdue : tr.noTasks} />
      ) : (
        <Card padded={false} className="divide-y divide-line/70">
          {query.data.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Card>
      )}
      <NewTaskDialog open={creating} onOpenChange={setCreating} />
    </AdminPage>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <Tasks />
    </Suspense>
  );
}
