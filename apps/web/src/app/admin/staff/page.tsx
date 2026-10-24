'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, Plus, ShieldCheck, UserPlus } from 'lucide-react';
import { Suspense, useState } from 'react';
import { AdminPage } from '@/components/admin/page';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, ErrorState, InlineAlert, SkeletonList, statusLabel } from '@/components/ui/feedback';
import { Checkbox, ChipGroup, Field, Input, PhoneInput, Select } from '@/components/ui/inputs';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/layout';
import { Drawer, Modal } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorMessage, fieldErrors } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys, useAdminStaff, useUrlState } from '@/lib/admin-queries';
import { useAuth, useCan } from '@/lib/auth';
import { fmt, phoneDigitsComplete } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { teamMessages } from '@/lib/i18n/messages/admin/team';

type Staff = S<'StaffUserDto'>;
type Role = S<'RoleDto'>;

function useRoles(enabled = true) {
  return useQuery({ queryKey: adminKeys.roles, queryFn: () => call(api.GET('/api/admin/roles')), enabled });
}

function StaffAndRoles() {
  const tr = useT(teamMessages);
  const url = useUrlState();
  const canStaff = useCan('staff.manage');
  const canRoles = useCan('roles.manage');
  const tab = url.get('tab', canStaff ? 'staff' : 'roles');
  return (
    <AdminPage title={tr.staffRoles} description={tr.whoCanDoWhat}>
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v })}>
        <TabsList className="max-w-xs">
          {canStaff && <TabsTrigger value="staff">{tr.staff}</TabsTrigger>}
          {canRoles && <TabsTrigger value="roles">{tr.rolesPermissions}</TabsTrigger>}
        </TabsList>
        {canStaff && (
          <TabsContent value="staff">
            <StaffList />
          </TabsContent>
        )}
        {canRoles && (
          <TabsContent value="roles">
            <RolesEditor />
          </TabsContent>
        )}
      </Tabs>
    </AdminPage>
  );
}

