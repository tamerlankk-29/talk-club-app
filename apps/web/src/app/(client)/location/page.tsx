'use client';

import { Clock, MapPin, Navigation, Phone } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { Card, PageHeader } from '@/components/ui/layout';
import { useT } from '@/lib/i18n';
import { clubMessages } from '@/lib/i18n/messages/club';
import { useClub } from '@/lib/queries';
import { WEEKDAYS } from '@/lib/utils';

type Hours = Record<string, { open: string; close: string } | null>;

export default function LocationPage() {
  const m = useT(clubMessages);
  const { data: club } = useClub();
  const loc = club?.location;
  const hasCoords = loc?.latitude !== null && loc?.latitude !== undefined && loc.longitude !== null;
  const query = encodeURIComponent([loc?.address, loc?.city].filter(Boolean).join(', '));
  const lat = loc?.latitude ?? 0;
  const lon = loc?.longitude ?? 0;
  const bbox = `${lon - 0.004},${lat - 0.0025},${lon + 0.004},${lat + 0.0025}`;
  const hours = (loc?.workingHours ?? {}) as Hours;

  return (
    <div className="space-y-5 pt-5">
      <PageHeader back title={m.findUs} />
      <Card padded={false} className="overflow-hidden">
        {loc ? (
          <iframe
            title={m.onMap}
            className="h-64 w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={
              hasCoords
                ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`
                : `https://www.google.com/maps?q=${query}&z=16&output=embed`
            }
          />
        ) : (
          <Skeleton className="h-64 w-full rounded-none" />
        )}
        <div className="space-y-3 p-5">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
            <div>
              <p className="font-semibold">{loc?.address ?? 'Zheltoksan Street 118'}</p>
              {loc?.addressDetails && <p className="text-sm text-muted">{loc.addressDetails}</p>}
              <p className="text-sm text-muted">{loc?.city ?? 'Almaty'}</p>
            </div>
          </div>
          {loc?.directions && <p className="rounded-2xl bg-canvas p-3 text-sm leading-relaxed">{loc.directions}</p>}
          <div className="grid grid-cols-3 gap-2">
            <a className={buttonClasses('primary', 'sm')} href={`https://2gis.kz/almaty/search/${query}`} target="_blank" rel="noreferrer">
              <Navigation className="h-4 w-4" /> 2GIS
            </a>
            <a
              className={buttonClasses('outline', 'sm')}
              href={hasCoords ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}` : `https://www.google.com/maps/search/?api=1&query=${query}`}
              target="_blank"
              rel="noreferrer"
            >
              Google
            </a>
            <a className={buttonClasses('outline', 'sm')} href={hasCoords ? `https://yandex.kz/maps/?rtext=~${lat},${lon}` : `https://yandex.kz/maps/?text=${query}`} target="_blank" rel="noreferrer">
              Yandex
            </a>
          </div>
        </div>
      </Card>
      <Card>
        <p className="mb-3 flex items-center gap-2 font-semibold">
          <Clock className="h-4 w-4 text-brand-700" /> {m.openingHours}
        </p>
        <dl className="space-y-1.5 text-sm">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const h = hours[String(d)];
            return (
              <div key={d} className="flex justify-between">
                <dt className="text-muted">{WEEKDAYS[d]}</dt>
                <dd className="font-medium">{h ? `${h.open} – ${h.close}` : m.closed}</dd>
              </div>
            );
          })}
        </dl>
      </Card>
      {(loc?.phone || club?.club.phone) && (
        <a href={`tel:${loc?.phone ?? club?.club.phone}`} className={buttonClasses('outline', 'lg', 'w-full')}>
          <Phone className="h-4 w-4" /> {m.callClub}
        </a>
      )}
    </div>
  );
}
