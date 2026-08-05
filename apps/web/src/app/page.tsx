import { EVENT_STATES } from '@encuentro/domain';

/**
 * Landing pública.
 *
 * EVT-004 exige que resuelva una única gestión pública, lo que requiere base de
 * datos y el módulo Events (P03). Hasta entonces esta página solo confirma que
 * el toolchain compila y que la capa de dominio es alcanzable desde
 * presentación.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 p-6">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Encuentro</h1>
      <p>
        Línea base v2.7. La landing pública se implementa en P03, cuando exista el módulo Events.
      </p>
      <p className="text-sm">Estados de gestión definidos en el contrato: {EVENT_STATES.length}.</p>
    </main>
  );
}
