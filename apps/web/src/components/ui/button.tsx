import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent' | 'white' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-700 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-300 disabled:shadow-none',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200 disabled:opacity-50',
  outline: 'border border-line bg-white text-ink hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-50',
  ghost: 'text-ink hover:bg-brand-50 active:bg-brand-100 disabled:opacity-40',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-50',
  accent: 'bg-zest text-brand-950 hover:brightness-95 active:brightness-90 disabled:opacity-50',
  white: 'bg-white text-brand-800 shadow-sm hover:bg-brand-50 disabled:opacity-60',
  link: 'text-brand-700 underline-offset-4 hover:underline disabled:opacity-50 !px-0 !h-auto',
};

const sizes: Record<ButtonSize, string> = {
  xs: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-14 px-6 text-base gap-2.5 rounded-2xl',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string): string {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-150 active:scale-[0.98] disabled:active:scale-100',
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, leftIcon, rightIcon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, cn(block && 'w-full', className))}
      {...props}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink transition hover:bg-brand-50 active:scale-95 disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
