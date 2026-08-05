import { PageHeader, ReadonlyState } from '@encuentro/ui';

import { Shell } from '@/components/shell';

/**
 * Landing pública.
 *
 * EVT-004 y EVT-006: debe resolver la única gestión públicamente habilitada.
 * Eso requiere el módulo Events, que llega en P03; hasta entonces no hay
 * ninguna gestión que resolver y la página lo dice en lugar de fingir una.
 */
export default function HomePage() {
  return (
    <Shell title="Encuentro">
      <div className="flex flex-col gap-6">
        <PageHeader title="Encuentro" description="La Mansión" />
        <ReadonlyState
          title="No hay ninguna gestión publicada"
          description="La landing resuelve la única gestión en estado ACTIVE. La creación y publicación de gestiones se implementa en P03."
        />
      </div>
    </Shell>
  );
}
