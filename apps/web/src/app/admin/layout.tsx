import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { metaMessages } from '@/lib/i18n/messages/system';
import { serverMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await serverMessages(metaMessages);
  return { title: { default: admin, template: `%s · Talk Club ${admin}` }, robots: { index: false } };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
