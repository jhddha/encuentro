import type { ReactNode } from 'react';

/**
 * Los cinco estados canónicos de pantalla (regla 05-ui-accessibility):
 * loading, empty, error, success y readonly.
 *
 * Cada uno anuncia su cambio a lectores de pantalla con la región aria
 * adecuada: `status` para lo informativo, `alert` para lo que interrumpe.
 */

interface StateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

const shell = 'flex flex-col items-start gap-3 rounded-lg border p-6';

export function LoadingState({ title = 'Cargando…' }: { readonly title?: string }) {
  return (
    <div role="status" aria-live="polite" className={`${shell} border-[var(--color-ink)]/20`}>
      <p className="text-base">{title}</p>
    </div>
  );
}

export function EmptyState({ title, description, action }: StateProps) {
  return (
    <div className={`${shell} border-dashed border-[var(--color-ink)]/30`}>
      <h2 className="text-lg font-medium">{title}</h2>
      {description !== undefined && <p className="text-sm">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, description, action }: StateProps) {
  return (
    <div role="alert" className={`${shell} border-[var(--color-danger)]`}>
      <h2 className="text-lg font-medium text-[var(--color-danger)]">
        <span aria-hidden="true">✕ </span>
        {title}
      </h2>
      {description !== undefined && <p className="text-sm">{description}</p>}
      {action}
    </div>
  );
}

export function SuccessState({ title, description, action }: StateProps) {
  return (
    <div role="status" aria-live="polite" className={`${shell} border-[var(--color-success)]`}>
      <h2 className="text-lg font-medium text-[var(--color-success)]">
        <span aria-hidden="true">✓ </span>
        {title}
      </h2>
      {description !== undefined && <p className="text-sm">{description}</p>}
      {action}
    </div>
  );
}

/**
 * Estado de solo lectura.
 *
 * Se usa cuando la gestión está cerrada (GOV-004) o cuando el usuario carece
 * del permiso de escritura: el contenido se ve, pero no se edita.
 */
export function ReadonlyState({ title, description }: StateProps) {
  return (
    <div className={`${shell} border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5`}>
      <h2 className="text-lg font-medium">{title}</h2>
      {description !== undefined && <p className="text-sm">{description}</p>}
    </div>
  );
}
