'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, CalendarCheck2, CreditCard, Megaphone, Settings, Timer } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PushPrompt } from '@/components/client/push-prompt';
import { RequireAuth } from '@/components/client/require-auth';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import type { NotificationItem } from '@/lib/api/types';
import { useT } from '@/lib/i18n';
import { inboxMessages } from '@/lib/i18n/messages/club';
import { fmt } from '@/lib/format';
import { keys } from '@/lib/queries';
import { cn } from '@/lib/utils';

function iconFor(n: NotificationItem) {
  const key = n.templateKey ?? '';
  if (n.category === 'MARKETING') return <Megaphone className="h-5 w-5" />;
  if (key.startsWith('payment') || key.startsWith('membership')) return <CreditCard className="h-5 w-5" />;
  if (key.startsWith('waitlist')) return <Timer className="h-5 w-5" />;
  return <CalendarCheck2 className="h-5 w-5" />;
}

/** Links inside notifications are app paths or absolute URLs. */
function openLink(url: string, push: (href: string) => void) {
  if (url.startsWith('/')) push(url);
  else window.open(url, '_blank', 'noopener');
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Inbox />
    </RequireAuth>
  );
}

function Inbox() {
  const t = useT(inboxMessages);
  const router = useRouter();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.notifications,
    queryFn: () => call(api.GET('/api/notifications', { params: { query: { category: 'CLIENT', limit: 100 } } })),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => call(api.POST('/api/notifications/{id}/read', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
  const readAll = useMutation({
    mutationFn: () => call(api.POST('/api/notifications/read-all', { params: { query: { category: 'CLIENT' } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });

  const open = (n: NotificationItem, url?: string | null) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (url) openLink(url, router.push);
  };

  return (
    <div className="space-y-4 pt-5">
      <PageHeader
        back
        title={t.title}
        actions={
          <Link href="/profile/notifications" className="rounded-xl p-2 text-muted hover:bg-brand-50" aria-label={t.settings}>
            <Settings className="h-5 w-5" />
          </Link>
        }
      />
      <PushPrompt />
      {query.data && query.data.unreadCount > 0 && (
        <div className="flex justify-end">
          <Button variant="link" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}>
            {t.markAllRead}
          </Button>
        </div>
      )}
      {query.isLoading ? (
        <SkeletonList count={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.items.length ? (
        <EmptyState icon={<BellOff className="h-7 w-7" />} title={t.emptyTitle} description={t.emptyText} />
      ) : (
        <ul className="space-y-2">
          {query.data.items.map((n) => (
            <li key={n.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => open(n, n.buttonUrl)}
                onKeyDown={(e) => (e.key === 'Enter' ? open(n, n.buttonUrl) : undefined)}
                className={cn(
                  'flex gap-3 rounded-3xl p-4 text-left transition',
                  n.readAt ? 'bg-white/70 ring-1 ring-line/70' : 'bg-white shadow-card ring-1 ring-brand-100',
                )}
              >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', n.readAt ? 'bg-canvas text-muted' : 'bg-brand-50 text-brand-700')}>
                  {iconFor(n)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm', n.readAt ? 'font-medium' : 'font-semibold')}>{n.title}</p>
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label={t.unread} />}
                  </div>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{n.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="text-xs text-subtle">{fmt.relative(n.createdAt)}</span>
                    {n.buttonLabel && n.buttonUrl && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(n, n.buttonUrl);
                        }}
                      >
                        {n.buttonLabel}
                      </button>
                    )}
                    {n.secondaryButtonLabel && n.secondaryButtonUrl && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(n, n.secondaryButtonUrl);
                        }}
                      >
                        {n.secondaryButtonLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
