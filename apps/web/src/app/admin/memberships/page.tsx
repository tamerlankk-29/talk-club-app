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
import { useT } from '@/lib/i18n';
import { moneyMessages } from '@/lib/i18n/messages/admin/money';

type Row = S<'AdminMembershipRowDto'>;
type Plan = S<'MembershipPlanDto'>;
const PAGE_SIZE = 50;

function Memberships() {
  const tr = useT(moneyMessages);
  const url = useUrlState();
  const canPlans = useCan('plans.manage');
  const canExport = useCan('data.export');
  const tab = url.get('tab', 'list');
  return (
    <AdminPage
      title={tr.memberships}
      description={tr.everyVisitTrackedLedger}
      actions={
        canExport && (
          <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={() => downloadFile('/api/admin/exports/memberships?format=xlsx', 'memberships.xlsx').catch(toastError)}>
            {tr.export}
          </Button>
        )
      }
    >
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'list' ? null : v, status: null })}>
        <TabsList className="max-w-sm">
          <TabsTrigger value="list">{tr.memberships}</TabsTrigger>
          {canPlans && <TabsTrigger value="plans">{tr.plansPrices}</TabsTrigger>}
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
  const tr = useT(moneyMessages);
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
      header: tr.client,
      cell: (m) => (
        <div>
          <p className="font-semibold">{m.clientName}</p>
          <p className="text-xs text-muted">{fmt.phone(m.clientPhone)}</p>
        </div>
      ),
    },
    { key: 'plan', header: tr.plan, cell: (m) => <span className="font-medium">{m.planName}{m.isRenewal ? <span className="ml-1 text-xs text-muted">{tr.renewal}</span> : null}</span> },
    {
      key: 'visits',
      header: tr.visits,
      cell: (m) => (
        <div className="w-28">
          <p className={cn('text-sm font-semibold', m.visitsRemaining <= 1 && 'text-warning-700')}>
            {tr.visitsOfLeft(m.visitsRemaining, m.visitsCredited)}
          </p>
          <div className="mt-1 h-1.5 rounded-full bg-brand-100">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (m.visitsUsed / Math.max(1, m.visitsCredited)) * 100)}%` }} />
          </div>
        </div>
      ),
    },
    {
      key: 'expires',
      header: tr.validUntil,
      cell: (m) => (
        <span className={cn('text-sm', m.daysLeft <= 7 && m.status === 'ACTIVE' && 'font-semibold text-warning-700')}>
          {fmt.date(m.expiresAt)}
          {m.status === 'ACTIVE' && <span className="block text-xs text-muted">{tr.daysLeftN(m.daysLeft)}</span>}
        </span>
      ),
    },
    { key: 'status', header: tr.status, hideOnMobile: true, cell: (m) => <StatusBadge status={m.status} /> },
  ];
  return (
    <div className="space-y-4">
      <Toolbar>
        <FilterSelect label={tr.status} value={status} onChange={(v) => url.set({ status: v === 'ACTIVE' ? null : v })}>
          <option value="ACTIVE">{tr.active}</option>
          <option value="EXPIRING">{tr.expiringSoon}</option>
          <option value="USED_UP">{tr.noVisitsLeft}</option>
          <option value="EXPIRED">{tr.expired}</option>
          <option value="CANCELLED">{tr.cancelled}</option>
        </FilterSelect>
        <FilterSelect label={tr.plan} value={planId ?? ''} onChange={(v) => url.set({ plan: v })}>
          <option value="">{tr.allPlans}</option>
          {plans?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        {query.data && <span className="text-sm text-muted">{tr.membershipsCount(query.data.total)}</span>}
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
  const tr = useT(moneyMessages);
  const { data: plans, isLoading, error, refetch } = useAdminPlans();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-4">
      <InlineAlert tone="info">{tr.priceVisitChangesApply}</InlineAlert>
      <div className="flex justify-end">
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          {tr.newPlan}
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
                      {tr.planLine(p.visits, p.validityDays, p.code)}
                    </p>
                  </div>
                  <p className="font-display text-xl font-semibold">{fmt.money(p.price)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!p.isActive && <Badge>{tr.inactive}</Badge>}
                  {!p.isPublic && <Badge tone="warning">{tr.staffOnly}</Badge>}
                  {p.clientCategories.map((c) => (
                    <Badge key={c}>{CATEGORY_LABELS[c]}</Badge>
                  ))}
                  {p.groupTypes.map((g) => (
                    <Badge key={g.id} tone="brand">
                      {g.name}
                    </Badge>
                  ))}
                  <Badge tone="neutral">{tr.perVisit(fmt.money(p.pricePerVisit))}</Badge>
                </div>
                <Button size="xs" variant="secondary" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(p)}>
                  {tr.edit}
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
  const tr = useT(moneyMessages);
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
      toast.success(tr.planSaved);
      onOpenChange(false);
    },
  });
  const errors = fieldErrors(save.error);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? tr.editName(plan.name) : tr.newPlan}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!f.code.trim() || !f.name.trim() || !f.price} onClick={() => save.mutate()}>
            {tr.savePlan}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr.name} required htmlFor="pl-name" error={errors.name}>
            <Input id="pl-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={tr.code} required htmlFor="pl-code" error={errors.code} hint={tr.eGStandard}>
            <Input id="pl-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          </Field>
          <Field label={tr.visits} htmlFor="pl-visits" error={errors.visits}>
            <Input id="pl-visits" type="number" min={1} value={f.visits} onChange={(e) => setF({ ...f, visits: e.target.value })} />
          </Field>
          <Field label={tr.price} htmlFor="pl-price" error={errors.price}>
            <Input id="pl-price" type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
          <Field label={tr.validDays} htmlFor="pl-days" error={errors.validityDays}>
            <Input id="pl-days" type="number" min={1} value={f.validityDays} onChange={(e) => setF({ ...f, validityDays: e.target.value })} />
          </Field>
          <Field label={tr.sortOrder} htmlFor="pl-sort">
            <Input id="pl-sort" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
          </Field>
        </div>
        <Field label={tr.description} htmlFor="pl-desc">
          <Textarea id="pl-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label={tr.onlyCategories} hint={tr.emptyEveryone}>
          <ChipGroup size="sm" multiple options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value: value as S<'ClientCategory'>, label }))} value={f.clientCategories} onChange={(v) => setF({ ...f, clientCategories: v as S<'ClientCategory'>[] })} />
        </Field>
        <Field label={tr.validGroupTypes} hint={tr.emptyAllSessions}>
          <ChipGroup size="sm" multiple options={(groupTypes ?? []).map((g) => ({ value: g.id, label: g.name }))} value={f.groupTypeIds} onChange={(v) => setF({ ...f, groupTypeIds: v as string[] })} />
        </Field>
        <div className="space-y-2">
          <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label={tr.active} />
          <Checkbox checked={f.isPublic} onChange={(v) => setF({ ...f, isPublic: v })} label={tr.clientsCanBuyApp} />
          <Checkbox checked={f.isFeatured} onChange={(v) => setF({ ...f, isFeatured: v })} label={tr.highlightMostPopular} />
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
