'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { api, call } from './api/client';

/** Admin query keys all start with 'admin' so a staff sign-out can drop them together. */
export const adminKeys = {
  levels: ['admin', 'levels'] as const,
  groupTypes: ['admin', 'group-types'] as const,
  rooms: ['admin', 'rooms'] as const,
  locations: ['admin', 'locations'] as const,
  programs: ['admin', 'programs'] as const,
  sources: ['admin', 'lead-sources'] as const,
  tags: ['admin', 'tags'] as const,
  plans: ['admin', 'plans'] as const,
  methods: ['admin', 'payment-methods'] as const,
  teachers: ['admin', 'teachers'] as const,
  staff: ['admin', 'staff'] as const,
  team: ['admin', 'team'] as const,
  roles: ['admin', 'roles'] as const,
  permissions: ['admin', 'permissions'] as const,
  segments: ['admin', 'segments'] as const,
  segmentFields: ['admin', 'segment-fields'] as const,
  settings: ['admin', 'settings'] as const,
  client: (id: string) => ['admin', 'client', id] as const,
  session: (id: string) => ['admin', 'session', id] as const,
};

const long = { staleTime: 5 * 60_000 };

export const useAdminLevels = () => useQuery({ queryKey: adminKeys.levels, queryFn: () => call(api.GET('/api/admin/levels')), ...long });
export const useAdminGroupTypes = () => useQuery({ queryKey: adminKeys.groupTypes, queryFn: () => call(api.GET('/api/admin/group-types')), ...long });
export const useAdminRooms = () => useQuery({ queryKey: adminKeys.rooms, queryFn: () => call(api.GET('/api/admin/rooms')), ...long });
export const useAdminLocations = () => useQuery({ queryKey: adminKeys.locations, queryFn: () => call(api.GET('/api/admin/locations')), ...long });
export const useAdminPrograms = () => useQuery({ queryKey: adminKeys.programs, queryFn: () => call(api.GET('/api/admin/programs')), ...long });
export const useAdminSources = () => useQuery({ queryKey: adminKeys.sources, queryFn: () => call(api.GET('/api/admin/lead-sources')), ...long });
export const useAdminTags = () => useQuery({ queryKey: adminKeys.tags, queryFn: () => call(api.GET('/api/admin/tags')) });
export const useAdminPlans = () => useQuery({ queryKey: adminKeys.plans, queryFn: () => call(api.GET('/api/admin/membership-plans')), ...long });
export const useAdminMethods = () => useQuery({ queryKey: adminKeys.methods, queryFn: () => call(api.GET('/api/admin/payment-methods')), ...long });
export const useAdminTeachers = () => useQuery({ queryKey: adminKeys.teachers, queryFn: () => call(api.GET('/api/admin/teachers')), ...long });
export const useAdminStaff = (enabled = true) => useQuery({ queryKey: adminKeys.staff, queryFn: () => call(api.GET('/api/admin/staff')), enabled, ...long });
/** Names-only staff directory for assignee pickers (needs crm.view, not staff.manage). */
export const useAdminTeam = (enabled = true) => useQuery({ queryKey: adminKeys.team, queryFn: () => call(api.GET('/api/admin/team')), enabled, ...long });

/**
 * Filters kept in the URL (?status=…&page=…) so they survive reloads and
 * back/forward. Setting a filter resets the page unless the page itself changes.
 */
export function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = useCallback((key: string, fallback = '') => params.get(key) ?? fallback, [params]);
  const set = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      if (!('page' in patch)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );
  return { get, set, params };
}
