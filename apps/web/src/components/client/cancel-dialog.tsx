'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { InlineAlert, Skeleton } from '@/components/ui/feedback';
import { ConfirmDialog } from '@/components/ui/overlay';
import { toast, toastError } from '@/components/ui/toast';
import { api, call, errorCode } from '@/lib/api/client';
import { fmt } from '@/lib/format';
import { useRefreshClientData } from './session-actions';

/**
 * Cancellation with the consequences spelled out first:
 * before the deadline the visit returns, after it the client must confirm a
 * late cancellation ("This visit will not be returned").
 */
export function CancelBookingDialog({ bookingId, open, onOpenChange }: { bookingId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const refresh = useRefreshClientData();
  const preview = useQuery({
    queryKey: ['my', 'cancel-preview', bookingId],
    queryFn: () => call(api.GET('/api/bookings/{id}/cancellation-preview', { params: { path: { id: bookingId } } })),
    enabled: open,
    staleTime: 0,
  });

  const cancel = useMutation({
    mutationFn: (acknowledgeLate: boolean) =>
      call(api.POST('/api/bookings/{id}/cancel', { params: { path: { id: bookingId } }, body: { acknowledgeLate } })),
    onSuccess: async (result) => {
      onOpenChange(false);
      await refresh();
      toast.success(result.visitReturned ? `Cancelled. Your visit was returned — ${result.visitsRemaining ?? ''} left.` : 'Booking cancelled. The visit was not returned.');
    },
    onError: async (error) => {
      // The deadline passed while the dialog was open — show the late version.
      if (errorCode(error) === 'BOOKING_LATE_CANCELLATION_CONFIRMATION_REQUIRED') {
        await preview.refetch();
        return;
      }
      toastError(error);
    },
  });

  const p = preview.data;
  const late = !!p?.isLate;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={p?.title ?? 'Cancel this session?'}
      description={p ? p.message : undefined}
      confirmLabel={late ? 'Cancel anyway' : 'Cancel booking'}
      cancelLabel="Keep my booking"
      tone={late ? 'danger' : 'primary'}
      loading={cancel.isPending}
      disabled={!p?.canCancel}
      onConfirm={() => cancel.mutate(late)}
    >
      {preview.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : p ? (
        late ? (
          <InlineAlert tone="warning" icon={<TriangleAlert className="h-5 w-5" />}>
            Free cancellation ended {fmt.weekdayDate(p.deadline)} at {fmt.time(p.deadline)}.
          </InlineAlert>
        ) : p.canCancel ? (
          <InlineAlert tone="success" title="Free cancellation">
            Available until {fmt.weekdayDate(p.deadline)}, {fmt.time(p.deadline)}.
          </InlineAlert>
        ) : null
      ) : null}
    </ConfirmDialog>
  );
}
