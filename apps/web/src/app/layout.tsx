import type { Metadata, Viewport } from 'next';
import { Manrope, Unbounded } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

const body = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-body', display: 'swap' });
const heading = Unbounded({ subsets: ['latin', 'cyrillic'], variable: '--font-heading', display: 'swap', weight: ['500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'Talk Club — English Speaking Club in Almaty', template: '%s · Talk Club' },
  description:
    'Speak English with native speakers in small groups of up to 7. Book sessions, manage your membership and track your progress — Talk Club, Zheltoksan 118, Almaty.',
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
