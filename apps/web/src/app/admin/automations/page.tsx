'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Trash2, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { asDefinition, RuleBuilder } from '@/components/admin/rule-builder';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, InlineAlert, SkeletonList, StatusBadge } from '@/components/ui/feedback';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/inputs';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/layout';
import { ConfirmDialog, Drawer } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { useAdminTeam, useAdminTags } from '@/lib/admin-queries';
import { fmt } from '@/lib/format';
import { messagesFor, useT } from '@/lib/i18n';
import { marketingMessages } from '@/lib/i18n/messages/admin/marketing';
import { crmMessages } from '@/lib/i18n/messages/admin/crm';

type Rule = S<'AutomationRuleDto'>;
type Trigger = S<'AutomationTrigger'>;
type Action = Record<string, unknown> & { type: string };
const KEY = ['admin', 'automations'];

const STAGES = ['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'MEMBERSHIP_PURCHASED', 'ACTIVE_CLIENT', 'MEMBERSHIP_EXPIRING', 'RENEWED', 'INACTIVE', 'LOST'];

function useMeta() {
  return useQuery({ queryKey: ['admin', 'automations', 'meta'], queryFn: () => call(api.GET('/api/admin/automations/meta')), staleTime: Infinity });
}

function describeAction(a: Action, templates: Array<{ key: string; name: string }>): string {
  const tr = messagesFor(marketingMessages);
  switch (a.type) {
    case 'SEND_NOTIFICATION':
      return a.templateKey
        ? tr.sendTemplate(tr.templateNames[String(a.templateKey)] ?? templates.find((t) => t.key === a.templateKey)?.name ?? String(a.templateKey))
        : tr.sendTemplate(String(a.title ?? tr.messageWord));
    case 'CREATE_TASK':
      return tr.createTaskNamed(String(a.title));
    case 'ADD_TAG':
      return tr.addTagAction;
    case 'SET_LEAD_STAGE':
      return tr.moveTo(messagesFor(crmMessages).stages[String(a.stage)] ?? String(a.stage));
    default:
      return a.type;
  }
}

export default function AutomationsPage() {
  const tr = useT(marketingMessages);
  const qc = useQueryClient();
  const meta = useMeta();
  const rules = useQuery({ queryKey: KEY, queryFn: () => call(api.GET('/api/admin/automations')) });
  const runs = useQuery({ queryKey: ['admin', 'automations', 'runs'], queryFn: () => call(api.GET('/api/admin/automations/runs', { params: { query: { limit: 100 } } })) });
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const toggle = useMutation({
    mutationFn: (r: Rule) => call(api.PATCH('/api/admin/automations/{id}', { params: { path: { id: r.id } }, body: { isActive: !r.isActive } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: toastError,
  });
  const triggers = meta.data?.triggers ?? [];
  const templates = meta.data?.templates ?? [];

  return (
    <AdminPage
      title={tr.automations}
      description={tr.rulesReactEventsRegistration}
      actions={
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          {tr.newRule}
        </Button>
      }
    >
      <Tabs defaultValue="rules">
        <TabsList className="max-w-xs">
          <TabsTrigger value="rules">{tr.rules}</TabsTrigger>
          <TabsTrigger value="runs">{tr.activityLog}</TabsTrigger>
        </TabsList>
        <TabsContent value="rules">
          {rules.isLoading ? (
            <SkeletonList count={6} />
          ) : rules.error ? (
            <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {rules.data?.map((r) => {
                const trig = triggers.find((t) => t.trigger === r.trigger);
                const cfg = r.triggerConfig as Record<string, number>;
                return (
                  <Card key={r.id} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" className="min-w-0 text-left" onClick={() => setEditing(r)}>
                        <p className="font-semibold hover:text-brand-700">{r.name}</p>
                        {r.description && <p className="text-sm text-muted">{r.description}</p>}
                      </button>
                      <Switch checked={r.isActive} onChange={() => toggle.mutate(r)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge tone="brand">
                        <Zap className="h-3 w-3" /> {trig?.label ?? r.trigger}
                        {trig?.config ? `: ${cfg[trig.config]}` : ''}
                      </Badge>
                      {r.conditions.length > 0 && <Badge>{tr.conditions(r.conditions.length)}</Badge>}
                      {r.delayMinutes > 0 && <Badge>{tr.afterDelay(fmt.minutesAsHours(r.delayMinutes))}</Badge>}
                      {r.isSystem && <Badge>{tr.builtIn}</Badge>}
                    </div>
                    <ul className="space-y-0.5 text-sm">
                      {(r.actions as Action[]).map((a, i) => (
                        <li key={i}>→ {describeAction(a, templates)}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted">
                      {tr.runs(r.runCount, r.lastRunAt ? fmt.relative(r.lastRunAt) : null)}
                      {r.stats ? tr.runStats(r.stats.completed, r.stats.skipped, r.stats.failed) : ''}
                    </p>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="runs">
          <Card padded={false} className="divide-y divide-line/70">
            {runs.data?.length ? (
              runs.data.map((run) => (
                <div key={run.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <StatusBadge status={run.status} />
                  <span className="font-medium">{run.rule.name}</span>
                  {run.client && <span className="text-muted">· {[run.client.firstName, run.client.lastName].filter(Boolean).join(' ')}</span>}
                  {run.error && <span className="text-danger-700">· {run.error}</span>}
                  <span className="ml-auto text-xs text-muted">{fmt.dateTime(run.executedAt ?? run.scheduledFor)}</span>
                </div>
              ))
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted">{tr.noRunsYet}</p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
      <RuleDrawer rule={editing === 'new' ? undefined : (editing ?? undefined)} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </AdminPage>
  );
}

function RuleDrawer({ rule, open, onOpenChange }: { rule?: Rule; open: boolean; onOpenChange: (o: boolean) => void }) {
  const tr = useT(marketingMessages);
  const crm = useT(crmMessages);
  const qc = useQueryClient();
  const meta = useMeta();
  const { data: tags } = useAdminTags();
  const { data: staff } = useAdminTeam(open);
  const [deleting, setDeleting] = useState(false);
  const init = () => ({
    name: rule?.name ?? '',
    description: rule?.description ?? '',
    trigger: (rule?.trigger ?? 'CLIENT_REGISTERED') as Trigger,
    triggerConfig: (rule?.triggerConfig ?? {}) as Record<string, number>,
    conditions: asDefinition({ match: 'all', rules: rule?.conditions ?? [] }),
    actions: (rule?.actions ?? [{ type: 'SEND_NOTIFICATION', templateKey: '' }]) as Action[],
    delayMinutes: String(rule?.delayMinutes ?? 0),
    isActive: rule?.isActive ?? true,
  });
  const [f, setF] = useState(init);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setF(init());
  }
  const trig = meta.data?.triggers.find((t) => t.trigger === f.trigger);
  const setAction = (i: number, a: Action) => setF({ ...f, actions: f.actions.map((x, j) => (j === i ? a : x)) });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(),
        description: f.description.trim() || undefined,
        trigger: f.trigger,
        triggerConfig: trig?.config ? { [trig.config]: Number(f.triggerConfig[trig.config] ?? 0) } : {},
        conditions: f.conditions.rules as unknown as Record<string, never>[],
        actions: f.actions.map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== '' && v !== undefined))) as unknown as Record<string, never>[],
        delayMinutes: Number(f.delayMinutes) || 0,
        isActive: f.isActive,
      };
      return rule ? call(api.PATCH('/api/admin/automations/{id}', { params: { path: { id: rule.id } }, body })) : call(api.POST('/api/admin/automations', { body }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      toast.success(tr.ruleSaved);
      onOpenChange(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => call(api.DELETE('/api/admin/automations/{id}', { params: { path: { id: rule!.id } } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: KEY });
      setDeleting(false);
      onOpenChange(false);
    },
    onError: toastError,
  });
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? rule.name : tr.newAutomation}
      width="xl"
      footer={
        <>
          {rule && !rule.isSystem && (
            <Button variant="ghost" className="mr-auto text-danger-700" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>
              {tr.delete}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tr.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!f.name.trim() || !f.actions.length} onClick={() => save.mutate()}>
            {tr.saveRule}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr.name} required htmlFor="au-name">
            <Input id="au-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={tr.active} htmlFor="au-active">
            <div className="flex h-12 items-center">
              <Switch checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label={f.isActive ? tr.on : tr.off} />
            </div>
          </Field>
        </div>
        <Field label={tr.description} htmlFor="au-desc">
          <Textarea id="au-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <section className="space-y-3 rounded-2xl border border-line p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="h-4 w-4 text-brand-700" /> When
          </p>
          <div className="flex flex-wrap gap-2">
            <Select value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value as Trigger, triggerConfig: {} })} className="w-72" aria-label={tr.trigger}>
              {meta.data?.triggers.map((t) => (
                <option key={t.trigger} value={t.trigger}>
                  {tr.triggerLabels[t.trigger] ?? t.label} {t.kind === 'schedule' ? tr.dailyCheck : ''}
                </option>
              ))}
            </Select>
            {trig?.config && (
              <Input
                type="number"
                min={0}
                className="w-28"
                aria-label={trig.config}
                value={String(f.triggerConfig[trig.config] ?? '')}
                onChange={(e) => setF({ ...f, triggerConfig: { [trig.config!]: Number(e.target.value) } })}
              />
            )}
            <Input type="number" min={0} className="w-36" aria-label={tr.delayMinutes} placeholder={tr.delayMin} value={f.delayMinutes} onChange={(e) => setF({ ...f, delayMinutes: e.target.value })} />
          </div>
          <p className="text-xs text-muted">{tr.delayWaitManyMinutes}</p>
        </section>
        <section className="space-y-3 rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold">{tr.onlyIfClientMatches}</p>
          <RuleBuilder value={f.conditions} onChange={(conditions) => setF({ ...f, conditions: { ...conditions, match: 'all' } })} allowMatch={false} />
        </section>
        <section className="space-y-3 rounded-2xl border border-line p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4 text-brand-700" /> Then
          </p>
          {f.actions.map((a, i) => (
            <div key={i} className="space-y-2 rounded-2xl bg-canvas p-3">
              <div className="flex gap-2">
                <Select value={a.type} onChange={(e) => setAction(i, { type: e.target.value })} className="h-10 w-64" aria-label={tr.action}>
                  <option value="SEND_NOTIFICATION">{tr.sendNotification}</option>
                  <option value="CREATE_TASK">{tr.createTaskStaff}</option>
                  <option value="ADD_TAG">{tr.addTag}</option>
                  <option value="SET_LEAD_STAGE">{tr.changeCrmStage}</option>
                </Select>
                <button type="button" className="ml-auto rounded-xl p-2 text-muted hover:bg-white" aria-label={tr.removeAction} onClick={() => setF({ ...f, actions: f.actions.filter((_, j) => j !== i) })}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              {a.type === 'SEND_NOTIFICATION' && (
                <>
                  <Select value={String(a.templateKey ?? '')} onChange={(e) => setAction(i, { ...a, templateKey: e.target.value })} className="h-10" aria-label={tr.template}>
                    <option value="">{tr.customText}</option>
                    {meta.data?.templates.map((t) => (
                      <option key={t.key} value={t.key}>
                        {tr.templateNames[t.key] ?? t.name}
                      </option>
                    ))}
                  </Select>
                  {!a.templateKey && (
                    <>
                      <Input className="h-10" placeholder={tr.title} value={String(a.title ?? '')} onChange={(e) => setAction(i, { ...a, title: e.target.value })} />
                      <Textarea rows={3} placeholder="Message — {{firstName}} works" value={String(a.body ?? '')} onChange={(e) => setAction(i, { ...a, body: e.target.value })} />
                      <Select value={String(a.category ?? 'TRANSACTIONAL')} onChange={(e) => setAction(i, { ...a, category: e.target.value })} className="h-10" aria-label={tr.category}>
                        <option value="TRANSACTIONAL">{tr.serviceMessage}</option>
                        <option value="REMINDER">{tr.reminder}</option>
                        <option value="MARKETING">{tr.marketingOptOnly}</option>
                      </Select>
                    </>
                  )}
                </>
              )}
              {a.type === 'CREATE_TASK' && (
                <>
                  <Input className="h-10" placeholder={tr.taskTitlePlaceholder} value={String(a.title ?? '')} onChange={(e) => setAction(i, { ...a, title: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    <Select value={String(a.priority ?? 'MEDIUM')} onChange={(e) => setAction(i, { ...a, priority: e.target.value })} className="h-10 w-36" aria-label={tr.priority}>
                      <option value="LOW">{tr.low}</option>
                      <option value="MEDIUM">{tr.medium}</option>
                      <option value="HIGH">{tr.high}</option>
                      <option value="URGENT">{tr.urgent}</option>
                    </Select>
                    <Input type="number" min={0} className="h-10 w-40" placeholder={tr.dueHours} value={String(a.dueInHours ?? '')} onChange={(e) => setAction(i, { ...a, dueInHours: e.target.value ? Number(e.target.value) : undefined })} />
                    <Select value={String(a.assignToUserId ?? '')} onChange={(e) => setAction(i, { ...a, assignToUserId: e.target.value || undefined })} className="h-10 w-56" aria-label={tr.assignee}>
                      <option value="">{tr.unassigned}</option>
                      {staff?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                    </Select>
                  </div>
                </>
              )}
              {a.type === 'ADD_TAG' && (
                <Select value={String(a.tagId ?? '')} onChange={(e) => setAction(i, { ...a, tagId: e.target.value })} className="h-10" aria-label={tr.tag}>
                  <option value="">{tr.chooseTag}</option>
                  {tags?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
              {a.type === 'SET_LEAD_STAGE' && (
                <Select value={String(a.stage ?? 'CONTACTED')} onChange={(e) => setAction(i, { ...a, stage: e.target.value })} className="h-10" aria-label={tr.stage}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {crm.stages[s] ?? s}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          ))}
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setF({ ...f, actions: [...f.actions, { type: 'CREATE_TASK', title: '' }] })}>
            {tr.addAction}
          </Button>
        </section>
        {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={tr.deleteRule} confirmLabel={tr.delete} tone="danger" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </Drawer>
  );
}
