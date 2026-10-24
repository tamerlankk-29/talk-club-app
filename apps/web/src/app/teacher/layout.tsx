import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TeacherShell } from '@/components/teacher/teacher-shell';

export const metadata: Metadata = { title: { default: 'Teacher', template: '%s · Talk Club Teacher' }, robots: { index: false } };

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}
