'use client';

import { ChevronDown } from 'lucide-react';
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { formatPhoneInput } from '@/lib/format';
import { messagesFor } from '@/lib/i18n/active';
import { uiMessages } from '@/lib/i18n/messages/ui';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-subtle transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-canvas disabled:text-muted';

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
          {label}
          {required && <span className="ml-0.5 text-danger-600">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-sm text-danger-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leftIcon, rightSlot, ...props },
  ref,
) {
  return (
    <div className="relative">
      {leftIcon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle">{leftIcon}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(control, 'h-12', leftIcon && 'pl-10', rightSlot && 'pr-12', invalid && 'border-danger-600 focus:ring-danger-50', className)}
        {...props}
      />
      {rightSlot && <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightSlot}</span>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, rows = 4, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || undefined}
        className={cn(control, 'py-3 leading-relaxed', invalid && 'border-danger-600', className)}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(control, 'h-12 appearance-none pr-10', invalid && 'border-danger-600', className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
    );
  },
);

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60', className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-md border-line accent-brand-700"
      />
      <span className="text-sm leading-snug">
        <span className="text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-4', disabled && 'opacity-60')}>
      {label && (
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <span className="block text-sm font-medium text-ink">{label}</span>
          {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-brand-700' : 'bg-line',
        )}
      >
        <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </div>
  );
}

export interface ChipOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  multiple,
  size = 'md',
  className,
}: {
  options: ChipOption<T>[];
  value: T[] | T | null;
  onChange: (value: T[] | T) => void;
  multiple?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const selected = Array.isArray(value) ? value : value === null ? [] : [value];
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role={multiple ? 'group' : 'radiogroup'}>
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={String(o.value)}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={active}
            onClick={() => {
              if (multiple) onChange((active ? selected.filter((v) => v !== o.value) : [...selected, o.value]) as T[]);
              else onChange(o.value);
            }}
            className={cn(
              'rounded-full border font-semibold transition active:scale-95',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              active ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:border-brand-300',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Kazakhstan phone input: always shows +7 XXX XXX XX XX. */
export function PhoneInput({
  value,
  onChange,
  invalid,
  autoFocus,
  id,
}: {
  value: string;
  onChange: (formatted: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  return (
    <Input
      id={id}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      autoFocus={autoFocus}
      placeholder="+7 7XX XXX XX XX"
      value={value}
      invalid={invalid}
      onChange={(e) => onChange(formatPhoneInput(e.target.value))}
      onFocus={(e) => {
        if (!e.target.value) onChange('+7 ');
      }}
      className="text-lg font-semibold tracking-wide"
    />
  );
}

/** One-time code input with iOS/Android SMS autofill support. */
export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        autoFocus={autoFocus}
        aria-label={messagesFor(uiMessages).verificationCode}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length }).map((_, i) => {
          const char = value[i];
          const active = i === value.length;
          return (
            <div
              key={i}
              className={cn(
                'flex h-14 items-center justify-center rounded-xl border-2 bg-white font-display text-2xl font-semibold transition',
                invalid ? 'border-danger-600' : active ? 'border-brand-500 ring-4 ring-brand-100' : char ? 'border-brand-200' : 'border-line',
              )}
            >
              {char ?? ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