function StaffList() {
  const tr = useT(teamMessages);
  const { data, isLoading, error, refetch } = useAdminStaff();
  const { data: roles } = useRoles();
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);
  const roleName = (key: string) => roles?.find((r) => r.key === key)?.name ?? key.toLowerCase().replace(/_/g, ' ');
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          {tr.addStaffMember}
        </Button>
      </div>
      {isLoading ? (
        <SkeletonList count={4} />
      ) : (
        <Card padded={false} className="divide-y divide-line/70">
          {data?.map((s) => (
            <button key={s.id} type="button" onClick={() => setEditing(s)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left hover:bg-brand-50/40">
              <Avatar name={s.displayName ?? s.email} size="sm" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{s.displayName ?? '—'}</p>
                <p className="text-xs text-muted">
                  {s.email}
                  {s.phone ? ` · ${fmt.phone(s.phone)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {s.roles.map((r) => (
                  <Badge key={r} tone="brand">
                    {roleName(r)}
                  </Badge>
                ))}
                {s.status !== 'ACTIVE' && <Badge tone="danger">{statusLabel(s.status)}</Badge>}
              </div>
              <span className="w-36 text-right text-xs text-muted">{s.lastLoginAt ? tr.seenAgo(fmt.relative(s.lastLoginAt)) : tr.neverSignedIn}</span>
            </button>
          ))}
        </Card>
      )}
      <StaffDrawer staff={editing === 'new' ? undefined : (editing ?? undefined)} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}

function StaffDrawer({ staff, open, onOpenChange }: { staff?: Staff; open: boolean; onOpenChange: (o: boolean) => void }) {
  const tr = useT(teamMessages);
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: roles } = useRoles(open);
  const [f, setF] = useState({ displayName: '', email: '', phone: '', roles: [] as string[], status: 'ACTIVE' as 'ACTIVE' | 'BLOCKED' });
  const [secret, setSecret] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (staff?.id ?? 'new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setF({ displayName: staff?.displayName ?? '', email: staff?.email ?? '', phone: staff?.phone ? fmt.phone(staff.phone) : '', roles: staff?.roles ?? [], status: (staff?.status as 'ACTIVE' | 'BLOCKED') ?? 'ACTIVE' });
      setSecret(null);
    }
  }
  const self = staff?.id === user?.id;
  const save = useMutation({
    mutationFn: () =>
      staff
        ? call(api.PATCH('/api/admin/staff/{id}', { params: { path: { id: staff.id } }, body: { displayName: f.displayName.trim(), roles: f.roles, status: self ? undefined : f.status } }))
        : call(api.POST('/api/admin/staff', { body: { displayName: f.displayName.trim(), email: f.email.trim(), phone: phoneDigitsComplete(f.phone) ? f.phone.replace(/\s/g, '') : undefined, roles: f.roles } })),
    onSuccess: async (r) => {
      await Promise.all([qc.invalidateQueries({ queryKey: adminKeys.staff }), qc.invalidateQueries({ queryKey: adminKeys.team }), qc.invalidateQueries({ queryKey: adminKeys.roles })]);
      const temp = (r as S<'StaffCreatedDto'>).temporaryPassword;
      if (temp) setSecret(temp);
      else {
        toast.success(tr.saved);
        onOpenChange(false);
      }
    },
  });
  const reset = useMutation({
    mutationFn: () => call(api.POST('/api/admin/staff/{id}/reset-password', { params: { path: { id: staff!.id } }, body: {} })),
    onSuccess: (r) => r.temporaryPassword && setSecret(r.temporaryPassword),
    onError: toastError,
  });
  const errors = fieldErrors(save.error);
  const staffRoles = (roles ?? []).filter((r) => r.key !== 'CLIENT');
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={staff ? (staff.displayName ?? staff.email ?? tr.staffMember) : tr.newStaffMember}
      footer={
        secret ? (
          <Button onClick={() => onOpenChange(false)}>{tr.done}</Button>
        ) : (
          <>
            {staff && (
              <Button variant="outline" className="mr-auto" leftIcon={<KeyRound className="h-4 w-4" />} loading={reset.isPending} onClick={() => reset.mutate()}>
                {tr.resetPassword}
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {tr.cancel}
            </Button>
            <Button loading={save.isPending} disabled={!f.displayName.trim() || (!staff && !f.email.includes('@')) || !f.roles.length} onClick={() => save.mutate()}>
              {staff ? tr.save : tr.createAccount}
            </Button>
          </>
        )
      }
    >
      {secret ? (
        <div className="space-y-3 text-sm">
          <InlineAlert tone="success" title={tr.temporaryPassword}>
            {tr.shownOnlyOnceShare}
          </InlineAlert>
          <p className="select-all rounded-2xl bg-canvas p-4 font-mono text-lg font-semibold">{secret}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={tr.name} required htmlFor="st-name" error={errors.displayName}>
            <Input id="st-name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
          </Field>
          <Field label={tr.emailLogin} required htmlFor="st-email" error={errors.email}>
            <Input id="st-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} disabled={!!staff} />
          </Field>
          {!staff && (
            <Field label={tr.phone} htmlFor="st-phone" error={errors.phone}>
              <PhoneInput id="st-phone" value={f.phone} onChange={(phone) => setF({ ...f, phone })} />
            </Field>
          )}
          <Field label={tr.roles} hint={self ? tr.cannotRemoveOwnSuperAdmin : undefined}>
            <ChipGroup size="sm" multiple options={staffRoles.map((r) => ({ value: r.key, label: r.name }))} value={f.roles} onChange={(v) => setF({ ...f, roles: v as string[] })} />
          </Field>
          {staff && !self && (
            <Field label={tr.status} htmlFor="st-status">
              <Select id="st-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as 'ACTIVE' | 'BLOCKED' })}>
                <option value="ACTIVE">{tr.active}</option>
                <option value="BLOCKED">{tr.blockedCannotSign}</option>
              </Select>
            </Field>
          )}
          {save.error && !Object.keys(errors).length && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
        </div>
      )}
    </Drawer>
  );
}

function RolesEditor() {
  const tr = useT(teamMessages);
  const qc = useQueryClient();
  const roles = useRoles();
  const permissions = useQuery({ queryKey: adminKeys.permissions, queryFn: () => call(api.GET('/api/admin/permissions')), staleTime: Infinity });
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [creating, setCreating] = useState(false);
  const role = roles.data?.find((r) => r.id === selected) ?? roles.data?.[0];
  const current = draft ?? role?.permissions ?? [];
  const groups = new Map<string, S<'PermissionDto'>[]>();
  for (const p of permissions.data ?? []) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  const save = useMutation({
    mutationFn: () => call(api.PATCH('/api/admin/roles/{id}', { params: { path: { id: role!.id } }, body: { permissions: current } })),
    onSuccess: (list) => {
      qc.setQueryData(adminKeys.roles, list);
      setDraft(null);
      toast.success(tr.permissionsSavedTheyApply);
    },
    onError: toastError,
  });
  const locked = role?.key === 'SUPER_ADMIN';
  if (roles.error) return <ErrorState error={roles.error} onRetry={() => roles.refetch()} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-2">
        {roles.data?.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              setSelected(r.id);
              setDraft(null);
            }}
            className={cn('flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition', role?.id === r.id ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-line hover:ring-brand-200')}
          >
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                {r.isSystem && <Lock className="h-3 w-3 opacity-70" />} {r.name}
              </span>
              <span className={cn('text-xs', role?.id === r.id ? 'text-white/75' : 'text-muted')}>
                {tr.permissionsPeople(r.permissions.length, r.userCount)}
              </span>
            </span>
          </button>
        ))}
        <Button size="sm" variant="outline" block leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          {tr.newRole}
        </Button>
      </div>
      {role && (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-display text-lg font-semibold">
                <ShieldCheck className="h-5 w-5 text-brand-700" /> {role.name}
              </p>
              {role.description && <p className="text-sm text-muted">{role.description}</p>}
            </div>
            {!locked && (
              <Button loading={save.isPending} disabled={!draft} onClick={() => save.mutate()}>
                {tr.savePermissions}
              </Button>
            )}
          </div>
          {locked && <InlineAlert tone="info">{tr.superAdminRoleAlways}</InlineAlert>}
          <div className="grid gap-5 md:grid-cols-2">
            {[...groups.entries()].map(([group, perms]) => (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{group}</p>
                <div className="space-y-2">
                  {perms.map((p) => (
                    <Checkbox
                      key={p.key}
                      disabled={locked}
                      checked={locked || current.includes(p.key)}
                      onChange={(v) => setDraft(v ? [...current, p.key] : current.filter((k) => k !== p.key))}
                      label={p.description}
                      description={p.key}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {creating && <NewRoleDialog onClose={() => setCreating(false)} onCreated={(id) => setSelected(id)} />}
    </div>
  );
}

function NewRoleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const tr = useT(teamMessages);
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () => call(api.POST('/api/admin/roles', { body: { name: name.trim(), key: (key || name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'), description: description.trim() || undefined, permissions: ['dashboard.view'] } })),
    onSuccess: (list) => {
      qc.setQueryData(adminKeys.roles, list);
      const created = list.find((r: Role) => r.name === name.trim());
      if (created) onCreated(created.id);
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={tr.newRole}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.cancel}
          </Button>
          <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            {tr.create}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={tr.name} htmlFor="nr-name">
          <Input id="nr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr.eGReception} autoFocus />
        </Field>
        <Field label={tr.key} htmlFor="nr-key" hint={tr.autoGeneratedNameIf}>
          <Input id="nr-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder={tr.reception} />
        </Field>
        <Field label={tr.description} htmlFor="nr-desc">
          <Input id="nr-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {create.error && <InlineAlert tone="danger">{errorMessage(create.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

export default function StaffPage() {
  return (
    <Suspense>
      <StaffAndRoles />
    </Suspense>
  );
}
