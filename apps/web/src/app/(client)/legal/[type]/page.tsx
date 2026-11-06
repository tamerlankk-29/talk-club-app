'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Card, PageHeader } from '@/components/ui/layout';
import { Markdown } from '@/components/ui/markdown';
import { api, call } from '@/lib/api/client';
import type { S } from '@/lib/api/types';
import { fmt } from '@/lib/format';

type LegalType = S<'LegalDocumentType'>;
const TYPES: LegalType[] = ['TERMS', 'PRIVACY_POLICY', 'PUBLIC_OFFER'];

export default function LegalPage() {
  const { type } = useParams<{ type: string }>();
  const valid = TYPES.includes(type as LegalType);
  const { data, error, refetch } = useQuery({
    queryKey: ['public', 'legal', type],
    queryFn: () => call(api.GET('/api/public/legal/{type}', { params: { path: { type: type as LegalType } } })),
    enabled: valid,
    staleTime: 10 * 60_000,
  });
  if (!valid) return <ErrorState error={null} className="mt-10" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} className="mt-10" />;
  return (
    <div className="space-y-5 pt-5">
      <PageHeader back title={data?.title ?? 'Legal'} subtitle={data ? `Version ${data.version} · ${fmt.date(data.publishedAt)}` : undefined} />
      <Card>{data ? <Markdown className="prose-club text-[15px]">{data.content}</Markdown> : <Skeleton className="h-80 w-full" />}</Card>
    </div>
  );
}
