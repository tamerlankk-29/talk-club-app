'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast, toastError } from '@/components/ui/toast';
import { api, call } from '@/lib/api/client';
import { keys } from '@/lib/queries';

/** Invalidates everything that changes when a booking changes. */
export function useRefreshClientData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['my'] }),
      qc.invalidateQueries({ queryKey: ['sessions'] }),
      qc.invalidateQueries({ queryKey: keys.notifications }),
    ]);
}

export function useBookSession() {
  const router = useRouter();
  const refresh = useRefreshClientData();
  return useMutation({
    mutationFn: ({ sessionId, trial }: { sessionId: string; trial?: boolean }) =>
      call(api.POST('/api/sessions/{id}/book', { params: { path: { id: sessionId } }, body: { kind: trial ? 'TRIAL' : 'MEMBERSHIP' } })),
    onSuccess: async (result) => {
      await refresh();
      router.push(`/bookings/${result.booking.id}?confirmed=1`);
    },
    onError: toastError,
  });
}

export function useJoinWaitlist() {
  const refresh = useRefreshClientData();
  return useMutation({
    mutationFn: (sessionId: string) => call(api.POST('/api/sessions/{id}/waitlist', { params: { path: { id: sessionId } } })),
    onSuccess: async (entry) => {
      await refresh();
      toast.success(`You're on the waitlist (#${entry.position}). We'll notify you when a place opens.`);
    },
    onError: toastError,
  });
}

export function useLeaveWaitlist() {
  const refresh = useRefreshClientData();
  return useMutation({
    mutationFn: (sessionId: string) => call(api.DELETE('/api/sessions/{id}/waitlist', { params: { path: { id: sessionId } } })),
    onSuccess: async () => {
      await refresh();
      toast.success('You left the waitlist.');
    },
    onError: toastError,
  });
}

export function useClaimOffer() {
  const router = useRouter();
  const refresh = useRefreshClientData();
  return useMutation({
    mutationFn: (entryId: string) => call(api.POST('/api/waitlist/{id}/claim', { params: { path: { id: entryId } } })),
    onSuccess: async (result) => {
      await refresh();
      router.push(`/bookings/${result.booking.id}?confirmed=1`);
    },
    onError: toastError,
  });
}
