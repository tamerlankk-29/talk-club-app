'use client';

import { Mail, MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { InstagramIcon, TelegramIcon, TikTokIcon, WhatsAppIcon } from '@/components/icons';
import { SkeletonList } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/layout';
import { fmt } from '@/lib/format';
import { useClub } from '@/lib/queries';

function handle(value: string): string {
  return value.replace(/^@/, '').replace(/^https?:\/\/[^/]+\//, '');
}

export default function ContactPage() {
  const { data } = useClub();
  const c = data?.club;
  return (
    <div className="space-y-5 pt-5">
      <PageHeader back title="Contact us" subtitle={data?.content.contactNote || 'We usually reply within an hour during opening hours.'} />
      {!c ? (
        <SkeletonList count={4} />
      ) : (
        <div className="space-y-2">
          {c.whatsapp && <Contact href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`} icon={<WhatsAppIcon className="h-5 w-5" />} label="WhatsApp" value={fmt.phone(c.whatsapp) || c.whatsapp} tone="bg-[#25D366]/15 text-[#128C7E]" />}
          {c.telegram && <Contact href={`https://t.me/${handle(c.telegram)}`} icon={<TelegramIcon className="h-5 w-5" />} label="Telegram" value={`@${handle(c.telegram)}`} tone="bg-sky-100 text-sky-700" />}
          {c.phone && <Contact href={`tel:${c.phone}`} icon={<Phone className="h-5 w-5" />} label="Phone" value={fmt.phone(c.phone) || c.phone} />}
          {c.instagram && <Contact href={`https://instagram.com/${handle(c.instagram)}`} icon={<InstagramIcon className="h-5 w-5" />} label="Instagram" value={`@${handle(c.instagram)}`} tone="bg-pink-100 text-pink-700" />}
          {c.tiktok && <Contact href={`https://www.tiktok.com/@${handle(c.tiktok)}`} icon={<TikTokIcon className="h-5 w-5" />} label="TikTok" value={`@${handle(c.tiktok)}`} tone="bg-ink/10 text-ink" />}
          {c.email && <Contact href={`mailto:${c.email}`} icon={<Mail className="h-5 w-5" />} label="Email" value={c.email} />}
          <Link href="/location" className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <MapPin className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Address</p>
              <p className="font-semibold">{data?.location?.address}</p>
              {data?.location?.addressDetails && <p className="text-sm text-muted">{data.location.addressDetails}</p>}
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

function Contact({ href, icon, label, value, tone = 'bg-brand-50 text-brand-700' }: { href: string; icon: ReactNode; label: string; value: string; tone?: string }) {
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-line/70 transition hover:ring-brand-200">
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate font-semibold">{value}</p>
      </div>
    </a>
  );
}
