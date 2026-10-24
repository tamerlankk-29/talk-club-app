import Link from 'next/link';
import { LogoMark } from '@/components/icons';
import { buttonClasses } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <LogoMark className="h-14 w-14" />
      <div>
        <p className="font-display text-5xl font-semibold text-brand-700">404</p>
        <h1 className="mt-2 font-display text-xl font-semibold">This page doesn&apos;t exist</h1>
        <p className="mt-1 text-sm text-muted">The link may be old or mistyped.</p>
      </div>
      <Link href="/" className={buttonClasses('primary')}>
        Go home
      </Link>
    </main>
  );
}
