'use client';

import { useQuery } from '@tanstack/react-query';
import { Copy, Gift, Share2 } from 'lucide-react';
import { RequireAuth } from '@/components/client/require-auth';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton, StatusBadge } from '@/components/ui/feedback';
import { Card, PageHeader, Section } from '@/components/ui/layout';
import { toast } from '@/components/ui/toast';
import { api, call } from '@/lib/api/client';
import { fmt } from '@/lib/format';
import { keys } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { profileMessages } from '@/lib/i18n/messages/profile';

export default function ReferralPage() {
  return (
    <RequireAuth>
      <Referral />
    </RequireAuth>
  );
}

function Referral() {
  const { data, error, refetch } = useQuery({ queryKey: keys.referral, queryFn: () => call(api.GET('/api/my/referral')) });
  const t = useT(profileMessages);
  if (error) return <ErrorState error={error} onRetry={() => refetch()} className="mt-10" />;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t.copied);
    } catch {
      toast.error(t.copyFailed);
    }
  };
  const share = async () => {
    if (!data) return;
    const text = t.shareText;
    if (navigator.share) {
      await navigator.share({ title: 'Talk Club', text, url: data.link }).catch(() => undefined);
    } else {
      await copy(`${text} ${data.link}`);
    }
  };

  return (
    <div className="space-y-5 pt-5">
      <PageHeader back="/profile" title={t.invite} />
      <div className="rounded-[28px] bg-[linear-gradient(135deg,var(--color-brand-800),var(--color-brand-600))] p-6 text-white shadow-float">
        <Gift className="h-8 w-8 text-zest" />
        <p className="mt-4 font-display text-2xl font-semibold leading-tight">{t.practiseTogether}</p>
        <p className="mt-2 text-sm text-white/85">{data?.rewardDescription || t.inviteDefault}</p>
        {data ? (
          <>
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/20">
              <span className="font-mono text-lg font-semibold tracking-widest">{data.code}</span>
              <button type="button" onClick={() => copy(data.code)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label={t.copyCode}>
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="accent" leftIcon={<Share2 className="h-4 w-4" />} onClick={share}>
                {t.shareLink}
              </Button>
              <Button variant="white" className="bg-white/15 text-white shadow-none hover:bg-white/25" leftIcon={<Copy className="h-4 w-4" />} onClick={() => copy(data.link)}>
                {t.copyLink}
              </Button>
            </div>
          </>
        ) : (
          <Skeleton className="mt-5 h-12 w-full bg-white/20" />
        )}
      </div>
      {data && (
        <Section title={t.yourInvitations}>
          {data.referrals.length ? (
            <Card padded={false} className="divide-y divide-line/70">
              {data.referrals.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <div>
                    <p className="font-semibold">{r.firstName}</p>
                    <p className="text-xs text-muted">{t.joined(fmt.date(r.createdAt))}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </Card>
          ) : (
            <p className="text-sm text-muted">{t.nobodyYet}</p>
          )}
        </Section>
      )}
    </div>
  );
}
