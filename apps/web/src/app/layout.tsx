import type { Metadata, Viewport } from 'next';
import { Manrope, Unbounded } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from '@/lib/i18n/config';
import { metaMessages } from '@/lib/i18n/messages/system';
import { serverMessages } from '@/lib/i18n/server';
import './globals.css';
import { Providers } from './providers';

const body = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-body', display: 'swap' });
const heading = Unbounded({ subsets: ['latin', 'cyrillic'], variable: '--font-heading', display: 'swap', weight: ['500', '600', '700'] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await serverMessages(metaMessages);
  return {
    title: { default: t.siteTitle, template: '%s · Talk Club' },
    description: t.siteDescription,
    ...staticMetadata,
  };
}

const staticMetadata: Metadata = {
  applicationName: 'Talk Club',
  appleWebApp: { capable: true, title: 'Talk Club', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#6d28d9',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE;
  return (
    <html lang={locale} className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
