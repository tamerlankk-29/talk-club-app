'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, Star } from 'lucide-react';
import { Suspense, useState } from 'react';
import { MembershipDrawer } from '@/components/admin/membership-dialogs';
import { AdminPage, FilterSelect, Toolbar } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, InlineAlert, SkeletonList, StatusBadge } from '@/components/ui/feedback';
import { Checkbox, ChipGroup, Field, Input, Textarea } from '@/components/ui/inputs';
import { Card, DataTable, Pagination, Tabs, TabsContent, TabsList, TabsTrigger, type Column } from '@/components/ui/layout';
import { Drawer } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, downloadFile, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys, useAdminGroupTypes, useAdminPlans, useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { CATEGORY_LABELS, cn } from '@/lib/utils';

type Row = S<'AdminMembershipRowDto'>;
type Plan = S<'MembershipPlanDto'>;
const PAGE_SIZE = 50;

function Memberships() {
  const url = useUrlState();
  const canPlans = useCan('plans.manage');
  const canExport = useCan('data.export');
  const tab = url.get('tab', 'list');
  return (
    <AdminPage
      title="Memberships"
      description="Every visit is tracked in a ledger — balances can't drift."
      actions={
        canExport && (
          <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={() => downloadFile('/api/admin/exports/memberships?format=xlsx', 'memberships.xlsx').catch(toastError)}>
            Export
          </Button>
        )
      }
    >
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'list' ? null : v, status: null })}>
        <TabsList className="max-w-sm">
          <TabsTrigger value="list">Memberships</TabsTrigger>
          {canPlans && <TabsTrigger value="plans">Plans & prices</TabsTrigger>}
        </TabsList>
        <TabsContent value="list">
          <MembershipList />
        </TabsContent>
        {canPlans && (
          <TabsContent value="plans">
            <Plans />
          </TabsContent>
        )}
      </Tabs>
    </AdminPage>
  );
}

