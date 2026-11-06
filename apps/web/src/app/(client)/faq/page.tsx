'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { SkeletonList } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/layout';
import { useT } from '@/lib/i18n';
import { clubMessages } from '@/lib/i18n/messages/club';
import { useClub } from '@/lib/queries';

export default function FaqPage() {
  const m = useT(clubMessages);
  const { data: club } = useClub();
  return (
    <div className="space-y-5 pt-5">
      <PageHeader back title={m.faq} />
      {!club ? (
        <SkeletonList count={5} />
      ) : (
        <div className="space-y-2">
          {club.content.faq.map((item) => (
            <details key={item.question} className="group rounded-3xl bg-white shadow-card ring-1 ring-line/70 open:ring-brand-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown className="h-5 w-5 shrink-0 text-muted transition group-open:rotate-180" />
              </summary>
              <p className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      )}
      <p className="text-center text-sm text-muted">
        {m.stillQuestions}{' '}
        <Link href="/contact" className="font-semibold text-brand-700">
          {m.contactUs}
        </Link>
      </p>
    </div>
  );
}
