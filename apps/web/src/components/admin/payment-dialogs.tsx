'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Drawer, Modal } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminMethods, useAdminPlans } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { moneyMessages } from '@/lib/i18n/messages/admin/money';
import { membershipMessages, paymentMethodText } from '@/lib/i18n/messages/membership';

type AdminPayment = S<'AdminPaymentDto'>;
type ProductType = S<'ProductType'>;

function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['admin', 'payments'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'client'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'clients'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'memberships'] }),
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] }),
    ]);
}

/**
 * Payment request for a client — the Kaspi invoice workflow: create it as
 * pending (then confirm when Kaspi shows it paid), or record an already
 * received payment straight away.
 */
export function PaymentRequestDrawer({
  open,
  onOpenChange,
  clientId,
  clientName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
}) {
  const tr = useT(moneyMessages);
  const mt = useT(membershipMessages);
  const invalidate = useInvalidateMoney();
  const { data: plans } = useAdminPlans();
  const { data: methods } = useAdminMethods();
  const [productType, setProductType] = useState<ProductType>('MEMBERSHIP');
  const [planId, setPlanId] = useState('');
  const [amount, setAmount] = useState('');
  const [methodCode, setMethodCode] = useState('CASH');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [markPaid, setMarkPaid] = useState(false);
  const activePlans = (plans ?? []).filter((p) => p.isActive);
  const plan = activePlans.find((p) => p.id === planId);
  const manualMethods = (methods ?? []).filter((m) => m.isActive && m.provider === 'manual');

  const create = useMutation({
    mutationFn: () =>
      call(
        api.POST('/api/admin/payments', {
          body: {
            clientId,
            productType,
            planId: productType === 'MEMBERSHIP' ? planId : undefined,
            amount: amount ? Number(amount) : undefined,
            methodCode,
            reference: reference.trim() || undefined,
            description: description.trim() || undefined,
            notes: notes.trim() || undefined,
            markPaid,
          },
        }),
      ),
    onSuccess: async (p) => {
      await invalidate();
      toast.success(p.status === 'PAID' ? tr.paymentRecorded(!!p.membershipId) : tr.paymentRequestCreated);
      onOpenChange(false);
    },
  });
  const errors = fieldErrors(create.error);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={tr.paymentRequest2}
      description={clientName}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={create.isPending} disabled={(productType === 'MEMBERSHIP' && !planId) || (productType !== 'MEMBERSHIP' && !amount)} onClick={() => create.mutate()}>
            {markPaid ? tr.recordPayment : tr.createRequest}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr.for} htmlFor="pr-type">
          <Select id="pr-type" value={productType} onChange={(e) => setProductType(e.target.value as ProductType)}>
            <option value="MEMBERSHIP">{tr.membership}</option>
            <option value="TRIAL">{tr.trialSession}</option>
            <option value="OTHER">{tr.other}</option>
          </Select>
        </Field>
        {productType === 'MEMBERSHIP' && (
          <Field label={tr.plan} required htmlFor="pr-plan" error={errors.planId}>
            <Select id="pr-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">{tr.choosePlan}</option>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {tr.planOption(p.name, p.visits, p.validityDays)} · {fmt.money(p.price)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label={tr.amount}
          htmlFor="pr-amount"
          error={errors.amount}
          hint={productType === 'MEMBERSHIP' ? tr.leaveEmptyPlanPrice(plan ? fmt.money(plan.price) : undefined) : undefined}
        >
          <Input id="pr-amount" type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={tr.method} htmlFor="pr-method">
          <Select id="pr-method" value={methodCode} onChange={(e) => setMethodCode(e.target.value)}>
            {manualMethods.map((m) => (
              <option key={m.code} value={m.code}>
                {paymentMethodText(mt.methods, m).name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr.reference} htmlFor="pr-ref" hint={tr.kaspiInvoiceReceiptNumber}>
          <Input id="pr-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
        </Field>
        {productType !== 'MEMBERSHIP' && (
          <Field label={tr.description} htmlFor="pr-desc">
            <Input id="pr-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </Field>
        )}
        <Field label={tr.internalNote} htmlFor="pr-notes">
          <Textarea id="pr-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
        <Checkbox checked={markPaid} onChange={setMarkPaid} label={tr.paymentAlreadyReceived} description={tr.recordsPaidNowMembership} />
        {create.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(create.error)}</InlineAlert>}
      </div>
    </Drawer>
  );
}

/** Confirm a pending (e.g. Kaspi invoice) payment — activates the membership. */
export function ConfirmPaymentDialog({ payment, open, onOpenChange }: { payment: Pick<AdminPayment, 'id' | 'amount' | 'description' | 'reference'>; open: boolean; onOpenChange: (open: boolean) => void }) {
  const tr = useT(moneyMessages);
  const mt = useT(membershipMessages);
  const invalidate = useInvalidateMoney();
  const { data: methods } = useAdminMethods();
  const [reference, setReference] = useState(payment.reference ?? '');
  const [methodCode, setMethodCode] = useState('');
  const confirm = useMutation({
    mutationFn: () =>
      call(api.POST('/api/admin/payments/{id}/confirm', { params: { path: { id: payment.id } }, body: { reference: reference.trim() || undefined, methodCode: methodCode || undefined } })),
    onSuccess: async (p) => {
      await invalidate();
      toast.success(p.membershipId ? tr.paymentConfirmedMembershipActivated : tr.paymentConfirmed);
      onOpenChange(false);
    },
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={tr.confirmAmount(fmt.money(payment.amount))}
      description={payment.description ?? undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.notYet}
          </Button>
          <Button loading={confirm.isPending} onClick={() => confirm.mutate()}>
            {tr.confirmPayment}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr.kaspiReceiptReference} htmlFor="cp-ref">
          <Input id="cp-ref" value={reference} onChange={(e) => setReference(e.target.value)} autoFocus maxLength={120} />
        </Field>
        <Field label={tr.paid2} htmlFor="cp-method" hint={tr.onlyIfDifferentRequested}>
          <Select id="cp-method" value={methodCode} onChange={(e) => setMethodCode(e.target.value)}>
            <option value="">{tr.requested}</option>
            {(methods ?? [])
              .filter((m) => m.isActive)
              .map((m) => (
                <option key={m.code} value={m.code}>
                  {paymentMethodText(mt.methods, m).name}
                </option>
              ))}
          </Select>
        </Field>
        {confirm.error && <InlineAlert tone="danger">{errorMessage(confirm.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

/** Cancel a pending payment request, or refund a paid one. */
export function PaymentReasonDialog({
  payment,
  mode,
  open,
  onOpenChange,
}: {
  payment: Pick<AdminPayment, 'id' | 'amount' | 'refundedAmount' | 'membershipId'>;
  mode: 'cancel' | 'refund';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tr = useT(moneyMessages);
  const invalidate = useInvalidateMoney();
  const canRefund = useCan('payments.refund');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [cancelMembership, setCancelMembership] = useState(false);
  const refundable = payment.amount - payment.refundedAmount;
  const run = useMutation({
    mutationFn: () =>
      mode === 'cancel'
        ? call(api.POST('/api/admin/payments/{id}/cancel', { params: { path: { id: payment.id } }, body: { reason } }))
        : call(
            api.POST('/api/admin/payments/{id}/refund', {
              params: { path: { id: payment.id } },
              body: { reason, amount: amount ? Number(amount) : undefined, cancelMembership: payment.membershipId ? cancelMembership : undefined },
            }),
          ),
    onSuccess: async () => {
      await invalidate();
      toast.success(mode === 'cancel' ? tr.paymentRequestCancelled : tr.refundRecorded);
      onOpenChange(false);
    },
  });
  if (mode === 'refund' && !canRefund) return null;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'cancel' ? tr.cancelPaymentRequestQ : tr.refundUpTo(fmt.money(refundable))}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.back}
          </Button>
          <Button variant="danger" loading={run.isPending} disabled={reason.trim().length < 3} onClick={() => run.mutate()}>
            {mode === 'cancel' ? tr.cancelRequest : tr.recordRefund}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === 'refund' && (
          <Field label={tr.amount} htmlFor="rf-amount" hint={tr.leaveEmptyFullRefund}>
            <Input id="rf-amount" type="number" min={1} max={refundable} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
        <Field label={tr.reason} required htmlFor="rf-reason">
          <Textarea id="rf-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
        </Field>
        {mode === 'refund' && payment.membershipId && (
          <Checkbox checked={cancelMembership} onChange={setCancelMembership} label={tr.alsoCancelMembership} description={tr.remainingVisitsRemoved} />
        )}
        {run.error && <InlineAlert tone="danger">{errorMessage(run.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}
