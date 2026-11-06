'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, InlineAlert, Skeleton } from '@/components/ui/feedback';
import { Checkbox, ChipGroup, Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Card, Section } from '@/components/ui/layout';
import { Modal } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { adminKeys, useAdminGroupTypes, useAdminLevels, useAdminLocations, useAdminMethods, useAdminRooms, useAdminSources } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { CATEGORY_LABELS, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { settingsMessages } from '@/lib/i18n/messages/admin/settings';

type Location = S<'LocationDto'>;
type Hours = Record<string, { open: string; close: string } | null>;

// ─── Location & rooms ───

export function LocationsSection() {
  const tr = useT(settingsMessages);
  const { data: locations, isLoading } = useAdminLocations();
  const { data: rooms } = useAdminRooms();
  const canRooms = useCan('rooms.manage');
  const [editingRoom, setEditingRoom] = useState<S<'RoomDto'> | 'new' | null>(null);
  if (isLoading) return <Skeleton className="h-64 w-full rounded-3xl" />;
  return (
    <div className="space-y-6">
      {locations?.map((l) => <LocationCard key={l.id} location={l} editable={canRooms} />)}
      <Section
        title={tr.rooms}
        action={
          canRooms && (
            <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditingRoom('new')}>
              {tr.addRoom}
            </Button>
          )
        }
      >
        <Card padded={false} className="divide-y divide-line/70">
          {rooms?.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="font-semibold">{r.name}</span>
              <span className="text-muted">{tr.seatsCount(r.capacity)}</span>
              {!r.isActive && <Badge>{tr.inactive}</Badge>}
              {r.description && <span className="truncate text-muted">· {r.description}</span>}
              {canRooms && (
                <button type="button" className="ml-auto rounded-lg p-1.5 text-muted hover:bg-brand-50" onClick={() => setEditingRoom(r)} aria-label={tr.editName(r.name)}>
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </Card>
      </Section>
      {editingRoom && <RoomDialog room={editingRoom === 'new' ? undefined : editingRoom} locationId={locations?.[0]?.id ?? ''} onClose={() => setEditingRoom(null)} />}
    </div>
  );
}

function LocationCard({ location, editable }: { location: Location; editable: boolean }) {
  const tr = useT(settingsMessages);
  const qc = useQueryClient();
  const init = () => ({
    name: location.name,
    address: location.address,
    addressDetails: location.addressDetails ?? '',
    city: location.city,
    phone: location.phone ?? '',
    email: location.email ?? '',
    directions: location.directions ?? '',
    latitude: location.latitude === null ? '' : String(location.latitude),
    longitude: location.longitude === null ? '' : String(location.longitude),
    workingHours: (location.workingHours ?? {}) as Hours,
  });
  const [f, setF] = useState(init);
  const save = useMutation({
    mutationFn: () =>
      call(
        api.PATCH('/api/admin/locations/{id}', {
          params: { path: { id: location.id } },
          body: {
            name: f.name,
            address: f.address,
            addressDetails: f.addressDetails,
            city: f.city,
            phone: f.phone || undefined,
            email: f.email || undefined,
            directions: f.directions,
            latitude: f.latitude === '' ? undefined : Number(f.latitude),
            longitude: f.longitude === '' ? undefined : Number(f.longitude),
            workingHours: f.workingHours as S<'WorkingHoursDto'>,
          },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: adminKeys.locations }), qc.invalidateQueries({ queryKey: ['public', 'club'] })]);
      toast.success(tr.locationSaved);
    },
  });
  return (
    <Card className="space-y-4">
      <h3 className="font-display text-lg font-semibold">{location.name}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={tr.name} htmlFor={`lc-name-${location.id}`}>
          <Input id={`lc-name-${location.id}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!editable} />
        </Field>
        <Field label={tr.address} htmlFor={`lc-addr-${location.id}`}>
          <Input id={`lc-addr-${location.id}`} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} disabled={!editable} />
        </Field>
        <Field label={tr.addressDetails} htmlFor={`lc-det-${location.id}`} hint={tr.floorOfficesEntrance}>
          <Input id={`lc-det-${location.id}`} value={f.addressDetails} onChange={(e) => setF({ ...f, addressDetails: e.target.value })} disabled={!editable} />
        </Field>
        <Field label={tr.city} htmlFor={`lc-city-${location.id}`}>
          <Input id={`lc-city-${location.id}`} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} disabled={!editable} />
        </Field>
        <Field label={tr.latitude} htmlFor={`lc-lat-${location.id}`} hint={tr.mapPinEG}>
          <Input id={`lc-lat-${location.id}`} inputMode="decimal" value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} disabled={!editable} />
        </Field>
        <Field label={tr.longitude} htmlFor={`lc-lon-${location.id}`}>
          <Input id={`lc-lon-${location.id}`} inputMode="decimal" value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} disabled={!editable} />
        </Field>
      </div>
      <Field label={tr.howGetThere} htmlFor={`lc-dir-${location.id}`}>
        <Textarea id={`lc-dir-${location.id}`} rows={2} value={f.directions} onChange={(e) => setF({ ...f, directions: e.target.value })} disabled={!editable} />
      </Field>
      <div>
        <p className="mb-2 text-sm font-semibold">{tr.openingHours}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const h = f.workingHours[String(d)];
            return (
              <div key={d} className="flex items-center gap-2 rounded-2xl bg-canvas p-2.5 text-sm">
                <Checkbox
                  checked={!!h}
                  disabled={!editable}
                  onChange={(open) => setF({ ...f, workingHours: { ...f.workingHours, [String(d)]: open ? { open: '12:30', close: '20:00' } : null } })}
                  label={<span className="font-medium">{WEEKDAYS_SHORT[d]}</span>}
                />
                {h ? (
                  <span className="ml-auto flex items-center gap-1">
                    <input type="time" value={h.open} disabled={!editable} onChange={(e) => setF({ ...f, workingHours: { ...f.workingHours, [String(d)]: { ...h, open: e.target.value } } })} className="rounded-lg border border-line bg-white px-1.5 py-1 text-xs" aria-label={tr.opens(WEEKDAYS[d])} />
                    –
                    <input type="time" value={h.close} disabled={!editable} onChange={(e) => setF({ ...f, workingHours: { ...f.workingHours, [String(d)]: { ...h, close: e.target.value } } })} className="rounded-lg border border-line bg-white px-1.5 py-1 text-xs" aria-label={tr.closes(WEEKDAYS[d])} />
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-muted">{tr.closed}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      {editable && (
        <div className="flex justify-end">
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {tr.saveLocation}
          </Button>
        </div>
      )}
    </Card>
  );
}

function RoomDialog({ room, locationId, onClose }: { room?: S<'RoomDto'>; locationId: string; onClose: () => void }) {
  const tr = useT(settingsMessages);
  const qc = useQueryClient();
  const [f, setF] = useState({ name: room?.name ?? '', capacity: String(room?.capacity ?? 8), description: room?.description ?? '', isActive: room?.isActive ?? true, sortOrder: String(room?.sortOrder ?? 0) });
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), capacity: Number(f.capacity), description: f.description.trim() || undefined, isActive: f.isActive, sortOrder: Number(f.sortOrder) || 0 };
      return room ? call(api.PATCH('/api/admin/rooms/{id}', { params: { path: { id: room.id } }, body })) : call(api.POST('/api/admin/rooms', { body: { ...body, locationId } }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.rooms });
      toast.success(tr.roomSaved);
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={room ? tr.editName(room.name) : tr.newRoom}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!f.name.trim()} onClick={() => save.mutate()}>
            {tr.save}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={tr.name} htmlFor="rm-name">
          <Input id="rm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tr.office317} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr.seats} htmlFor="rm-cap">
            <Input id="rm-cap" type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
          </Field>
          <Field label={tr.sortOrder} htmlFor="rm-sort">
            <Input id="rm-sort" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
          </Field>
        </div>
        <Field label={tr.description} htmlFor="rm-desc">
          <Input id="rm-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label={tr.active} />
        {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

// ─── Levels, group types, lead sources ───

type CatalogKind = 'level' | 'groupType' | 'source';
type CatalogItem = { id: string; name: string; isActive: boolean; rank?: number; code?: string | null; color?: string | null; description?: string | null; sortOrder?: number; clientCategories?: string[] };

export function CatalogSection() {
  const tr = useT(settingsMessages);
  const { data: levels } = useAdminLevels();
  const { data: groupTypes } = useAdminGroupTypes();
  const { data: sources } = useAdminSources();
  const canCatalog = useCan('catalog.manage');
  const [editing, setEditing] = useState<{ kind: CatalogKind; item?: CatalogItem } | null>(null);
  const block = (title: string, kind: CatalogKind, items: CatalogItem[] | undefined, meta: (i: CatalogItem) => string) => (
    <Section
      title={title}
      action={
        canCatalog && (
          <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ kind })}>
            {tr.add}
          </Button>
        )
      }
    >
      <Card padded={false} className="divide-y divide-line/70">
        {items?.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            {i.color && <span className="h-3 w-3 rounded-full" style={{ background: i.color }} />}
            <span className="font-semibold">{i.name}</span>
            <span className="text-muted">{meta(i)}</span>
            {!i.isActive && <Badge>{tr.inactive}</Badge>}
            {canCatalog && (
              <button type="button" className="ml-auto rounded-lg p-1.5 text-muted hover:bg-brand-50" onClick={() => setEditing({ kind, item: i })} aria-label={tr.editName(i.name)}>
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </Card>
    </Section>
  );
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {block(tr.englishLevels, 'level', levels?.slice().sort((a, b) => a.rank - b.rank), (i) => tr.rankCode(i.rank ?? 0, i.code ?? null))}
      {block(tr.groupTypes, 'groupType', groupTypes, (i) => (i.clientCategories?.length ? i.clientCategories.map((c) => CATEGORY_LABELS[c] ?? c).join(', ') : tr.everyoneLower))}
      {block(tr.leadSources, 'source', sources, (i) => i.code ?? '')}
      {editing && <CatalogDialog kind={editing.kind} item={editing.item} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CatalogDialog({ kind, item, onClose }: { kind: CatalogKind; item?: CatalogItem; onClose: () => void }) {
  const tr = useT(settingsMessages);
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: item?.name ?? '',
    code: item?.code ?? '',
    rank: String(item?.rank ?? 70),
    color: item?.color ?? '#6d28d9',
    description: item?.description ?? '',
    sortOrder: String(item?.sortOrder ?? 0),
    isActive: item?.isActive ?? true,
    clientCategories: (item?.clientCategories ?? []) as S<'ClientCategory'>[],
  });
  const save = useMutation({
    mutationFn: async () => {
      if (kind === 'level') {
        const body = { name: f.name.trim(), code: f.code.trim() || undefined, rank: Number(f.rank), color: f.color, description: f.description.trim() || undefined, isActive: f.isActive };
        return item ? call(api.PATCH('/api/admin/levels/{id}', { params: { path: { id: item.id } }, body })) : call(api.POST('/api/admin/levels', { body }));
      }
      if (kind === 'groupType') {
        const body = { name: f.name.trim(), color: f.color, description: f.description.trim() || undefined, isActive: f.isActive, sortOrder: Number(f.sortOrder) || 0, clientCategories: f.clientCategories };
        return item ? call(api.PATCH('/api/admin/group-types/{id}', { params: { path: { id: item.id } }, body })) : call(api.POST('/api/admin/group-types', { body }));
      }
      const body = { name: f.name.trim(), code: f.code.trim().toUpperCase(), isActive: f.isActive, sortOrder: Number(f.sortOrder) || 0 };
      return item ? call(api.PATCH('/api/admin/lead-sources/{id}', { params: { path: { id: item.id } }, body })) : call(api.POST('/api/admin/lead-sources', { body }));
    },
    onSuccess: async () => {
      const key = kind === 'level' ? adminKeys.levels : kind === 'groupType' ? adminKeys.groupTypes : adminKeys.sources;
      await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['public'] })]);
      toast.success(tr.saved);
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${item ? tr.edit : tr.new} ${tr.catalogTitles[kind]}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!f.name.trim() || (kind === 'source' && !f.code.trim())} onClick={() => save.mutate()}>
            {tr.save}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={tr.name} htmlFor="cat-name">
          <Input id="cat-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        {kind !== 'groupType' && (
          <Field label={tr.code} htmlFor="cat-code" hint={kind === 'source' ? tr.usedLinksEG : tr.optionalEGB1}>
            <Input id="cat-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          </Field>
        )}
        {kind === 'level' && (
          <Field label={tr.rank} htmlFor="cat-rank" hint={tr.orderBeginnerLowAdvanced}>
            <Input id="cat-rank" type="number" value={f.rank} onChange={(e) => setF({ ...f, rank: e.target.value })} />
          </Field>
        )}
        {kind !== 'source' && (
          <>
            <Field label={tr.colour} htmlFor="cat-color">
              <div className="flex gap-2">
                <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-12 w-14 rounded-xl border border-line p-1" aria-label={tr.colour} />
                <Input id="cat-color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} />
              </div>
            </Field>
            <Field label={tr.description} htmlFor="cat-desc">
              <Input id="cat-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </>
        )}
        {kind === 'groupType' && (
          <Field label={tr.only} hint={tr.emptyEveryone}>
            <ChipGroup size="sm" multiple options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value: value as S<'ClientCategory'>, label }))} value={f.clientCategories} onChange={(v) => setF({ ...f, clientCategories: v as S<'ClientCategory'>[] })} />
          </Field>
        )}
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label={tr.active} />
        {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

// ─── Payment methods ───

export function PaymentMethodsSection() {
  const tr = useT(settingsMessages);
  const { data: methods } = useAdminMethods();
  const [editing, setEditing] = useState<S<'PaymentMethodDto'> | 'new' | null>(null);
  return (
    <Section
      title={tr.paymentMethods}
      description={tr.manualMethodsKaspiInvoice}
      action={
        <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          {tr.addMethod}
        </Button>
      }
    >
      <Card padded={false} className="divide-y divide-line/70">
        {methods?.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="font-semibold">{m.name}</span>
            <Badge>{m.provider}</Badge>
            {m.availableToClients && <Badge tone="brand">{tr.app}</Badge>}
            {!m.isActive && <Badge>{tr.inactive}</Badge>}
            {!m.providerReady && <Badge tone="warning">{tr.providerNotConfigured}</Badge>}
            <button type="button" className="ml-auto rounded-lg p-1.5 text-muted hover:bg-brand-50" onClick={() => setEditing(m)} aria-label={tr.editName(m.name)}>
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ))}
      </Card>
      {editing && <MethodDialog method={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function MethodDialog({ method, onClose }: { method?: S<'PaymentMethodDto'>; onClose: () => void }) {
  const tr = useT(settingsMessages);
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: method?.code ?? '',
    name: method?.name ?? '',
    provider: (method?.provider ?? 'manual') as 'manual' | 'mock_online' | 'kaspi',
    instructions: method?.instructions ?? '',
    isActive: method?.isActive ?? true,
    availableToClients: method?.availableToClients ?? false,
    sortOrder: String(method?.sortOrder ?? 0),
  });
  const save = useMutation({
    mutationFn: () => {
      const body = { code: f.code.trim().toUpperCase(), name: f.name.trim(), provider: f.provider, instructions: f.instructions.trim() || undefined, isActive: f.isActive, availableToClients: f.availableToClients, sortOrder: Number(f.sortOrder) || 0 };
      return method ? call(api.PATCH('/api/admin/payment-methods/{id}', { params: { path: { id: method.id } }, body })) : call(api.POST('/api/admin/payment-methods', { body }));
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: adminKeys.methods }), qc.invalidateQueries({ queryKey: ['public', 'payment-methods'] })]);
      toast.success(tr.paymentMethodSaved);
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={method ? tr.editName(method.name) : tr.newPaymentMethod}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!f.code.trim() || !f.name.trim()} onClick={() => save.mutate()}>
            {tr.save}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr.name} htmlFor="pm-name">
            <Input id="pm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={tr.code} htmlFor="pm-code">
            <Input id="pm-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          </Field>
        </div>
        <Field label={tr.provider} htmlFor="pm-provider">
          <Select id="pm-provider" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as typeof f.provider })}>
            <option value="manual">{tr.manualStaffConfirms}</option>
            <option value="kaspi">{tr.kaspiPayOnline}</option>
            <option value="mock_online">{tr.testCheckoutDevelopment}</option>
          </Select>
        </Field>
        <Field label={tr.instructionsClients} htmlFor="pm-instr">
          <Textarea id="pm-instr" rows={3} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
        </Field>
        <Checkbox checked={f.availableToClients} onChange={(v) => setF({ ...f, availableToClients: v })} label={tr.clientsCanChooseApp} />
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label={tr.active} />
        {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}
