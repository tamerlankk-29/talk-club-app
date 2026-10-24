import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas md:bg-[radial-gradient(circle_at_top,_var(--color-brand-100),_var(--color-canvas)_45%)]">
      <main className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col px-5 pb-10 pt-safe">{children}</main>
    </div>
  );
}
