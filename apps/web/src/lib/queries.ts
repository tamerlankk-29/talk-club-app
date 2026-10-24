'use client';

import { useQuery } from '@tanstack/react-query';
import { api, call } from './api/client';
import { useAuth } from './auth';

/** Query keys of the signed-in client start with 'my' so switching profiles can drop them. */
export const keys = {
  club: ['public', 'club'] as const,
  levels: ['public', 'levels'] as const,
  teachers: ['public', 'teachers'] as const,
  teacher: (id: string) => ['public', 'teachers', id] as const,
  groupTypes: ['public', 'group-types'] as const,
  sources: ['public', 'lead-sources'] as const,
  methods: ['public', 'payment-methods'] as const,
  plans: ['plans'] as const,
  sessions: (filters: object) => ['sessions', filters] as const,
  session: (id: string) => ['sessions', 'one', id] as const,
  home: ['my', 'home'] as const,
  membership: ['my', 'membership'] as const,
  membershipDetail: (id: string) => ['my', 'membership', id] as const,
  bookings: (scope: string) => ['my', 'bookings', scope] as const,
  booking: (id: string) => ['my', 'booking', id] as const,
  attendance: ['my', 'attendance'] as const,
  payments: ['my', 'payments'] as const,
  payment: (id: string) => ['my', 'payment', id] as const,
  profile: ['my', 'profile'] as const,
  stats: ['my', 'stats'] as const,
  progress: ['my', 'progress'] as const,
  referral: ['my', 'referral'] as const,
  family: ['my', 'family'] as const,
  agreements: ['my', 'agreements'] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  preferences: ['notifications', 'preferences'] as const,
  announcements: ['announcements'] as const,
};

export function useClub() {
  return useQuery({ queryKey: keys.club, queryFn: () => call(api.GET('/api/public/club')), staleTime: 5 * 60_000 });
}

export function useLevels() {
  return useQuery({ queryKey: keys.levels, queryFn: () => call(api.GET('/api/public/levels')), staleTime: 10 * 60_000 });
}

export function useTeachers() {
  return useQuery({ queryKey: keys.teachers, queryFn: () => call(api.GET('/api/public/teachers')), staleTime: 5 * 60_000 });
}

export function useGroupTypes() {
  return useQuery({ queryKey: keys.groupTypes, queryFn: () => call(api.GET('/api/public/group-types')), staleTime: 10 * 60_000 });
}

export function useLeadSources() {
  return useQuery({ queryKey: keys.sources, queryFn: () => call(api.GET('/api/public/lead-sources')), staleTime: 10 * 60_000 });
}

export function usePlans() {
  return useQuery({ queryKey: keys.plans, queryFn: () => call(api.GET('/api/membership-plans')) });
}

/** Only fetches when a client profile is available (own or managed child). */
function useClientEnabled(): boolean {
  const { status, user, actingClientId } = useAuth();
  return status === 'authenticated' && !!(user?.client || actingClientId);
}

export function useHome() {
  const enabled = useClientEnabled();
  return useQuery({ queryKey: keys.home, queryFn: () => call(api.GET('/api/my/home')), enabled });
}

export function useMyMembership() {
  const enabled = useClientEnabled();
  return useQuery({ queryKey: keys.membership, queryFn: () => call(api.GET('/api/my/membership')), enabled });
}

export function useMyBookings(scope: 'upcoming' | 'past') {
  const enabled = useClientEnabled();
  return useQuery({
    queryKey: keys.bookings(scope),
    queryFn: () => call(api.GET('/api/my/bookings', { params: { query: { scope, limit: 100 } } })),
    enabled,
  });
}

export function useMyPayments() {
  const enabled = useClientEnabled();
  return useQuery({ queryKey: keys.payments, queryFn: () => call(api.GET('/api/my/payments')), enabled });
}

export function useProfile() {
  const enabled = useClientEnabled();
  return useQuery({ queryKey: keys.profile, queryFn: () => call(api.GET('/api/my/profile')), enabled });
}

export function useUnreadCount() {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.unread,
    queryFn: () => call(api.GET('/api/notifications/unread-count', { params: { query: { category: 'CLIENT' } } })),
    enabled: status === 'authenticated',
    refetchInterval: 60_000,
  });
}
