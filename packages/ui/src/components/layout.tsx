import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-ink)]/15 pb-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl">{title}</h1>
        {description !== undefined && <p className="text-sm">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

/**
 * Enlace de salto al contenido.
 *
 * WCAG 2.2 AA criterio 2.4.1: permite a quien navega con teclado evitar la
 * navegación repetida. Invisible hasta recibir foco.
 */
export function SkipLink({ href = '#contenido' }: { readonly href?: string }) {
  return (
    <a
      href={href}
      className="sr-only rounded-md bg-[var(--color-ink)] px-4 py-2 text-[var(--color-ivory)] focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
    >
      Saltar al contenido
    </a>
  );
}

export function VisuallyHidden({ children }: { readonly children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/**
 * Contenedor de tabla.
 *
 * `design-system.md` §4: «Tablas hacen scroll dentro del componente», nunca
 * empujando el ancho de la página. `tabIndex` lo hace alcanzable por teclado,
 * porque una región con scroll debe poder recorrerse sin ratón.
 */
export function ScrollableTable({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
    >
      {children}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-[var(--color-ink)]/15 bg-[var(--color-ivory)] p-6 ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
