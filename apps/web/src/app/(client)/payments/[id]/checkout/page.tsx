'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical, Lock } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/client/require-auth';
import { useRefreshClientData } from '@/components/client/session-actions';
import { LogoMark } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ErrorState, InlineAlert, Skeleton } from '@/components/ui/feedback';
import { Card } from '@/components/ui/layout';
import { toastError } from '@/components/ui/toast';
import { api, call } from '@/lib/api/client';
import { fmt } from '@/lib/format';
import { keys } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { membershipMessages } from '@/lib/i18n/messages/membership';

/**
 * Test checkout for the development "mock_online" provider. A real provider
 * (e.g. Kaspi Pay) hosts this page itself and notifies the API by webhook.
 */
export default function MockCheckoutPage() {
  return (
    <RequireAuth>
      <Checkout />
    </RequireAuth>
  );
}

function Checkout() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const refresh = useRefreshClientData();
  const t = useT(membershipMessages);
  const query = useQuery({ queryKey: keys.payment(id), queryFn: () => call(api.GET('/api/my/payments/{id}', { params: { path: { id } } })) });
  const complete = useMutation({
    mutationFn: (result: 'success' | 'fail') => call(api.POST('/api/payments/mock/{id}/complete', { params: { path: { id } }, body: { result } })),
    onSuccess: async () => {
      await refresh();
      router.replace(`/payments/${id}`);
    },
    onError: toastError,
  });

  if (query.error) return <ErrorState error={query.error} className="mt-10" />;
  const p = query.data;
  return (
    <div className="space-y-5 pt-10">
      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-muted">
        <Lock className="h-4 w-4" /> {t.secureCheckout}
      </div>
      <InlineAlert tone="warning" icon={<FlaskConical className="h-5 w-5" />} title={t.testMode}>
        {t.testModeText}
      </InlineAlert>
      <Card className="space-y-5 text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        {p ? (
          <>
            <div>
              <p className="text-sm text-muted">Talk Club</p>
              <p className="mt-1 font-display text-4xl font-semibold">{fmt.money(p.amount)}</p>
              <p className="mt-1 text-sm text-muted">{p.description}</p>
            </div>
            {p.status === 'PENDING' ? (
              <div className="grid gap-2">
                <Button size="lg" block loading={complete.isPending && complete.variables === 'success'} onClick={() => complete.mutate('success')}>
                  {t.pay(fmt.money(p.amount))}
                </Button>
                <Button variant="ghost" block loading={complete.isPending && complete.variables === 'fail'} onClick={() => complete.mutate('fail')}>
                  {t.simulateDecline}
                </Button>
              </div>
            ) : (
              <Button variant="outline" block onClick={() => router.replace(`/payments/${id}`)}>
                {t.backToPayment}
              </Button>
            )}
          </>
        ) : (
          <Skeleton className="mx-auto h-24 w-48" />
        )}
      </Card>
    </div>
  );
}
