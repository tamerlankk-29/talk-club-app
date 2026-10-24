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

type Scope = 'open' | 'overdue' | 'done' | 'all';

function Tasks() {
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
      title="Tasks"
      description="Follow-ups for the team — some are created automatically (renewals, inactive clients, trials)."
      actions={
        canManage && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New task
          </Button>
        )
      }
    >
      <Toolbar>
        <SegmentedControl
          options={[
            { value: 'open', label: 'Open' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'done', label: 'Done' },
            { value: 'all', label: 'All' },
          ]}
          value={scope}
          onChange={(v) => url.set({ scope: v === 'open' ? null : v })}
        />
        <FilterSelect label="Assignee" value={assignee} onChange={(v) => url.set({ assignee: v === 'me' ? null : v })}>
          <option value="me">My tasks</option>
          <option value="all">Everyone</option>
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
        <EmptyState icon={<ListTodo className="h-7 w-7" />} title={scope === 'overdue' ? 'Nothing overdue 🎉' : 'No tasks'} />
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
