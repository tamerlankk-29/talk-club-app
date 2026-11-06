'use client';

import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/client/require-auth';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Card, PageHeader } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import { fmt } from '@/lib/format';
import { useHome } from '@/lib/queries';

export default function CheckInPage() {
  return (
    <RequireAuth>
      <CheckIn />
    </RequireAuth>
  );
}

/** Rotating QR code the teacher or reception scans to mark attendance. */
function CheckIn() {
  const { data: home } = useHome();
  const code = useQuery({
    queryKey: ['my', 'checkin-code'],
    queryFn: () => call(api.GET('/api/my/checkin-code')),
    refetchInterval: (q) => Math.max(15, q.state.data?.refreshInSeconds ?? 60) * 1000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!code.data?.token) return;
    void QRCode.toDataURL(code.data.token, { margin: 1, width: 560, errorCorrectionLevel: 'M', color: { dark: '#2e1065', light: '#ffffff' } }).then(setImage);
  }, [code.data?.token]);

  const next = home?.nextBooking;
  return (
    <div className="space-y-5 pt-5">
      <PageHeader back="/profile" title="Check-in" subtitle="Show this code to your teacher when you arrive." />
      {code.error ? (
        <ErrorState error={code.error} onRetry={() => code.refetch()} />
      ) : (
        <Card className="flex flex-col items-center gap-4 py-8">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="Your check-in QR code" className="h-64 w-64 rounded-2xl" />
          ) : (
            <Skeleton className="h-64 w-64 rounded-2xl" />
          )}
          <p className="text-xs text-muted">The code refreshes automatically for your security.</p>
        </Card>
      )}
      {next && (
        <Card className="text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your next session</p>
          <p className="mt-1 font-semibold">
            {next.session.title}
            {next.session.teacher ? ` · ${next.session.teacher.name}` : ''}
          </p>
          <p className="text-muted">
            {fmt.sessionWhen(next.session.startsAt)}
            {next.session.room ? ` · ${next.session.room.name}` : ''}
          </p>
        </Card>
      )}
    </div>
  );
}