function MembershipList() {
  const url = useUrlState();
  const { data: plans } = useAdminPlans();
  const page = Number(url.get('page', '1'));
  const [openId, setOpenId] = useState<string | null>(null);
  const status = (url.get('status') || 'ACTIVE') as 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'CANCELLED' | 'USED_UP';
  const planId = url.get('plan') || undefined;
  const query = useQuery({
    queryKey: ['admin', 'memberships', status, planId, page],
    queryFn: () => call(api.GET('/api/admin/memberships', { params: { query: { status, planId, page, pageSize: PAGE_SIZE } } })),
    placeholderData: (prev) => prev,
  });
  const columns: Column<Row>[] = [
    {
      key: 'client',
      header: 'Client',
      cell: (m) => (
        <div>
          <p className="font-semibold">{m.clientName}</p>
          <p className="text-xs text-muted">{fmt.phone(m.clientPhone)}</p>
        </div>
      ),
    },
    { key: 'plan', header: 'Plan', cell: (m) => <span className="font-medium">{m.planName}{m.isRenewal ? <span className="ml-1 text-xs text-muted">renewal</span> : null}</span> },
    {
      key: 'visits',
      header: 'Visits',
      cell: (m) => (
        <div className="w-28">
          <p className={cn('text-sm font-semibold', m.visitsRemaining <= 1 && 'text-warning-700')}>
            {m.visitsRemaining} / {m.visitsCredited} left
          </p>
          <div className="mt-1 h-1.5 rounded-full bg-brand-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (m.visitsUsed / Math.max(1, m.visitsCredited)) * 100)}%` }} />
          </div>
        </div>
      ),
    },
    {
      key: 'expires',
      header: 'Valid until',
      cell: (m) => (
        <span className={cn('text-sm', m.daysLeft <= 7 && m.status === 'ACTIVE' && 'font-semibold text-warning-700')}>
          {fmt.date(m.expiresAt)}
          {m.status === 'ACTIVE' && <span className="block text-xs text-muted">{m.daysLeft} days left</span>}
        </span>
      ),
    },
    { key: 'status', header: 'Status', hideOnMobile: true, cell: (m) => <StatusBadge status={m.status} /> },
  ];
  return (
    <div className="space-y-4">
      <Toolbar>
        <FilterSelect label="Status" value={status} onChange={(v) => url.set({ status: v === 'ACTIVE' ? null : v })}>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRING">Expiring soon</option>
          <option value="USED_UP">No visits left</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
        </FilterSelect>
        <FilterSelect label="Plan" value={planId ?? ''} onChange={(v) => url.set({ plan: v })}>
          <option value="">All plans</option>
          {plans?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        {query.data && <span className="text-sm text-muted">{query.data.total} memberships</span>}
      </Toolbar>
      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable columns={columns} rows={query.data?.items} rowKey={(m) => m.id} loading={query.isLoading} onRowClick={(m) => setOpenId(m.id)} />
          {query.data && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onChange={(p) => url.set({ page: p })} />}
        </>
      )}
      <MembershipDrawer membershipId={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}

function Plans() {
  const { data: plans, isLoading, error, refetch } = useAdminPlans();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-4">
      <InlineAlert tone="info">Price and visit changes apply to new purchases only — existing memberships keep their terms.</InlineAlert>
      <div className="flex justify-end">
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          New plan
        </Button>
      </div>
      {isLoading ? (
        <SkeletonList count={4} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans
            ?.slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((p) => (
              <Card key={p.id} className={cn('space-y-3', !p.isActive && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold">
                      {p.name} {p.isFeatured && <Star className="inline h-4 w-4 text-warning-600" />}
                    </p>
                    <p className="text-sm text-muted">
                      {p.visits} visits · {p.validityDays} days · code {p.code}
                    </p>
                  </div>
                  <p className="font-display text-xl font-semibold">{fmt.money(p.price)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!p.isActive && <Badge>inactive</Badge>}
                  {!p.isPublic && <Badge tone="warning">staff only</Badge>}
                  {p.clientCategories.map((c) => (
                    <Badge key={c}>{CATEGORY_LABELS[c]}</Badge>
                  ))}
                  {p.groupTypes.map((g) => (
                    <Badge key={g.id} tone="brand">
                      {g.name}
                    </Badge>
                  ))}
                  <Badge tone="neutral">{fmt.money(p.pricePerVisit)}/visit</Badge>
                </div>
                <Button size="xs" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(p)}>
                  Edit
                </Button>
              </Card>
            ))}
        </div>
      )}
      <PlanDrawer plan={editing === 'new' ? undefined : (editing ?? undefined)} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}

function PlanDrawer({ plan, open, onOpenChange }: { plan?: Plan; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: groupTypes } = useAdminGroupTypes();
  const init = () => ({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    visits: String(plan?.visits ?? 8),
    price: String(plan?.price ?? ''),
    validityDays: String(plan?.validityDays ?? 35),
    isActive: plan?.isActive ?? true,
    isPublic: plan?.isPublic ?? true,
    isFeatured: plan?.isFeatured ?? false,
    clientCategories: (plan?.clientCategories ?? []) as S<'ClientCategory'>[],
    groupTypeIds: plan?.groupTypes.map((g) => g.id) ?? [],
    sortOrder: String(plan?.sortOrder ?? 0),
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
        code: f.code.trim().toUpperCase(),
        name: f.name.trim(),
        description: f.description.trim() || undefined,
        visits: Number(f.visits),
        price: Number(f.price),
        validityDays: Number(f.validityDays),
        isActive: f.isActive,
        isPublic: f.isPublic,
        isFeatured: f.isFeatured,
        clientCategories: f.clientCategories,
        groupTypeIds: f.groupTypeIds,
        sortOrder: Number(f.sortOrder),
      };
      return plan
        ? call(api.PATCH('/api/admin/membership-plans/{id}', { params: { path: { id: plan.id } }, body }))
        : call(api.POST('/api/admin/membership-plans', { body }));
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: adminKeys.plans }), qc.invalidateQueries({ queryKey: ['plans'] }), qc.invalidateQueries({ queryKey: ['public', 'club'] })]);
      toast.success('Plan saved.');
      onOpenChange(false);
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.code.trim() || !f.name.trim() || !f.price} onClick={() => save.mutate()}>
            Save plan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required htmlFor="pl-name" error={errors.name}>
            <Input id="pl-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Code" required htmlFor="pl-code" error={errors.code} hint="e.g. STANDARD">
            <Input id="pl-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          </Field>
          <Field label="Visits" htmlFor="pl-visits" error={errors.visits}>
            <Input id="pl-visits" type="number" min={1} value={f.visits} onChange={(e) => setF({ ...f, visits: e.target.value })} />
          </Field>
          <Field label="Price, ₸" htmlFor="pl-price" error={errors.price}>
            <Input id="pl-price" type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
          <Field label="Valid for, days" htmlFor="pl-days" error={errors.validityDays}>
            <Input id="pl-days" type="number" min={1} value={f.validityDays} onChange={(e) => setF({ ...f, validityDays: e.target.value })} />
          </Field>
          <Field label="Sort order" htmlFor="pl-sort">
            <Input id="pl-sort" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" htmlFor="pl-desc">
          <Textarea id="pl-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Only for categories" hint="Empty = everyone">
          <ChipGroup size="sm" multiple options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value: value as S<'ClientCategory'>, label }))} value={f.clientCategories} onChange={(v) => setF({ ...f, clientCategories: v as S<'ClientCategory'>[] })} />
        </Field>
        <Field label="Valid for group types" hint="Empty = all sessions">
          <ChipGroup size="sm" multiple options={(groupTypes ?? []).map((g) => ({ value: g.id, label: g.name }))} value={f.groupTypeIds} onChange={(v) => setF({ ...f, groupTypeIds: v as string[] })} />
        </Field>
        <div className="space-y-2">
          <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />
          <Checkbox checked={f.isPublic} onChange={(v) => setF({ ...f, isPublic: v })} label="Clients can buy it in the app" />
          <Checkbox checked={f.isFeatured} onChange={(v) => setF({ ...f, isFeatured: v })} label="Highlight as “Most popular”" />
        </div>
        {save.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}

export default function MembershipsPage() {
  return (
    <Suspense>
      <Memberships />
    </Suspense>
  );
}
