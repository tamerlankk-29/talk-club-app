'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button, buttonClasses } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { api, call } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { fmt } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { giftMessages } from '@/lib/i18n/messages/admin/gifts';

/** The certificate to print or save as PDF (A5 landscape), in the language chosen above it. */
export default function PrintGiftCertificatePage() {
  const { id } = useParams<{ id: string }>();
  const tr = useT(giftMessages);
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);
  const query = useQuery({
    queryKey: ['admin', 'gift-certificates', 'one', id],
    queryFn: () => call(api.GET('/api/admin/gift-certificates/{id}', { params: { path: { id } } })),
    enabled: status === 'authenticated',
  });
  const g = query.data;

  return (
    <div className="min-h-dvh bg-canvas px-4 py-6 print:bg-white print:p-0">
      <style>{'@page { size: A5 landscape; margin: 0; }'}</style>
      <div className="mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center gap-2 print:hidden">
        <Link href={`/admin/gift-certificates?id=${id}`} className={buttonClasses('ghost', 'sm')}>
          <ArrowLeft className="h-4 w-4" /> {tr.back}
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <Button size="sm" leftIcon={<Printer className="h-4 w-4" />} disabled={!g} onClick={() => window.print()}>
            {tr.printButton}
          </Button>
        </div>
      </div>

      {query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !g ? (
        <Skeleton className="mx-auto aspect-[210/148] w-full max-w-[210mm] rounded-3xl" />
      ) : (
        <article className="relative mx-auto flex aspect-[210/148] w-full max-w-[210mm] flex-col overflow-hidden rounded-3xl bg-brand-950 p-[7%] text-white shadow-float [print-color-adjust:exact] print:h-[148mm] print:w-[210mm] print:max-w-none print:rounded-none print:shadow-none">
          <span className="absolute -right-[12%] -top-[30%] aspect-square w-[55%] rounded-full bg-brand-700/45" aria-hidden="true" />
          <p className="font-display text-sm font-bold tracking-widest text-zest sm:text-base">TALK CLUB</p>
          <h1 className="mt-[3%] font-display text-2xl font-semibold sm:text-4xl">{tr.printTitle}</h1>
          {g.recipientName && (
            <p className="mt-[2%] text-base sm:text-xl">
              {tr.printFor} <span className="font-semibold">{g.recipientName}</span>
            </p>
          )}
          <p className="mt-[3%] font-display text-lg font-semibold text-zest sm:text-2xl">{g.planName}</p>
          <p className="text-sm text-white/80 sm:text-base">{tr.printMembership(g.visits, g.validityDays)}</p>
          {g.message && <p className="mt-[3%] max-w-[85%] text-sm italic text-white/90 sm:text-base">“{g.message}”</p>}
          <div className="mt-auto flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-[60%] text-[10px] leading-snug text-white/70 sm:text-xs">
              <p>{tr.printHow}</p>
              <p className="mt-1">{tr.printValid(fmt.date(g.expiresAt))}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 text-brand-950">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700 sm:text-xs">{tr.printCode}</p>
              <p className="font-mono text-lg font-bold tracking-wider sm:text-2xl">{g.code}</p>
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
