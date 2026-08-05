import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}

const base =
  'inline-flex min-h-[var(--size-touch-target)] items-center justify-center gap-2 rounded-md px-4 text-base font-medium ' +
  // El foco debe ser visible siempre: WCAG 2.2 AA, criterio 2.4.11.
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-flame)] text-[var(--color-ivory)] hover:brightness-110',
  secondary:
    'border border-[var(--color-ink)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-ink)]/5',
  danger: 'bg-[var(--color-danger)] text-[var(--color-ivory)] hover:brightness-110',
};

export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${className ?? ''}`} {...rest}>
      {children}
    </button>
  );
}
