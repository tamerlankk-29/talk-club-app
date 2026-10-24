import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthFlow } from '@/components/auth/auth-flow';

export const metadata: Metadata = { title: 'Join Talk Club' };

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthFlow mode="register" />
    </Suspense>
  );
}
