import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}

/*
 * Tamaño de texto y contraste.
 *
 * `--color-flame` (#D63B2F) sobre `--color-ivory` (#F7F2EA) da 4.14:1, por
 * debajo del 4.5:1 que WCAG 2.2 AA exige para texto normal. El token es
 * canónico (`design-system.md` §3) y no se altera aquí.
 *
 * WCAG define un umbral de 3:1 para «texto grande»: al menos 18.66 px en
 * negrita. A 19 px/700 el par cumple el criterio 1.4.3 sin tocar la paleta.
 *
 * Sigue siendo una tensión entre §3 y `requirements.md` §10 que conviene
 * resolver en el sistema visual; ver informe de P04.
 */
const base =
  'inline-flex min-h-[var(--size-touch-target)] items-center justify-center gap-2 rounded-md px-5 text-[19px] font-bold ' +
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
