'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { AdminPage } from '@/components/admin/page';
import { ContentSection, LegalSection } from '@/components/admin/settings/content-section';
import { CatalogSection, LocationsSection, PaymentMethodsSection } from '@/components/admin/settings/resources-section';
import { SettingsGroupForm, type FieldSpec, type SettingsGroups } from '@/components/admin/settings/settings-form';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Card, Section } from '@/components/ui/layout';
import { api, call } from '@/lib/api/client';
import { adminKeys, useUrlState } from '@/lib/admin-queries';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { settingsMessages } from '@/lib/i18n/messages/admin/settings';

interface SectionDef {
  id: string;
  label: string;
  permission: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'club', label: 'Club profile', permission: 'settings.manage' },
  { id: 'booking', label: 'Booking & cancellation', permission: 'settings.manage' },
  { id: 'sessions', label: 'Sessions & attendance', permission: 'settings.manage' },
  { id: 'memberships', label: 'Memberships, trials & waitlist', permission: 'settings.manage' },
  { id: 'notifications', label: 'Notifications', permission: 'settings.manage' },
  { id: 'crm', label: 'CRM & referrals', permission: 'settings.manage' },
  { id: 'branding', label: 'Branding', permission: 'settings.manage' },
  { id: 'content', label: 'App content', permission: 'settings.manage' },
  { id: 'legal', label: 'Legal documents', permission: 'settings.manage' },
  { id: 'location', label: 'Location & rooms', permission: 'rooms.manage' },
  { id: 'catalog', label: 'Levels, groups & sources', permission: 'catalog.manage' },
  { id: 'payments', label: 'Payment methods', permission: 'settings.manage' },
];

