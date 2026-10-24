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
import { CATEGORY_LABELS, WEEKDAYS } from '@/lib/utils';

type Location = S<'LocationDto'>;
type Hours = Record<string, { open: string; close: string } | null>;

// ─── Location & rooms ───

export function LocationsSection() {
  const { data: locations, isLoading } = useAdminLocations();
  const { data: rooms } = useAdminRooms();
  const canRooms = useCan('rooms.manage');
  const [editingRoom, setEditingRoom] = useState<S<'RoomDto'> | 'new' | null>(null);
  if (isLoading) return <Skeleton className="h-64 w-full rounded-3xl" />;
  return (
    <div className="space-y-6">
      {locations?.map((l) => <LocationCard key={l.id} location={l} editable={canRooms} />)}
      <Section
        title="Rooms"
        action={
          canRooms && (
            <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditingRoom('new')}>
              Add room
            </Button>
          )
        }
      >
        <Card padded={false} className="divide-y divide-line/70">
          {rooms?.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="font-semibold">{r.name}</span>
              <span className="text-muted">{r.capacity} seats</span>
              {!r.isActive && <Badge>inactive</Badge>}
              {r.description && <span className="truncate text-muted">· {r.description}</span>}
              {canRooms && (
                <button type="button" className="ml-auto rounded-lg p-1.5 text-muted hover:bg-brand-50" onClick={() => setEditingRoom(r)} aria-label={`Edit ${r.name}`}>
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
      toast.success('Location saved.');
    },
  });
  return (
    <Card className="space-y-4">
      <h3 className="font-display text-lg font-semibold">{location.name}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name" htmlFor={`lc-name-${location.id}`}>
          <Input id={`lc-name-${location.id}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!editable} />
        </Field>
        <Field label="Address" htmlFor={`lc-addr-${location.id}`}>
          <Input id={`lc-addr-${location.id}`} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} disabled={!editable} />
        </Field>
        <Field label="Address details" htmlFor={`lc-det-${location.id}`} hint="Floor, offices, entrance">
          <Input id={`lc-det-${location.id}`} value={f.addressDetails} onChange={(e) => setF({ ...f, addressDetails: e.target.value })} disabled={!editable} />
        </Field>
        <Field label="City" htmlFor={`lc-city-${location.id}`}>
          <Input id={`lc-city-${location.id}`} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} disabled={!editable} />
        </Field>
        <Field label="Latitude" htmlFor={`lc-lat-${location.id}`} hint="For the map pin, e.g. from 2GIS">
          <Input id={`lc-lat-${location.id}`} inputMode="decimal" value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} disabled={!editable} />
        </Field>
        <Field label="Longitude" htmlFor={`lc-lon-${location.id}`}>
          <Input id={`lc-lon-${location.id}`} inputMode="decimal" value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} disabled={!editable} />
        </Field>
      </div>
      <Field label="How to get there" htmlFor={`lc-dir-${location.id}`}>
        <Textarea id={`lc-dir-${location.id}`} rows={2} value={f.directions} onChange={(e) => setF({ ...f, directions: e.target.value })} disabled={!editable} />
      </Field>
      <div>
        <p className="mb-2 text-sm font-semibold">Opening hours</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const h = f.workingHours[String(d)];
            return (
              <div key={d} className="flex items-center gap-2 rounded-2xl bg-canvas p-2.5 text-sm">
                <Checkbox
                  checked={!!h}
                  disabled={!editable}
                  onChange={(open) => setF({ ...f, workingHours: { ...f.workingHours, [String(d)]: open ? { open: '12:30', close: '20:00' } : null } })}
                  label={<span className="font-medium">{WEEKDAYS[d].slice(0, 3)}</span>}
                />
                {h ? (
                  <span className="ml-auto flex items-center gap-1">
                    <input type="time" value={h.open} disabled={!editable} onChange={(e) => setF({ ...f, workingHours: { ...f.workingHours, [String(d)]: { ...h, open: e.target.value } } })} className="rounded-lg border border-line bg-white px-1.5 py-1 text-xs" aria-label={`${WEEKDAYS[d]} opens`} />
                    –
                    <input type="time" value={h.close} disabled={!editable} onChange={(e) => setF({ ...f, workingHours: { ...f.workingHours, [String(d)]: { ...h, close: e.target.value } } })} className="rounded-lg border border-line bg-white px-1.5 py-1 text-xs" aria-label={`${WEEKDAYS[d]} closes`} />
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-muted">Closed</span>
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
            Save location
          </Button>
        </div>
      )}
    </Card>
  );
}

function RoomDialog({ room, locationId, onClose }: { room?: S<'RoomDto'>; locationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: room?.name ?? '', capacity: String(room?.capacity ?? 8), description: room?.description ?? '', isActive: room?.isActive ?? true, sortOrder: String(room?.sortOrder ?? 0) });
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), capacity: Number(f.capacity), description: f.description.trim() || undefined, isActive: f.isActive, sortOrder: Number(f.sortOrder) || 0 };
      return room ? call(api.PATCH('/api/admin/rooms/{id}', { params: { path: { id: room.id } }, body })) : call(api.POST('/api/admin/rooms', { body: { ...body, locationId } }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.rooms });
      toast.success('Room saved.');
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={room ? `Edit ${room.name}` : 'New room'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.name.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" htmlFor="rm-name">
          <Input id="rm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Office 317" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seats" htmlFor="rm-cap">
            <Input id="rm-cap" type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
          </Field>
          <Field label="Sort order" htmlFor="rm-sort">
            <Input id="rm-sort" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" htmlFor="rm-desc">
          <Input id="rm-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />
        {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

// ─── Levels, group types, lead sources ───

type CatalogKind = 'level' | 'groupType' | 'source';
type CatalogItem = { id: string; name: string; isActive: boolean; rank?: number; code?: string | null; color?: string | null; description?: string | null; sortOrder?: number; clientCategories?: string[] };

export function CatalogSection() {
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
            Add
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
            {!i.isActive && <Badge>inactive</Badge>}
            {canCatalog && (
              <button type="button" className="ml-auto rounded-lg p-1.5 text-muted hover:bg-brand-50" onClick={() => setEditing({ kind, item: i })} aria-label={`Edit ${i.name}`}>
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
      {block('English levels', 'level', levels?.slice().sort((a, b) => a.rank - b.rank), (i) => `rank ${i.rank}${i.code ? ` · ${i.code}` : ''}`)}
      {block('Group types', 'groupType', groupTypes, (i) => (i.clientCategories?.length ? i.clientCategories.map((c) => CATEGORY_LABELS[c] ?? c).join(', ') : 'everyone'))}
      {block('Lead sources', 'source', sources, (i) => i.code ?? '')}
      {editing && <CatalogDialog kind={editing.kind} item={editing.item} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CatalogDialog({ kind, item, onClose }: { kind: CatalogKind; item?: CatalogItem; onClose: () => void }) {
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
      toast.success('Saved.');
      onClose();
    },
  });
  const titles = { level: 'English level', groupType: 'Group type', source: 'Lead source' };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${item ? 'Edit' : 'New'} ${titles[kind].toLowerCase()}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.name.trim() || (kind === 'source' && !f.code.trim())} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" htmlFor="cat-name">
          <Input id="cat-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        {kind !== 'groupType' && (
          <Field label="Code" htmlFor="cat-code" hint={kind === 'source' ? 'Used in links, e.g. INSTAGRAM' : 'Optional, e.g. B1'}>
            <Input id="cat-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          </Field>
        )}
        {kind === 'level' && (
          <Field label="Rank" htmlFor="cat-rank" hint="Order from beginner (low) to advanced (high); used for level matching">
            <Input id="cat-rank" type="number" value={f.rank} onChange={(e) => setF({ ...f, rank: e.target.value })} />
          </Field>
        )}
        {kind !== 'source' && (
          <>
            <Field label="Colour" htmlFor="cat-color">
              <div className="flex gap-2">
                <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-12 w-14 rounded-xl border border-line p-1" aria-label="Colour" />
                <Input id="cat-color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} />
              </div>
            </Field>
            <Field label="Description" htmlFor="cat-desc">
              <Input id="cat-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </>
        )}
        {kind === 'groupType' && (
          <Field label="Only for" hint="Empty = everyone">
            <ChipGroup size="sm" multiple options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value: value as S<'ClientCategory'>, label }))} value={f.clientCategories} onChange={(v) => setF({ ...f, clientCategories: v as S<'ClientCategory'>[] })} />
          </Field>
        )}
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />
        {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}

// ─── Payment methods ───

export function PaymentMethodsSection() {
  const { data: methods } = useAdminMethods();
  const [editing, setEditing] = useState<S<'PaymentMethodDto'> | 'new' | null>(null);
  return (
    <Section
      title="Payment methods"
      description="Manual methods (Kaspi invoice, cash, card at the desk) are confirmed by staff. Online providers confirm automatically."
      action={
        <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Add method
        </Button>
      }
    >
      <Card padded={false} className="divide-y divide-line/70">
        {methods?.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="font-semibold">{m.name}</span>
            <Badge>{m.provider}</Badge>
            {m.availableToClients && <Badge tone="brand">in app</Badge>}
            {!m.isActive && <Badge>inactive</Badge>}
            {!m.providerReady && <Badge tone="warning">provider not configured</Badge>}
            <button type="button" className="ml-auto rounded-lg p-1.5 text-muted hover:bg-brand-50" onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}>
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
      toast.success('Payment method saved.');
      onClose();
    },
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={method ? `Edit ${method.name}` : 'New payment method'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.code.trim() || !f.name.trim()} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="pm-name">
            <Input id="pm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Code" htmlFor="pm-code">
            <Input id="pm-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          </Field>
        </div>
        <Field label="Provider" htmlFor="pm-provider">
          <Select id="pm-provider" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as typeof f.provider })}>
            <option value="manual">Manual (staff confirms)</option>
            <option value="kaspi">Kaspi Pay (online)</option>
            <option value="mock_online">Test checkout (development)</option>
          </Select>
        </Field>
        <Field label="Instructions for clients" htmlFor="pm-instr">
          <Textarea id="pm-instr" rows={3} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
        </Field>
        <Checkbox checked={f.availableToClients} onChange={(v) => setF({ ...f, availableToClients: v })} label="Clients can choose it in the app" />
        <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" />
        {save.error && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
      </div>
    </Modal>
  );
}
