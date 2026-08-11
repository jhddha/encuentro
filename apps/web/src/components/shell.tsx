import { PageHeader, ReadonlyState } from '@encuentro/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AccountBar } from '@/components/account-bar';

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Navegación de shell.
 *
 * `aria-current="page"` la marca el consumidor, no este componente: en App
 * Router la ruta activa se conoce en el segmento que la renderiza.
 */
export function ShellNav({
  items,
  label,
  currentHref,
}: {
  readonly items: readonly NavItem[];
  readonly label: string;
  readonly currentHref?: string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.href === currentHref ? 'page' : undefined}
              className="inline-flex min-h-[var(--size-touch-target)] items-center rounded-md px-3 text-sm hover:bg-[var(--color-ink)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] aria-[current=page]:bg-[var(--color-ink)] aria-[current=page]:text-[var(--color-ivory)]"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Shell({
  title,
  nav,
  children,
}: {
  readonly title: ReactNode;
  readonly nav?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-[var(--color-ink)]/15">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <span className="font-[family-name:var(--font-display)] text-xl">{title}</span>

          {/* Navegación y sesión comparten el extremo derecho; con `nav`
              ausente, `AccountBar` ocupa su lugar sin dejar hueco. */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
            {nav}
            <AccountBar />
          </div>
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
        {children}
      </main>

      <footer className="border-t border-[var(--color-ink)]/15 p-4 text-center text-xs">
        Sistema web ENCUENTRO v2.7
      </footer>
    </div>
  );
}

/**
 * Marcador de pantalla pendiente.
 *
 * Cada ruta del contrato existe desde P02, pero su contenido llega en la fase
 * que tiene el requisito. Se renderiza como estado de solo lectura y nombra la
 * fase responsable, en vez de inventar datos o dejar la página en blanco.
 */
export function PendingScreen({
  title,
  phase,
  scope,
}: {
  readonly title: string;
  readonly phase: string;
  readonly scope: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Toda página necesita exactamente un h1: sin él, la navegación por
          encabezados de un lector de pantalla empieza en el vacío. */}
      <PageHeader title={title} />
      <ReadonlyState
        title="Pendiente de implementación"
        description={`${scope} Esta pantalla se implementa en ${phase}.`}
      />
    </div>
  );
}