const F = {
  club: [
    { key: 'name', label: 'Club name', type: 'text' },
    { key: 'tagline', label: 'Tagline', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'whatsapp', label: 'WhatsApp', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'instagram', label: 'Instagram', type: 'text', placeholder: 'https://instagram.com/…' },
    { key: 'telegram', label: 'Telegram', type: 'text', placeholder: '@talkclub' },
    { key: 'tiktok', label: 'TikTok', type: 'text' },
    { key: 'website', label: 'Website', type: 'text' },
    {
      key: 'mapProvider',
      label: 'Map for directions',
      type: 'select',
      options: [
        { value: '2gis', label: '2GIS' },
        { value: 'google', label: 'Google Maps' },
        { value: 'osm', label: 'OpenStreetMap' },
      ],
    },
  ],
  booking: [
    { key: 'openDaysAhead', label: 'Booking opens', type: 'number', min: 0, max: 180, suffix: 'days ahead', hint: '0 = no limit' },
    { key: 'cutoffMinutesBeforeStart', label: 'Online booking closes', type: 'number', min: 0, suffix: 'min before', hint: '0 = until the session starts' },
    {
      key: 'levelEnforcement',
      label: 'Level check',
      type: 'select',
      options: [
        { value: 'block', label: 'Block booking outside the range' },
        { value: 'warn', label: 'Warn but allow' },
        { value: 'off', label: 'Off' },
      ],
    },
    { key: 'levelTolerance', label: 'Level tolerance', type: 'number', min: 0, max: 5, suffix: 'levels', hint: 'How many levels outside the session range are still allowed' },
    { key: 'allowOverlappingBookings', label: 'Allow overlapping bookings for one client', type: 'boolean' },
  ],
  cancellation: [
    {
      key: 'mode',
      label: 'Free cancellation rule',
      type: 'select',
      options: [
        { value: 'PREVIOUS_DAY_AT', label: 'Until a time on the previous day' },
        { value: 'HOURS_BEFORE', label: 'Until N hours before the start' },
      ],
    },
    { key: 'previousDayTime', label: 'Previous-day deadline', type: 'time', hint: 'Used with “until a time on the previous day”' },
    { key: 'hoursBefore', label: 'Hours before', type: 'number', min: 0, max: 168, suffix: 'hours', hint: 'Used with “N hours before”' },
    { key: 'graceMinutesAfterBooking', label: 'Grace period after booking', type: 'number', min: 0, max: 120, suffix: 'min', hint: 'A late booking can still be cancelled free within this time' },
  ],
  sessions: [
    { key: 'defaultDurationMinutes', label: 'Default length', type: 'number', min: 15, suffix: 'min' },
    { key: 'defaultCapacity', label: 'Default group size', type: 'number', min: 1, suffix: 'people' },
    { key: 'almostFullThreshold', label: '“Almost full” when', type: 'number', min: 0, suffix: 'seats left' },
    { key: 'generateWeeksAhead', label: 'Generate templates', type: 'number', min: 1, max: 26, suffix: 'weeks ahead' },
  ],
  attendance: [
    { key: 'autoFinalizeAfterMinutes', label: 'Finalise attendance', type: 'number', min: 0, suffix: 'min after end' },
    {
      key: 'unmarkedOutcome',
      label: 'Unmarked bookings become',
      type: 'select',
      options: [
        { value: 'NO_SHOW', label: 'No-show (visit used)' },
        { value: 'ATTENDED', label: 'Attended' },
      ],
    },
    { key: 'teacherWindowBeforeMinutes', label: 'Teachers can mark from', type: 'number', min: 0, suffix: 'min before start' },
    { key: 'teacherWindowAfterMinutes', label: 'Teachers can mark until', type: 'number', min: 0, suffix: 'min after end' },
    { key: 'qrCheckinEnabled', label: 'QR check-in', type: 'boolean', hint: 'Clients show a QR code that teachers or reception scan' },
  ],
  feedback: [
    { key: 'enabled', label: 'Teachers can write feedback', type: 'boolean' },
    { key: 'visibleToClients', label: 'Clients see feedback in their progress page', type: 'boolean' },
  ],
  memberships: [
    { key: 'defaultValidityDays', label: 'Default validity', type: 'number', min: 1, suffix: 'days' },
    { key: 'lowVisitsThreshold', label: '“Few visits left” at', type: 'number', min: 0, suffix: 'visits' },
  ],
  trial: [
    { key: 'enabled', label: 'Offer trial sessions', type: 'boolean' },
    { key: 'price', label: 'Trial price', type: 'number', min: 0, suffix: '₸' },
    { key: 'maxPerClient', label: 'Trials per client', type: 'number', min: 0, max: 10 },
    { key: 'allowSelfBooking', label: 'Clients can book a trial themselves', type: 'boolean' },
  ],
  waitlist: [
    { key: 'enabled', label: 'Waitlist for full sessions', type: 'boolean' },
    { key: 'offerMinutes', label: 'Reserve a freed seat for', type: 'number', min: 5, suffix: 'min' },
    { key: 'stopOffersMinutesBeforeStart', label: 'Open the seat to everyone', type: 'number', min: 0, suffix: 'min before start' },
  ],
  notifications: [
    { key: 'sessionReminderOffsetsMinutes', label: 'Session reminders (minutes before)', type: 'numbers', hint: 'e.g. 1440, 120 = a day and two hours before' },
    { key: 'adminAlerts.newRegistration', label: 'Alert staff: new registration', type: 'boolean' },
    { key: 'adminAlerts.newTrial', label: 'Alert staff: new trial request', type: 'boolean' },
    { key: 'adminAlerts.paymentReceived', label: 'Alert staff: payment received', type: 'boolean' },
    { key: 'adminAlerts.sessionFull', label: 'Alert staff: session full', type: 'boolean' },
    { key: 'adminAlerts.cancellation', label: 'Alert staff: cancellations', type: 'boolean' },
    { key: 'adminAlerts.noShow', label: 'Alert staff: no-shows', type: 'boolean' },
    { key: 'adminAlerts.waitlistOpportunity', label: 'Alert staff: waitlist demand', type: 'boolean' },
    { key: 'adminAlerts.membershipExpiring', label: 'Alert staff: memberships expiring', type: 'boolean' },
    { key: 'adminAlerts.dataRequest', label: 'Alert staff: data deletion requests', type: 'boolean' },
  ],
  crm: [
    { key: 'expiringSoonDays', label: '“Expiring soon” within', type: 'number', min: 1, suffix: 'days' },
    { key: 'inactiveAfterDays', label: 'Inactive after', type: 'number', min: 1, suffix: 'days without a visit' },
    { key: 'newClientDays', label: '“New client” for', type: 'number', min: 1, suffix: 'days' },
    { key: 'vipVisitsPer30Days', label: 'VIP from', type: 'number', min: 1, suffix: 'visits / 30 days' },
    { key: 'lostAfterDays', label: 'Lead lost after', type: 'number', min: 1, suffix: 'days' },
  ],
  referrals: [
    { key: 'enabled', label: 'Referral programme', type: 'boolean' },
    { key: 'rewardDescription', label: 'Reward description (shown to clients)', type: 'textarea' },
  ],
  branding: [
    { key: 'primaryColor', label: 'Primary colour', type: 'color' },
    { key: 'accentColor', label: 'Accent colour', type: 'color' },
    { key: 'logoUrl', label: 'Logo URL', type: 'text', hint: 'Optional; the default Talk Club logo is used otherwise' },
  ],
} satisfies Record<string, FieldSpec[]>;

