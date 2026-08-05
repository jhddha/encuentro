import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'progress';

export interface StatusBadgeProps {
  readonly tone: StatusTone;
  readonly children: ReactNode;
}

/**
 * Distintivo de estado.
 *
 * `design-system.md` §3: «Nunca depender solo del color». Cada tono lleva un
 * símbolo propio, así que el estado sigue siendo legible en escala de grises,
 * con daltonismo o si el usuario fuerza sus propios colores.
 */
const tones: Record<StatusTone, { readonly className: string; readonly symbol: string }> = {
  neutral: { className: 'border-[var(--color-ink)] text-[var(--color-ink)]', symbol: '•' },
  success: { className: 'border-[var(--color-success)] text-[var(--color-success)]', symbol: '✓' },
  warning: { className: 'border-[var(--color-warning)] text-[var(--color-warning)]', symbol: '!' },
  danger: { className: 'border-[var(--color-danger)] text-[var(--color-danger)]', symbol: '✕' },
  info: { className: 'border-[var(--color-info)] text-[var(--color-info)]', symbol: 'i' },
  progress: { className: 'border-[var(--color-gold)] text-[var(--color-gold)]', symbol: '◐' },
};

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  const { className, symbol } = tones[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${className}`}
    >
      <span aria-hidden="true">{symbol}</span>
      {children}
    </span>
  );
}
