'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toastError } from '@/components/ui/toast';
import { downloadFile } from '@/lib/api/client';
import type { Booking } from '@/lib/api/types';
import { useT } from '@/lib/i18n';
import { sessionMessages } from '@/lib/i18n/messages/sessions';

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Add to Google / Apple / Outlook calendar (ICS download for Apple & Outlook desktop). */
export function AddToCalendar({ booking, block }: { booking: Booking; block?: boolean }) {
  const s = booking.session;
  const t = useT(sessionMessages);
  const title = t.calendarTitle(s.title, s.teacher?.name ?? null);
  const location = s.format === 'ONLINE' ? (booking.onlineUrl ?? t.online) : [s.location.name, s.location.address, s.location.addressDetails, 'Almaty'].filter(Boolean).join(', ');
  const details = t.calendarDetails(s.levelLabel, s.room?.name ?? null);
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${utcStamp(s.startsAt)}/${utcStamp(s.endsAt)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(s.startsAt)}&enddt=${encodeURIComponent(s.endsAt)}&location=${encodeURIComponent(location)}&body=${encodeURIComponent(details)}`;
  const ics = () => downloadFile(`/api/bookings/${booking.id}/calendar.ics`, 'talk-club.ics').catch(toastError);

  const item = 'flex cursor-pointer items-center rounded-xl px-3 py-2.5 text-sm font-medium outline-none data-[highlighted]:bg-brand-50';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" block={block} leftIcon={<CalendarPlus className="h-4 w-4" />}>
          {t.addToCalendar}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-50 min-w-56 rounded-2xl border border-line bg-white p-1.5 shadow-float">
          <DropdownMenu.Item className={item} onSelect={() => window.open(google, '_blank', 'noopener')}>
            Google Calendar
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => void ics()}>
            Apple Calendar (.ics)
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => window.open(outlook, '_blank', 'noopener')}>
            Outlook.com
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => void ics()}>
            Outlook desktop (.ics)
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
