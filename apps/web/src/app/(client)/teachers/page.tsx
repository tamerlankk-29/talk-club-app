'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Avatar, ErrorState, SkeletonList } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/layout';
import { useT } from '@/lib/i18n';
import { clubMessages } from '@/lib/i18n/messages/club';
import { useTeachers } from '@/lib/queries';

export default function TeachersPage() {
  const m = useT(clubMessages);
  const { data, isLoading, error, refetch } = useTeachers();
  return (
    <div className="space-y-5 pt-5">
      <PageHeader back title={m.ourTeachers} subtitle={m.ourTeachersText} />
      {isLoading ? (
        <SkeletonList count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-3">
          {data?.map((t) => (
            <Link key={t.id} href={`/teachers/${t.id}`} className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70 transition hover:ring-brand-200">
              <Avatar name={t.name} src={t.photoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t.name}</p>
                <p className="truncate text-sm text-muted">{[t.country, t.headline].filter(Boolean).join(' · ')}</p>
                <p className="mt-1 text-xs font-semibold text-brand-700">{t.levelsLabel}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-subtle" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
