import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TeacherShell } from '@/components/teacher/teacher-shell';
import { metaMessages } from '@/lib/i18n/messages/system';
import { serverMessages } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { teacher } = await serverMessages(metaMessages);
  return { title: { default: teacher, template: `%s · Talk Club ${teacher}` }, robots: { index: false } };
}

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}
