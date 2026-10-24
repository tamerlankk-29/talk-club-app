import { cn } from '@/lib/utils';

/** Talk Club mark: a speech bubble with three dots — the last one lime. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn('h-9 w-9', className)} aria-hidden="true">
      <rect width="512" height="512" rx="128" fill="var(--color-brand-700)" />
      <path d="M140 150h232a44 44 0 0 1 44 44v118a44 44 0 0 1-44 44H260l-78 60v-60h-42a44 44 0 0 1-44-44V194a44 44 0 0 1 44-44z" fill="#fff" />
      <circle cx="194" cy="253" r="24" fill="var(--color-brand-700)" />
      <circle cx="256" cy="253" r="24" fill="var(--color-brand-700)" />
      <circle cx="318" cy="253" r="24" fill="var(--color-zest)" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className={cn('font-display text-lg font-semibold tracking-tight', light ? 'text-white' : 'text-ink')}>
        Talk Club
      </span>
    </span>
  );
}

type IconProps = { className?: string };

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-5 w-5', className)} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WhatsAppIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-5 w-5', className)} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.2.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.3-.3-.4-.5-.5z" />
    </svg>
  );
}

export function TelegramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-5 w-5', className)} fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.6 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.8-8c.4-.3-.1-.5-.6-.2L6.6 13.2 2 11.8c-1-.3-1-1 .2-1.5l18.4-7.1c.8-.3 1.6.2 1.3 1.4z" />
    </svg>
  );
}

export function TikTokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-5 w-5', className)} fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.8A4.8 4.8 0 0 1 15.4 2.5h-3.2v12.8a2.7 2.7 0 1 1-2.7-2.7c.3 0 .5 0 .8.1V9.4a6 6 0 1 0 5.1 5.9V8.8a7.9 7.9 0 0 0 4.6 1.5V7.1a4.8 4.8 0 0 1-3.4-1.3z" />
    </svg>
  );
}
