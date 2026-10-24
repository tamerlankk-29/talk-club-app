import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Talk Club — English Speaking Club',
    short_name: 'Talk Club',
    description: 'Book speaking sessions with native English speakers, track your membership and progress.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f5fb',
    theme_color: '#6d28d9',
    lang: 'en',
    categories: ['education', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Book a session', short_name: 'Book', url: '/schedule', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'My bookings', short_name: 'Bookings', url: '/bookings', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'My membership', short_name: 'Membership', url: '/membership', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
