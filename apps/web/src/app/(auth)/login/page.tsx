import type { Metadata } from 'next';
import { metaMessages } from '@/lib/i18n/messages/system';
import { serverMessages } from '@/lib/i18n/server';
import { Suspense } from 'react';
import { AuthFlow } from '@/components/auth/auth-flow';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await serverMessages(metaMessages)).signIn };
}

export default function LoginPage() {
  return (
    <Suspense>
      <AuthFlow mode="login" />
    </Suspense>
  );
}