function Integrations() {
  const tr = useT(settingsMessages);
  const { data } = useQuery({ queryKey: ['admin', 'integrations'], queryFn: () => call(api.GET('/api/admin/settings/integrations')) });
  return (
    <Section title={tr.messagingChannels} description={tr.providersConfiguredServerEnvironment}>
      <Card padded={false} className="divide-y divide-line/70">
        {data?.channels.map((c) => (
          <div key={c.channel} className="flex items-center gap-3 px-5 py-3 text-sm">
            {c.configured ? <CheckCircle2 className="h-4 w-4 text-success-600" /> : <CircleDashed className="h-4 w-4 text-subtle" />}
            <span className="w-28 font-semibold">{c.channel}</span>
            <span className="text-muted">{c.provider}</span>
            <span className="ml-auto text-xs text-muted">{c.configured ? tr.ready : tr.notConfigured}</span>
          </div>
        ))}
      </Card>
    </Section>
  );
}

function Settings() {
  const tr = useT(settingsMessages);
  const url = useUrlState();
  const canSettings = useCan('settings.manage');
  const canRooms = useCan('rooms.manage');
  const canCatalog = useCan('catalog.manage');
  const allowed = SECTIONS.filter((s) => (s.permission === 'settings.manage' ? canSettings : s.permission === 'rooms.manage' ? canRooms : canCatalog));
  const section = allowed.find((s) => s.id === url.get('section'))?.id ?? allowed[0]?.id;
  const query = useQuery({
    queryKey: adminKeys.settings,
    queryFn: async () => (await call(api.GET('/api/admin/settings'))) as unknown as SettingsGroups,
    enabled: canSettings,
  });
  const s = query.data;
  const needsSettings = !['location', 'catalog'].includes(section ?? '');

  return (
    <AdminPage title={tr.settings} description={tr.businessRulesContentResources}>
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label={tr.settingsSections}>
          {allowed.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => url.set({ section: x.id })}
              className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-medium transition lg:whitespace-normal', section === x.id ? 'bg-brand-700 text-white' : 'text-ink hover:bg-brand-50')}
            >
              {tr.fieldText[x.label] ?? x.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">
          {needsSettings && query.error ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : needsSettings && !s ? (
            <Skeleton className="h-96 w-full rounded-3xl" />
          ) : (
            <>
              {section === 'club' && s && <SettingsGroupForm group="club" value={s.club} fields={F.club} title={tr.clubProfile} description={tr.shownContactPageMessages} />}
              {section === 'booking' && s && (
                <>
                  <SettingsGroupForm group="booking" value={s.booking} fields={F.booking} title={tr.bookingRules} />
                  <SettingsGroupForm group="cancellation" value={s.cancellation} fields={F.cancellation} title={tr.cancellationPolicy} description={tr.changesApplyFutureDeadlines} />
                </>
              )}
              {section === 'sessions' && s && (
                <>
                  <SettingsGroupForm group="sessions" value={s.sessions} fields={F.sessions} title={tr.sessions} />
                  <SettingsGroupForm group="attendance" value={s.attendance} fields={F.attendance} title={tr.attendance} />
                  <SettingsGroupForm group="feedback" value={s.feedback} fields={F.feedback} title={tr.teacherFeedback} />
                </>
              )}
              {section === 'memberships' && s && (
                <>
                  <SettingsGroupForm
                    group="memberships"
                    value={s.memberships}
                    fields={F.memberships}
                    title={tr.memberships}
                    description={
                      <>
                        {tr.plansManagedIn}{' '}
                        <Link href="/admin/memberships?tab=plans" className="font-semibold text-brand-700">
                          {tr.membershipsPlans}
                        </Link>
                        .
                      </>
                    }
                  />
                  <SettingsGroupForm group="trial" value={s.trial} fields={F.trial} title={tr.trialSessions} />
                  <SettingsGroupForm group="waitlist" value={s.waitlist} fields={F.waitlist} title={tr.waitlist} />
                </>
              )}
              {section === 'notifications' && s && (
                <>
                  <SettingsGroupForm
                    group="notifications"
                    value={s.notifications}
                    fields={F.notifications}
                    title={tr.notifications}
                    description={
                      <>
                        {tr.textsEditedIn}{' '}
                        <Link href="/admin/notifications" className="font-semibold text-brand-700">
                          {tr.notifications}
                        </Link>
                        .
                      </>
                    }
                  />
                  <Integrations />
                </>
              )}
              {section === 'crm' && s && (
                <>
                  <SettingsGroupForm group="crm" value={s.crm} fields={F.crm} title={tr.crmThresholds} description={tr.usedSegmentsPipelineAutomations} />
                  <SettingsGroupForm group="referrals" value={s.referrals} fields={F.referrals} title={tr.referrals} />
                </>
              )}
              {section === 'branding' && s && <SettingsGroupForm group="branding" value={s.branding} fields={F.branding} title={tr.branding} description={tr.coloursApplyClientApp} />}
              {section === 'content' && s && <ContentSection value={s.content as never} />}
              {section === 'legal' && <LegalSection />}
              {section === 'location' && <LocationsSection />}
              {section === 'catalog' && <CatalogSection />}
              {section === 'payments' && <PaymentMethodsSection />}
            </>
          )}
        </div>
      </div>
    </AdminPage>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
