'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Drawer, Modal } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminPlans } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { clubNow, fmt } from '@/lib/format';
import { cn } from '@/lib/utils';

type Membership = S<'MembershipDto'>;
export type MembershipAction = 'extend' | 'expiry' | 'adjust' | 'cancel';

function useInvalidateMemberships() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['admin', 'memberships'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'membership'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'client'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'clients'] }),
    ]);
}

/** Give a client a membership without payment (gift, compensation, migration). */
export function GrantMembershipDrawer({ open, onOpenChange, clientId, clientName }: { open: boolean; onOpenChange: (o: boolean) => void; clientId: string; clientName: string }) {
  const invalidate = useInvalidateMemberships();
  const { data: plans } = useAdminPlans();
  const [planId, setPlanId] = useState('');
  const [startsAt, setStartsAt] = useState(clubNow().toISODate()!);
  const [visits, setVisits] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [reason, setReason] = useState('');
  const plan = plans?.find((p) => p.id === planId);
  const grant = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/admin/memberships', {
          body: { clientId, planId, startsAt, visits: visits ? Number(visits) : undefined, validityDays: validityDays ? Number(validityDays) : undefined, reason },
        }),
      ),
    onSuccess: async () => {
      await invalidate();
      toast.success('Membership granted.');
      onOpenChange(false);
    },
  });
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Grant membership"
      description={`${clientName} · no payment is recorded`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={grant.isPending} disabled={!planId || reason.trim().length < 3} onClick={() => grant.mutate()}>
            Grant
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">To sell a membership, create a payment request instead — the membership activates when it is paid.</InlineAlert>
        <Field label="Plan" required htmlFor="gm-plan">
          <Select id="gm-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Choose…</option>
            {plans?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.visits} visits, {p.validityDays} days
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Starts on" htmlFor="gm-start">
          <Input id="gm-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Visits" htmlFor="gm-visits" hint={plan ? `Plan: ${plan.visits}` : undefined}>
            <Input id="gm-visits" type="number" min={1} value={visits} onChange={(e) => setVisits(e.target.value)} />
          </Field>
          <Field label="Valid for, days" htmlFor="gm-days" hint={plan ? `Plan: ${plan.validityDays}` : undefined}>
            <Input id="gm-days" type="number" min={1} value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason" required htmlFor="gm-reason" hint="Recorded in the visit ledger and audit log">
          <Textarea id="gm-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Compensation for a cancelled session" />
        </Field>
        {grant.error && <InlineAlert tone="danger">{errorMessage(grant.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}

/** Extend, change expiry, adjust visits or cancel — every change needs a reason (ledger + audit log). */
export function MembershipActionDialog({ membership, action, open, onOpenChange }: { membership: Membership; action: MembershipAction; open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidateMemberships();
  const [days, setDays] = useState('7');
  const [expiresOn, setExpiresOn] = useState(membership.expiresOn);
  const [delta, setDelta] = useState('1');
  const [reason, setReason] = useState('');
  const id = membership.id;
  const run = useMutation({
    mutationFn: () => {
      const path = { params: { path: { id } } };
      switch (action) {
        case 'extend':
          return call(api.POST('/api/admin/memberships/{id}/extend', { ...path, body: { days: Number(days), reason } }));
        case 'expiry':
          return call(api.POST('/api/admin/memberships/{id}/expiry', { ...path, body: { expiresOn, reason } }));
        case 'adjust':
          return call(api.POST('/api/admin/memberships/{id}/adjust-visits', { ...path, body: { delta: Number(delta), reason } }));
        default:
          return call(api.POST('/api/admin/memberships/{id}/cancel', { ...path, body: { reason } }));
      }
    },
    onSuccess: async () => {
      await invalidate();
      toast.success('Membership updated.');
      onOpenChange(false);
    },
  });
  const titles: Record<MembershipAction, string> = {
    extend: 'Extend membership',
    expiry: 'Change expiry date',
    adjust: 'Adjust visits',
    cancel: 'Cancel membership?',
  };
  const invalid = reason.trim().length < 3 || (action === 'adjust' && (!Number(delta) || membership.visitsRemaining + Number(delta) < 0)) || (action === 'extend' && !(Number(days) > 0));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={titles[action]}
      description={`${membership.planName} · ${membership.visitsRemaining} visits left · until ${fmt.date(membership.expiresAt)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button variant={action === 'cancel' ? 'danger' : 'primary'} loading={run.isPending} disabled={invalid} onClick={() => run.mutate()}>
            {action === 'cancel' ? 'Cancel membership' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action === 'extend' && (
          <Field label="Add days" htmlFor="ma-days">
            <Input id="ma-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        )}
        {action === 'expiry' && (
          <Field label="New last day" htmlFor="ma-exp">
            <Input id="ma-exp" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </Field>
        )}
        {action === 'adjust' && (
          <Field label="Change in visits" htmlFor="ma-delta" hint="Use a negative number to remove visits">
            <Input id="ma-delta" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </Field>
        )}
        {action === 'cancel' && <InlineAlert tone="warning">The membership stops immediately and remaining visits can no longer be used. Existing bookings stay.</InlineAlert>}
        <Field label="Reason" required htmlFor="ma-reason">
          <Textarea id="ma-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
        {run.error && <InlineAlert tone="danger">{errorMessage(run.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

const TX_LABEL: Record<string, string> = {
  PURCHASE: 'Purchased',
  GRANT: 'Granted',
  BOOKING: 'Booked',
  CANCELLATION_REFUND: 'Cancelled in time',
  SESSION_CANCELLED_REFUND: 'Session cancelled',
  ADMIN_RETURN: 'Returned by staff',
  ADMIN_ADJUSTMENT: 'Adjusted',
  EXTENSION: 'Extended',
};

/** Membership detail with the full visit ledger and the correction actions. */
export function MembershipDrawer({ membershipId, open, onOpenChange }: { membershipId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const canManage = useCan('memberships.manage');
  const [action, setAction] = useState<MembershipAction | null>(null);
  const { data } = useQuery({
    queryKey: ['admin', 'membership', membershipId],
    queryFn: () => call(api.GET('/api/admin/memberships/{id}', { params: { path: { id: membershipId! } } })),
    enabled: open && !!membershipId,
  });
  const active = data && (data.status === 'ACTIVE' || data.status === 'NOT_STARTED' || data.status === 'USED_UP');
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={data ? data.planName : 'Membership'} description={data ? `${fmt.date(data.startsAt)} – ${fmt.date(data.expiresAt)}` : undefined} width="lg">
      {!data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-brand-50 p-3">
              <p className="font-display text-2xl font-semibold text-brand-800">{data.visitsRemaining}</p>
              <p className="text-xs text-muted">remaining</p>
            </div>
            <div className="rounded-2xl bg-canvas p-3">
              <p className="font-display text-2xl font-semibold">{data.visitsUsed}</p>
              <p className="text-xs text-muted">used</p>
            </div>
            <div className="rounded-2xl bg-canvas p-3">
              <p className="font-display text-2xl font-semibold">{data.daysLeft}</p>
              <p className="text-xs text-muted">days left</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <StatusBadge status={data.status} />
            <span className="text-sm text-muted">
              {fmt.money(data.price)} · {data.visitsCredited} visits credited
            </span>
          </div>
          {canManage && active && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAction('extend')}>
                Extend
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAction('expiry')}>
                Change expiry
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAction('adjust')}>
                Adjust visits
              </Button>
              <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => setAction('cancel')}>
                Cancel
              </Button>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Visit ledger</h3>
            <div className="divide-y divide-line/70 rounded-2xl border border-line">
              {data.transactions.map((t) => (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <span className={cn('w-10 shrink-0 text-right font-display font-semibold', t.delta > 0 ? 'text-success-700' : t.delta < 0 ? 'text-ink' : 'text-muted')}>
                    {t.delta > 0 ? `+${t.delta}` : t.delta === 0 ? '·' : t.delta}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{TX_LABEL[t.type] ?? t.type}</p>
                    {t.booking && (
                      <p className="text-muted">
                        {t.booking.session.title} · {fmt.weekdayDate(t.booking.session.startsAt)} {fmt.time(t.booking.session.startsAt)}
                        {t.booking.session.teacherName ? ` · ${t.booking.session.teacherName}` : ''}
                      </p>
                    )}
                    {t.reason && <p className="text-muted">{t.reason}</p>}
                    <p className="text-xs text-subtle">
                      {fmt.dateTime(t.createdAt)}
                      {t.createdByLabel ? ` · ${t.createdByLabel}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted">= {t.balanceAfter}</span>
                </div>
              ))}
            </div>
          </div>
          {action && <MembershipActionDialog membership={data} action={action} open onOpenChange={(o) => !o && setAction(null)} />}
        </div>
      )}
    </Drawer>
  );
}
