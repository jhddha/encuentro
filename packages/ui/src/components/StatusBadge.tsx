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
 * símbolo propio, así que el estado se lee en escala de grises, con daltonismo
 * o con colores forzados por el usuario.
 *
 * El color va en el **borde y el símbolo**, no en el texto. Varios tonos de la
 * paleta no alcanzan 4.5:1 como texto sobre `--color-ivory` — `--color-warning`
 * (#D98E04) se queda en 2.46:1 —, así que la etiqueta usa `--color-ink`, que
 * contrasta de sobra, y el color sigue cumpliendo su función de señal.
 */
const tones: Record<StatusTone, { readonly className: string; readonly symbol: string }> = {
  neutral: { className: 'border-[var(--color-ink)]', symbol: '•' },
  success: { className: 'border-[var(--color-success)]', symbol: '✓' },
  warning: { className: 'border-[var(--color-warning)]', symbol: '!' },
  danger: { className: 'border-[var(--color-danger)]', symbol: '✕' },
  info: { className: 'border-[var(--color-info)]', symbol: 'i' },
  progress: { className: 'border-[var(--color-gold)]', symbol: '◐' },
};

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  const { className, symbol } = tones[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-medium text-[var(--color-ink)] ${className}`}
    >
      <span aria-hidden="true">{symbol}</span>
      {children}
    </span>
  );
}
